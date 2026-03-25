import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

interface WindowStats { requests: number; tokens: number; cost: number; }

interface RouterRequestStats {
  windows:     Record<string, WindowStats>;
  byAgent:     Record<string, Record<string, WindowStats>>;
  dailySeries: { date: string; requests: number; tokens: number; cost: number }[];
  totals:      { requests: number; tokens: number; cost: number };
}

const ZERO = (): WindowStats => ({ requests: 0, tokens: 0, cost: 0 });
const KEYS = ["h1", "h5", "d1", "d5", "w1", "m1"] as const;

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url   = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await Promise.allSettled(
    routers.map(r => routerGet<RouterRequestStats>(r.url, r.token, "/request-stats"))
  );

  const windows: Record<string, WindowStats> = Object.fromEntries(KEYS.map(k => [k, ZERO()]));
  const byAgent: Record<string, Record<string, WindowStats>> = {};
  const dailyMap = new Map<string, WindowStats>();
  const totals: WindowStats = ZERO();

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const d = result.value;

    for (const k of KEYS) {
      const w = d.windows?.[k];
      if (!w) continue;
      windows[k].requests += w.requests ?? 0;
      windows[k].tokens   += w.tokens   ?? 0;
      windows[k].cost     += w.cost     ?? 0;
    }

    for (const [win, agents] of Object.entries(d.byAgent ?? {})) {
      if (!byAgent[win]) byAgent[win] = {};
      for (const [agentId, stats] of Object.entries(agents)) {
        const cur = byAgent[win][agentId] ?? ZERO();
        cur.requests += stats.requests ?? 0;
        cur.tokens   += stats.tokens   ?? 0;
        cur.cost     += stats.cost     ?? 0;
        byAgent[win][agentId] = cur;
      }
    }

    for (const row of d.dailySeries ?? []) {
      const cur = dailyMap.get(row.date) ?? ZERO();
      cur.requests += row.requests ?? 0;
      cur.tokens   += row.tokens   ?? 0;
      cur.cost     += row.cost     ?? 0;
      dailyMap.set(row.date, cur);
    }

    totals.requests += d.totals?.requests ?? 0;
    totals.tokens   += d.totals?.tokens   ?? 0;
    totals.cost     += d.totals?.cost     ?? 0;
  }

  // Round costs
  for (const w of Object.values(windows)) w.cost = parseFloat(w.cost.toFixed(6));
  totals.cost = parseFloat(totals.cost.toFixed(6));

  const dailySeries = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({ date, requests: s.requests, tokens: s.tokens, cost: parseFloat(s.cost.toFixed(6)) }));

  return NextResponse.json({ windows, byAgent, dailySeries, totals });
}
