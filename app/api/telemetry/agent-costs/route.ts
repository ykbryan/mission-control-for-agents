import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";

export async function GET(req: NextRequest) {
  const routerUrl = req.cookies.get("routerUrl")?.value;
  const routerToken = req.cookies.get("routerToken")?.value;

  if (!routerUrl || !routerToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await routerGet<{
      costs: { agentId: string; totalTokens: number; estimatedCost: number }[];
    }>(routerUrl, routerToken, "/costs");

    const agentCosts = (data.costs ?? []).map((c) => ({
      agentId: c.agentId,
      tokens: c.totalTokens,
      estimatedCost: c.estimatedCost,
      date: new Date().toISOString().split("T")[0],
    }));

    return NextResponse.json(agentCosts);
  } catch (err) {
    console.error("Failed to fetch costs:", err);
    return NextResponse.json({ error: "Failed to fetch costs" }, { status: 502 });
  }
}
