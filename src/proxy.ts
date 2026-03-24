import { NextRequest, NextResponse } from 'next/server'
import { hasPermission, getRoleFromCookie } from '@/lib/rbac'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only gate mission-control routes
  if (pathname.startsWith('/mission-control')) {
    const roleCookie = request.cookies.get('clawbase_role')?.value
    const role = getRoleFromCookie(roleCookie)

    if (!hasPermission(role, pathname)) {
      const loginUrl = new URL('/', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      loginUrl.searchParams.set('reason', 'unauthorized')
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/mission-control/:path*'],
}
