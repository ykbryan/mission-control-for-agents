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

    // /health is public — now verify the token actually works on a protected route
    const authRes = await fetch(`${routerUrl}/agents`, {
      headers: { Authorization: `Bearer ${routerToken}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: "Invalid router token" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach router" }, { status: 502 });
  }
}
