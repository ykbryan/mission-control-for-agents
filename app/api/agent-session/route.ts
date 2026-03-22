import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";
import type { ActivityEvent } from "@/lib/parse-session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agent parameter" }, { status: 400 });
  }

  // Get router config
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
    const data = await routerGet<{ key: string; events: ActivityEvent[] }>(
      routerUrl, routerToken, "/session", { agentId }
    );
    return NextResponse.json(data.events ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("404")) return NextResponse.json([]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
