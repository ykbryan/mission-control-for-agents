import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

export async function GET(req: NextRequest) {
  // Get router config
  const { searchParams } = new URL(req.url);
  const routerId = searchParams.get("routerId") ?? "legacy";
  const routers = parseRouters(req.cookies.get("routers")?.value);
  let routerUrl: string | undefined;
  let routerToken: string | undefined;

  if (routers.length > 0) {
    const router = routers.find(r => r.id === routerId) ?? routers[0];
    routerUrl = router.url;
    routerToken = router.token;
  } else {
    // Legacy fallback
    routerUrl = req.cookies.get("routerUrl")?.value;
    routerToken = req.cookies.get("routerToken")?.value;
  }

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
