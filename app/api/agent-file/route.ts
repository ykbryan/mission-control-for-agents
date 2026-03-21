import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";

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

  const routerUrl = req.cookies.get("routerUrl")?.value;
  const routerToken = req.cookies.get("routerToken")?.value;

  if (!routerUrl || !routerToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await routerGet<{ content: string }>(
      routerUrl, routerToken, "/file", { agentId, name: file }
    );
    return NextResponse.json({ content: data.content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch file";
    const status = message.includes("404") ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
