import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";
import type { ActivityEvent } from "@/lib/parse-session";

export const dynamic = "force-dynamic";

interface RouterSession {
  key: string;
  agentId: string;
  type: string;
  context: string | null;
  updatedAt: number;
  totalTokens: number;
  isActive: boolean;
}

/** Scan events in reverse for the most recent "🔄 Model: X → Y" switch. */
function parseCurrentModel(events: ActivityEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const m = events[i].message?.match(/🔄\s*Model:\s*.+?\s*→\s*(.+)/);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * GET /api/agent-live-models
 *
 * Returns the live current model per agent, derived from the most recent
 * model-switch event in each agent's latest non-cron session.
 *
 * Response: { models: { [routerId--agentId]: string } }
 */
export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) return NextResponse.json({ models: {} });

  const modelMap: Record<string, string> = {}; // "routerId--agentId" -> currentModel

  await Promise.allSettled(
    routers.map(async (router) => {
      try {
        // Fetch all sessions for this router in one call
        const data = await routerGet<{ sessions: RouterSession[] }>(
          router.url, router.token, "/all-sessions"
        );
        const sessions = data.sessions ?? [];

        // For each agent, pick the most recently updated non-cron session
        const bestSession = new Map<string, RouterSession>();
        for (const s of sessions) {
          if (s.type === "cron") continue; // heartbeat / scheduled jobs use different models
          const existing = bestSession.get(s.agentId);
          if (!existing || s.updatedAt > existing.updatedAt) {
            bestSession.set(s.agentId, s);
          }
        }

        // Fetch events for each agent's best session in parallel
        await Promise.allSettled(
          Array.from(bestSession.entries()).map(async ([agentId, session]) => {
            try {
              const evData = await routerGet<{ key: string; events: ActivityEvent[] }>(
                router.url, router.token, "/session", { agentId, key: session.key }  // router reads "key", not "sessionKey"
              );
              const model = parseCurrentModel(evData.events ?? []);
              if (model) {
                modelMap[`${router.id}--${agentId}`] = model;
              }
            } catch { /* ignore individual session errors */ }
          })
        );
      } catch { /* ignore router errors */ }
    })
  );

  return NextResponse.json({ models: modelMap });
}
