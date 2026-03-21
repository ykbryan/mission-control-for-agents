import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway-rpc";

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

  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await gatewayRpc<{ file: { content: string; missing: boolean } }>(
      gatewayUrl,
      gatewayToken,
      "agents.files.get",
      { agentId, name: file }
    );

    if (result.file?.missing) {
      return NextResponse.json({ error: `File not found: ${file}` }, { status: 404 });
    }

    return NextResponse.json({ content: result.file?.content ?? "" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reach gateway";
    // WebSocket is localhost-only — return a clear 503 instead of a cryptic 502
    const isLocalhostOnly = message.includes("localhost-only") || message.includes("timeout");
    return NextResponse.json(
      { error: isLocalhostOnly ? "Agent files require the dashboard to run on the same machine as the gateway" : message },
      { status: 503 }
    );
  }
}
