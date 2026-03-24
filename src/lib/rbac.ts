import type { UserRole } from '@/types/site'

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/mission-control': ['admin', 'operator', 'viewer'],
  '/mission-control/logs': ['admin', 'operator'],
  '/mission-control/config': ['admin'],
}

export function hasPermission(role: UserRole, pathname: string): boolean {
  const allowed = ROUTE_PERMISSIONS[pathname]
  if (!allowed) return true // public routes
  return allowed.includes(role)
}

// Reads role from cookie set at login — no client-side trust
export function getRoleFromCookie(cookieValue: string | undefined): UserRole {
  const valid: UserRole[] = ['admin', 'operator', 'viewer']
  if (cookieValue && valid.includes(cookieValue as UserRole)) {
    return cookieValue as UserRole
  }
  return 'guest'
}
