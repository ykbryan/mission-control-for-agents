import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { gatewayUrl, gatewayToken } = await req.json();

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const response = await fetch(`${gatewayUrl}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        tool: "exec",
        args: { command: "echo ok" },
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Any response other than 401/403 means the gateway is reachable and the token was accepted
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach gateway" }, { status: 502 });
  }
}
