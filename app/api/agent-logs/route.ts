import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";

interface RouterSession {
  key: string;
  displayName?: string;
  label?: string;
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
}

export async function GET(req: NextRequest) {
  const agentId = new URL(req.url).searchParams.get("agent");
  if (!agentId) return NextResponse.json({ error: "Missing agent" }, { status: 400 });

  const routerUrl = req.cookies.get("routerUrl")?.value;
  const routerToken = req.cookies.get("routerToken")?.value;
  if (!routerUrl || !routerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await routerGet<{ sessions: RouterSession[] }>(
      routerUrl, routerToken, "/sessions", { agentId }
    );
    const logs = (data.sessions ?? []).slice(0, 10).map((s) => {
      const label = s.label ?? s.displayName ?? s.key;
      const tokens = s.totalTokens ? `${s.totalTokens.toLocaleString()} tokens` : "";
      const model = s.model ? `[${s.model.split("/").pop()}]` : "";
      return {
        timestamp: new Date(s.updatedAt ?? Date.now()).toISOString(),
        text: [model, label, tokens].filter(Boolean).join(" — "),
      };
    });
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json([]);
  }
}
