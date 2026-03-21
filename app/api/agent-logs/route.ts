import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agent parameter" }, { status: 400 });
  }

  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(`${gatewayUrl}/api/v1/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        command: `sh -c 'latest_session=$(jq -r ".recent[0].sessionId" /home/dave/.openclaw/agents/${agentId}/sessions/sessions.json) && tail -n 10 /home/dave/.openclaw/agents/${agentId}/sessions/$latest_session.jsonl'`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const jsonResp = await response.json();
    let stdoutText = jsonResp.stdout || jsonResp.output || "";

    const logs = stdoutText
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => {
        try {
          const parsed = JSON.parse(line);
          return {
            timestamp: parsed.timestamp || new Date().toISOString(),
            text: parsed.text || parsed.message || JSON.stringify(parsed),
          };
        } catch (err) {
          return {
            timestamp: new Date().toISOString(),
            text: line,
          };
        }
      });

    return NextResponse.json(logs);
  } catch (err: any) {
    console.error("Agent logs fetch error:", err);
    return NextResponse.json([]);
  }
}
