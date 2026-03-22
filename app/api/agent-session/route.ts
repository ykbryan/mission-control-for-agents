import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters, resolveRouter } from "@/lib/router-config";
import type { ActivityEvent } from "@/lib/parse-session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agent parameter" }, { status: 400 });
  }

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

  // Optional: fetch a specific session by key
  const sessionKey = searchParams.get("sessionKey");

  try {
    const params: Record<string, string> = { agentId };
    if (sessionKey) params.sessionKey = sessionKey;
    const data = await routerGet<{ key: string; events: ActivityEvent[] }>(
      routerUrl, routerToken, "/session", params
    );
    return NextResponse.json(data.events ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("404")) return NextResponse.json([]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
