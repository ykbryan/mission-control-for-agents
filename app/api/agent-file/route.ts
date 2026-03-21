import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import os from "os";
import path from "path";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  const file = searchParams.get("file");

  if (!agentId || !file) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // Allow directories like memory/2026-03-21.md, but prevent traversal
  if (!file.endsWith(".md") || file.includes("..")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const homedir = os.homedir();
  const remoteFilePath = path.join(homedir, ".openclaw", "agents", agentId, "workspace", file);

  try {
    const content = execSync(`cat "${remoteFilePath}"`, { encoding: 'utf-8' });
    return NextResponse.json({ content });
  } catch (err: any) {
    console.error("Agent file fetch error:", err);
    return NextResponse.json(
      { content: `# ${file}\n\n_This file does not exist for ${agentId} or fetch failed._` }
    );
  }
}
