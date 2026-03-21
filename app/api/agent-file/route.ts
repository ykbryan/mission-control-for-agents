import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  const file = searchParams.get("file");

  if (!agentId || !file) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // Sanitize — only allow .md files and no path traversal (allow nested directories)
  if (!file.endsWith(".md") || file.includes("..")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized: Missing gateway credentials" }, { status: 401 });
  }

  const remoteFilePath = `~/.openclaw/agents/${agentId}/workspace/${file}`;

  try {
    const response = await fetch(`${gatewayUrl}/api/v1/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        command: `sh -c 'cat ${remoteFilePath}'`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const json = await response.json();
    let content = "";
    
    // In exec response format, usually stdout is a field
    if (json.stdout) {
      content = json.stdout;
    } else if (json.output) {
      content = json.output;
    } else {
      content = JSON.stringify(json);
    }

    return NextResponse.json({ content });
  } catch (err: any) {
    console.error("Agent file fetch error:", err);
    return NextResponse.json(
      { content: `# ${file}\n\n_This file does not exist for ${agentId} or fetch failed._` }
    );
  }
}
