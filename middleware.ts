import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasValidAuth(req: NextRequest): boolean {
  // New multi-router cookie
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
  if (token && url) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const authed = hasValidAuth(req);
  if (!authed) {
    if (!req.nextUrl.pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } else if (req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
