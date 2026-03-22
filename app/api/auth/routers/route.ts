import { NextRequest, NextResponse } from "next/server";
import { parseRouters } from "@/lib/router-config";

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  // Also check legacy cookies
  const legacyUrl = req.cookies.get("routerUrl")?.value;
  const legacyToken = req.cookies.get("routerToken")?.value;

  const allRouters = routers.length > 0 ? routers :
    (legacyUrl && legacyToken ? [{ id: "legacy", url: legacyUrl, token: legacyToken, label: "Router" }] : []);

  return NextResponse.json({
    routers: allRouters.map(r => ({ id: r.id, url: r.url, label: r.label }))
  });
}
