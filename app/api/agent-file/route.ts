import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const AGENTS_BASE = "/home/dave/.openclaw/agents";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  const file = searchParams.get("file");

  if (!agentId || !file) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // Sanitize — only allow .md files and no path traversal
  if (!file.endsWith(".md") || file.includes("..") || file.includes("/")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const filePath = path.join(AGENTS_BASE, agentId, "workspace", file);

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json(
      { content: `# ${file}\n\n_This file does not exist for ${agentId}._` }
    );
  }
}
