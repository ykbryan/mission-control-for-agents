import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters, resolveRouter } from "@/lib/router-config";

interface RouterSession {
  key: string;
  updatedAt?: number;
  totalTokens?: number;
}

export interface SessionDetail {
  key: string;
  updatedAt: number;
  totalTokens: number;
  label: string;  // human-readable key summary
}

export interface SessionGroup {
  type: string;
  label: string;
  icon: string;
  count: number;
  lastUpdated: number;
  totalTokens: number;
  sessions: SessionDetail[];
}

function humaniseKey(key: string): string {
  // agent:evelyn:telegram:group:123456:topic:7 → "Group 123456 / Topic 7"
  // agent:evelyn:cron:daily-briefing → "daily-briefing"
  // agent:evelyn:main → "main"
  const parts = key.split(":");
  const kind = parts[2] ?? "";
  if (kind === "telegram") {
    const sub = parts[3] ?? "";
    if (sub === "group") {
      const chatId = parts[4] ?? "?";
      const topicId = parts[6] ?? "";
      return topicId ? `Group ${chatId} / Topic ${topicId}` : `Group ${chatId}`;
    }
    if (sub === "direct") return `DM ${parts[4] ?? "?"}`;
    if (sub === "slash") return `Cmd ${parts[4] ?? "?"}`;
    return key;
  }
  if (kind === "cron") return parts.slice(3).join(":") || "cron";
  if (kind === "subagent") return parts.slice(3).join(":") || "subagent";
  return parts.slice(2).join(":") || key;
}

function classifySession(key: string): { type: string; label: string; icon: string } {
  const parts = key.split(":");
  const kind = parts[2];
  if (!kind || kind === "main") return { type: "main", label: "Main", icon: "🖥️" };
  if (kind === "cron")          return { type: "cron", label: "Cron Jobs", icon: "⏰" };
  if (kind === "subagent")      return { type: "subagent", label: "Subagents", icon: "🤖" };
  if (kind === "telegram") {
    const sub = parts[3];
    if (sub === "direct")       return { type: "tg-direct", label: "Telegram Direct", icon: "💬" };
    if (sub === "slash")        return { type: "tg-slash", label: "Telegram Commands", icon: "⚡" };
    if (sub === "group") {
      if (parts[5] === "topic") return { type: "tg-topic", label: "Telegram Topics", icon: "📢" };
      return                           { type: "tg-group", label: "Telegram Groups", icon: "👥" };
    }
    return                             { type: "telegram", label: "Telegram", icon: "✈️" };
  }
  return { type: kind, label: kind, icon: "📋" };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  if (!agentId) return NextResponse.json({ error: "Missing agent" }, { status: 400 });

  const routerId = searchParams.get("routerId") ?? "legacy";
  const routers = parseRouters(req.cookies.get("routers")?.value);
  const resolved = resolveRouter(
    routers, routerId,
    req.cookies.get("routerUrl")?.value,
    req.cookies.get("routerToken")?.value
  );

  if (!resolved) {
    return NextResponse.json({ error: `Router "${routerId}" not configured` }, { status: 404 });
  }
  const { url: routerUrl, token: routerToken } = resolved;

  try {
    const data = await routerGet<{ sessions: RouterSession[] }>(
      routerUrl, routerToken, "/sessions", { agentId }
    );

    const sessions = data.sessions ?? [];
    const groupMap = new Map<string, SessionGroup>();

    for (const s of sessions) {
      const { type, label, icon } = classifySession(s.key);
      const existing = groupMap.get(type) ?? { type, label, icon, count: 0, lastUpdated: 0, totalTokens: 0, sessions: [] };
      existing.count++;
      existing.lastUpdated = Math.max(existing.lastUpdated, s.updatedAt ?? 0);
      existing.totalTokens += s.totalTokens ?? 0;
      existing.sessions.push({
        key: s.key,
        updatedAt: s.updatedAt ?? 0,
        totalTokens: s.totalTokens ?? 0,
        label: humaniseKey(s.key),
      });
      groupMap.set(type, existing);
    }

    // Sort sessions within each group newest first
    for (const g of groupMap.values()) {
      g.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // Sort by lastUpdated desc
    const groups = Array.from(groupMap.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);
    return NextResponse.json({ groups, total: sessions.length });
  } catch {
    return NextResponse.json({ groups: [], total: 0 });
  }
}
