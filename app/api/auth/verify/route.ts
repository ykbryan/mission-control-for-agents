import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { routerUrl, routerToken } = await req.json();

  if (!routerUrl || !routerToken) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const res = await fetch(`${routerUrl}/health`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // /health must return JSON with ok:true to confirm this is actually the router
    let healthData: { ok?: boolean } = {};
    try { healthData = await res.json(); } catch {}
    if (!healthData.ok) {
      return NextResponse.json({ error: "Not a Mission Control Router (bad /health response)" }, { status: 401 });
    }

    // Verify the token works on a protected route and returns valid agent JSON
    const authRes = await fetch(`${routerUrl}/agents`, {
      headers: { Authorization: `Bearer ${routerToken}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: "Invalid router token" }, { status: 401 });
    }

    let agentsData: { agents?: unknown[] } = {};
    try { agentsData = await authRes.json(); } catch {}
    if (!Array.isArray(agentsData.agents)) {
      return NextResponse.json({ error: "Not a Mission Control Router (bad /agents response)" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach router" }, { status: 502 });
  }
}
