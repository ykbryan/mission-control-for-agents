import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

interface RouterAgent {
  id: string;
  name: string;
  configured: boolean;
  files?: string[];
  lastActiveAt?: number;
  tier?: string;
  nodeHostname?: string;  // physical machine this agent runs on
}

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled(
    routers.map(r => routerGet<{ agents: RouterAgent[] }>(r.url, r.token, "/agents"))
  );

  const allAgents = results.flatMap((res, i) => {
    if (res.status !== "fulfilled") return [];
    return (res.value.agents ?? []).map(a => ({
      ...a,
      routerId: routers[i].id,
      routerLabel: routers[i].label,
    }));
  });

  return NextResponse.json({ agents: allAgents });
}
