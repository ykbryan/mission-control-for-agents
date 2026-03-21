import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  const file = searchParams.get("file");

  if (!agentId || !file) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // Sanitize — allow nested directories, prevent path traversal
  if (!file.endsWith(".md") || file.includes("..")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized: Missing gateway credentials" }, { status: 401 });
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
        args: {
          command: `sh -c 'cat ~/.openclaw/agents/${agentId}/workspace/${file}'`
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const jsonResp = await response.json();
    let content = "";
    
    if (jsonResp.ok && jsonResp.result && jsonResp.result.output) {
      content = jsonResp.result.output;
    } else {
      content = JSON.stringify(jsonResp);
    }

    return NextResponse.json({ content });
  } catch (err: any) {
    console.error("Agent file fetch error:", err);
    return NextResponse.json(
      { content: `# ${file}\n\n_This file does not exist for ${agentId} or fetch failed._` }
    );
  }
}
