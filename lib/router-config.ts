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
