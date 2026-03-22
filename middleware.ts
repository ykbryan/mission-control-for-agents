import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasValidAuth(req: NextRequest): boolean {
  const routers = req.cookies.get("routers")?.value;
  if (routers) {
    try {
      const parsed = JSON.parse(decodeURIComponent(routers));
      if (Array.isArray(parsed) && parsed.length > 0) return true;
    } catch {}
  }
  // Legacy single-router cookies
  const token = req.cookies.get("routerToken")?.value;
  const url = req.cookies.get("routerUrl")?.value;
  return !!(token && url);
}

export function middleware(req: NextRequest) {
  const authed = hasValidAuth(req);
  // Unauthenticated: redirect everything except /login to /login
  if (!authed && !req.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // Authenticated: /login is always accessible (it's the connections manager)
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
