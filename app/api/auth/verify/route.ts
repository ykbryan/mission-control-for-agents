import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { routerUrl, routerToken } = await req.json();

  // Trim to catch copy-paste artefacts (trailing newlines, spaces)
  const url = (routerUrl ?? "").trim();
  const token = (routerToken ?? "").trim();

  if (!url || !token) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const healthRes = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (healthRes.status === 401 || healthRes.status === 403) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // /health is public — verify the token using /info which is auth-protected
    // but does NOT proxy to OpenClaw (so it works even if OpenClaw is down).
    const authRes = await fetch(`${url}/info`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (authRes.status === 401 || authRes.status === 403) {
      return NextResponse.json(
        { error: "Invalid router token — check you copied the full token from the router startup output." },
        { status: 401 }
      );
    }

    if (!authRes.ok) {
      return NextResponse.json(
        { error: `Router returned HTTP ${authRes.status} on /info. The router may be misconfigured.` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return NextResponse.json(
        { error: `Could not reach router at ${url} — is it running? (ECONNREFUSED)` },
        { status: 502 }
      );
    }
    if (msg.includes("timeout") || msg.includes("AbortError")) {
      return NextResponse.json(
        { error: `Router at ${url} timed out after 8s — check the URL and firewall.` },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: `Could not reach router: ${msg}` }, { status: 502 });
  }
}
