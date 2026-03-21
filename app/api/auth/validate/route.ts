import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url, token } = await req.json();

    if (!url || !token) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const response = await fetch(`${url}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        tool: "exec",
        args: { command: "echo auth" }
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "Unauthorized: Invalid Token" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: `Connection failed: ${err.message}` }, { status: 500 });
  }
}
