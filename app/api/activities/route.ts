import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

export interface ActivitySession {
  key: string;
  agentId: string;
  type: string;       // "cron" | "subagent" | "main" | "telegram" | ...
  context: string | null;
  updatedAt: number;  // ms
  totalTokens: number;
  isActive: boolean;
  routerId: string;
  routerLabel: string;
  // derived
  label: string;
  icon: string;
}

function humaniseContext(type: string, context: string | null, key: string): { label: string; icon: string } {
  if (!context) return { label: type, icon: "📋" };
  if (type === "cron") return { label: context, icon: "⏰" };
  if (type === "subagent") return { label: `→ ${context}`, icon: "🤖" };
  if (type === "telegram") {
    const parts = context.split(":");
    if (parts[0] === "group" && parts[2] === "topic") return { label: `Group ${parts[1]} / Topic ${parts[3]}`, icon: "📢" };
    if (parts[0] === "group") return { label: `Group ${parts[1]}`, icon: "👥" };
    if (parts[0] === "direct") return { label: `DM ${parts[1]}`, icon: "💬" };
    if (parts[0] === "slash") return { label: `/${parts[1]}`, icon: "⚡" };
    return { label: context, icon: "✈️" };
  }
  if (type === "main") return { label: "Main session", icon: "🖥️" };
  return { label: context || type, icon: "📋" };
}

interface RouterAllSessions {
  sessions: {
    key: string;
    agentId: string;
    type: string;
    context: string | null;
    updatedAt: number;
    totalTokens: number;
    isActive: boolean;
  }[];
}

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await Promise.allSettled(
    routers.map(r => routerGet<RouterAllSessions>(r.url, r.token, "/all-sessions"))
  );

  const all: ActivitySession[] = [];

  for (let i = 0; i < routers.length; i++) {
    const r = routers[i];
    const result = results[i];
    if (result.status !== "fulfilled") continue;
    for (const s of result.value.sessions ?? []) {
      const { label, icon } = humaniseContext(s.type, s.context, s.key);
      all.push({ ...s, routerId: r.id, routerLabel: r.label, label, icon });
    }
  }

  all.sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ sessions: all });
}
