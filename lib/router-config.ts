export interface RouterConfig {
  id: string;      // uuid
  url: string;
  token: string;
  label: string;   // user-given name e.g. "Home Server"
}

export function parseRouters(cookie: string | undefined): RouterConfig[] {
  if (!cookie) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(cookie));
    if (Array.isArray(parsed)) return parsed.filter(r => r.id && r.url && r.token);
  } catch {}
  return [];
}

export function stringifyRouters(routers: RouterConfig[]): string {
  return encodeURIComponent(JSON.stringify(routers));
}

/**
 * Resolve which router to use for a given routerId.
 * - If routerId is "legacy" or absent, falls back to routers[0] (single-router compat).
 * - If routerId is a specific UUID, it MUST match exactly — no silent cross-router fallback.
 *   Returns null if the router is not found, so the caller can return a proper 404.
 */
export function resolveRouter(
  routers: RouterConfig[],
  routerId: string,
  legacyUrl?: string,
  legacyToken?: string
): { url: string; token: string } | null {
  if (routers.length > 0) {
    if (routerId === "legacy") {
      // No specific router requested — use the first one (single-router or best-effort)
      return { url: routers[0].url, token: routers[0].token };
    }
    const match = routers.find(r => r.id === routerId);
    return match ? { url: match.url, token: match.token } : null;
  }
  // Legacy single-router cookie fallback
  if (legacyUrl && legacyToken) return { url: legacyUrl, token: legacyToken };
  return null;
}
