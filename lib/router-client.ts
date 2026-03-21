/**
 * Simple fetch wrapper for calling the Mission Control Router.
 * All Mission Control API routes use this instead of calling OpenClaw directly.
 */

export class RouterError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function routerGet<T>(
  routerUrl: string,
  routerToken: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, routerUrl.endsWith("/") ? routerUrl : routerUrl + "/");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${routerToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RouterError(
      `Router error ${res.status}: ${body || res.statusText}`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}
