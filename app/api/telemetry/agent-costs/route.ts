import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

interface RouterCostsResponse {
  costs: { agentId: string; totalTokens: number; estimatedCost: number }[];
  daily?: { agentId: string; date: string; tokens: number; estimatedCost: number }[];
  models?: { model: string; totalTokens: number; estimatedCost: number }[];
}

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);

  // Fallback: legacy single-router cookies
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }

  if (routers.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled(
    routers.map((r) => routerGet<RouterCostsResponse>(r.url, r.token, "/costs"))
  );

  type CostEntry   = { agentId: string; tokens: number; estimatedCost: number; routerId: string; routerLabel: string };
  type DailyEntry  = { agentId: string; date: string; tokens: number; estimatedCost: number; routerId: string; routerLabel: string };
  type RouterEntry = { routerId: string; routerLabel: string; totalTokens: number; estimatedCost: number };
  type ModelEntry  = { model: string; totalTokens: number; estimatedCost: number };

  const allCosts:  CostEntry[]   = [];
  const allDaily:  DailyEntry[]  = [];
  const byRouter:  RouterEntry[] = [];
  const modelMap   = new Map<string, { tokens: number; cost: number }>();

  for (let i = 0; i < routers.length; i++) {
    const r = routers[i];
    const result = results[i];
    if (result.status !== "fulfilled") continue;
    const data = result.value;

    let routerTokens = 0;
    for (const c of data.costs ?? []) {
      allCosts.push({
        agentId: c.agentId,
        tokens: c.totalTokens,
        estimatedCost: c.estimatedCost,
        routerId: r.id,
        routerLabel: r.label,
      });
      routerTokens += c.totalTokens;
    }
    for (const d of data.daily ?? []) {
      allDaily.push({ ...d, routerId: r.id, routerLabel: r.label });
    }
    for (const m of data.models ?? []) {
      const existing = modelMap.get(m.model);
      if (existing) {
        existing.tokens += m.totalTokens;
        existing.cost   += m.estimatedCost;
      } else {
        modelMap.set(m.model, { tokens: m.totalTokens, cost: m.estimatedCost });
      }
    }
    byRouter.push({
      routerId: r.id,
      routerLabel: r.label,
      totalTokens: routerTokens,
      estimatedCost: parseFloat((routerTokens * 3 / 1_000_000).toFixed(6)),
    });
  }

  const byModel: ModelEntry[] = [...modelMap.entries()]
    .map(([model, v]) => ({ model, totalTokens: v.tokens, estimatedCost: parseFloat(v.cost.toFixed(6)) }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  return NextResponse.json({ costs: allCosts, daily: allDaily, byRouter, byModel });
}
