import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  const file = searchParams.get("file");

  if (!agentId || !file) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  if (!file.endsWith(".md") || file.includes("..")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const gatewayToken = req.cookies.get("gatewayToken")?.value;
  if (!gatewayToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The gateway's agent file API is only accessible via WebSocket (/__openclaw__/ws),
  // which is restricted to localhost connections by the gateway. There is no HTTP
  // equivalent for agents.files.get. Remote access is not supported.
  return NextResponse.json(
    { error: "Agent files require direct gateway access (WebSocket is localhost-only)" },
    { status: 503 }
  );
}
