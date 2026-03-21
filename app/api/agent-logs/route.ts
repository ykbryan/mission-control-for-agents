import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agent parameter" }, { status: 400 });
  }

  try {
    const command = `sh -c 'latest_session=$(jq -r ".recent[0].sessionId" ~/.openclaw/agents/${agentId}/sessions/sessions.json) && tail -n 10 ~/.openclaw/agents/${agentId}/sessions/$latest_session.jsonl'`;
    const rawOutput = execSync(command, { encoding: 'utf-8' });

    const logs = rawOutput
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
