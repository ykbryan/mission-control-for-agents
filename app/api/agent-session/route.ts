import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import type { ActivityEvent } from "@/lib/parse-session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agent parameter" }, { status: 400 });
  }

  const routerUrl = req.cookies.get("routerUrl")?.value;
  const routerToken = req.cookies.get("routerToken")?.value;

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
