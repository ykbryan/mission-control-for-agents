export interface Feature {
  id: string
  title: string
  description: string
}

export interface SiteConfig {
  title: string
  subtitle: string
  description: string
  features: Feature[]
}

export type UserRole = 'admin' | 'operator' | 'viewer' | 'guest'

export interface RBACContext {
  role: UserRole
  permissions: string[]
}
