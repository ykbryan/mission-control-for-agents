import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";
import type { ActivityEvent } from "@/lib/parse-session";

export const dynamic = "force-dynamic";

export interface Incident {
  id: string;
  agentId: string;
  routerId: string;
  routerLabel: string;
  type: "model_fallback" | "api_error" | "tool_error";
  severity: "warning" | "error";
  message: string;
  fromModel?: string;
  toModel?: string;
  startedAt: number;   // ms
  resolvedAt?: number; // ms — undefined = still ongoing
}

interface RouterSession {
  key: string;
  agentId: string;
  type: string;
  updatedAt: number;
  totalTokens: number;
  isActive: boolean;
}

const API_ERROR_RE = /\b(503|502|429|500|5\d\d)\b|overload|high.demand|rate.limit|quota.exceed/i;
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 h

function extractIncidents(
  events: ActivityEvent[],
  agentId: string,
  routerId: string,
  routerLabel: string,
): Incident[] {
  const incidents: Incident[] = [];
  let primaryModel: string | null = null;
  let errorWindow: ActivityEvent[] = [];

  const flushErrors = (endTs: number) => {
    if (errorWindow.length === 0) return;
    const firstTs = new Date(errorWindow[0].timestamp).getTime();
    const lastTs  = new Date(errorWindow[errorWindow.length - 1].timestamp).getTime();
    incidents.push({
      id: `${routerId}--${agentId}--err--${firstTs}`,
      agentId, routerId, routerLabel,
      type: errorWindow[0].type === "error" ? "tool_error" : "api_error",
      severity: "error",
      message: errorWindow[0].message.replace(/^❌\s*/, ""),
      startedAt: firstTs,
      resolvedAt: endTs > lastTs + 5_000 ? lastTs : undefined,
    });
    errorWindow = [];
  };

  for (const ev of events) {
    const ts = new Date(ev.timestamp).getTime();

    // Model switch
    const switchMatch = ev.message.match(/🔄\s*Model:\s*(.+?)\s*→\s*(.+)/);
    if (switchMatch) {
      flushErrors(ts);
      const from = switchMatch[1].trim();
      const to   = switchMatch[2].trim();
      // Record the first seen model as primary
      if (!primaryModel) primaryModel = from;
      incidents.push({
        id: `${routerId}--${agentId}--switch--${ts}`,
        agentId, routerId, routerLabel,
        type: "model_fallback",
        severity: "warning",
        message: `Fell back from ${from} → ${to}`,
        fromModel: from,
        toModel:   to,
        startedAt: ts,
        // Resolved once the session proceeds normally (no immediate error after)
        resolvedAt: ts,
      });
      continue;
    }

    // API / tool errors
    if (ev.type === "error" || API_ERROR_RE.test(ev.message)) {
      const prev = errorWindow[errorWindow.length - 1];
      const gap  = prev ? ts - new Date(prev.timestamp).getTime() : 0;
      if (gap > 5 * 60 * 1000) flushErrors(ts); // gap > 5 min → new incident
      errorWindow.push(ev);
      continue;
    }

    // Non-error event — resolve any open error window
    if (errorWindow.length > 0) flushErrors(ts);
  }

  // Close any trailing error window
  flushErrors(Date.now());

  return incidents;
}

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url   = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) return NextResponse.json({ incidents: [] });

  const now = Date.now();
  const allIncidents: Incident[] = [];

  await Promise.allSettled(
    routers.map(async (router) => {
      try {
        const data = await routerGet<{ sessions: RouterSession[] }>(
          router.url, router.token, "/all-sessions"
        );
        const sessions = (data.sessions ?? []).filter(
          (s) => s.type !== "cron" && now - s.updatedAt < LOOKBACK_MS
        );

        // Per agent: take up to 3 most-recent sessions
        const byAgent = new Map<string, RouterSession[]>();
        for (const s of sessions) {
          const list = byAgent.get(s.agentId) ?? [];
          list.push(s);
          byAgent.set(s.agentId, list);
        }

        await Promise.allSettled(
          Array.from(byAgent.entries()).map(async ([agentId, agentSessions]) => {
            const recent = agentSessions
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 3);
            for (const sess of recent) {
              try {
                const evData = await routerGet<{ key: string; events: ActivityEvent[] }>(
                  router.url, router.token, "/session",
                  { agentId, key: sess.key }  // router reads "key", not "sessionKey"
                );
                const evs = (evData.events ?? []).filter(
                  (e) => now - new Date(e.timestamp).getTime() < LOOKBACK_MS
                );
                const inc = extractIncidents(evs, agentId, router.id, router.label ?? router.id);
                allIncidents.push(...inc);
              } catch { /* skip */ }
            }
          })
        );
      } catch { /* skip router */ }
    })
  );

  // Dedupe by id, sort newest first
  const seen = new Set<string>();
  const unique = allIncidents.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  unique.sort((a, b) => b.startedAt - a.startedAt);

  return NextResponse.json({ incidents: unique });
}
