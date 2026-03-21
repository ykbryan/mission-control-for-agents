import { NextRequest, NextResponse } from "next/server";

interface GatewaySession {
  key: string;
  displayName?: string;
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
  channel?: string;
  label?: string;
}

interface SessionsListResult {
  count: number;
  sessions: GatewaySession[];
}

async function sessionsListHttp(
  gatewayUrl: string,
  gatewayToken: string,
  args: Record<string, unknown>
): Promise<SessionsListResult> {
  const res = await fetch(`${gatewayUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({ tool: "sessions_list", args }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message ?? "sessions_list failed");
  const text = data.result?.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as SessionsListResult;
}

export async function GET(req: NextRequest) {
  const agentId = new URL(req.url).searchParams.get("agent");
  if (!agentId) return NextResponse.json({ error: "Missing agent parameter" }, { status: 400 });

  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;
  if (!gatewayUrl || !gatewayToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const parsed = await sessionsListHttp(gatewayUrl, gatewayToken, { limit: 500 });

    const agentSessions = parsed.sessions
      .filter((s) => {
        const parts = s.key.split(":");
        return parts[0] === "agent" && parts[1] === agentId;
      })
      .slice(0, 10);

    if (!agentSessions.length) return NextResponse.json([]);

    const logs = agentSessions.map((s) => {
      const label = s.label ?? s.displayName ?? s.key;
      const tokens = s.totalTokens ? `${s.totalTokens.toLocaleString()} tokens` : "";
      const model = s.model ? `[${s.model.split("/").pop()}]` : "";
      return {
        timestamp: new Date(s.updatedAt ?? Date.now()).toISOString(),
        text: [model, label, tokens].filter(Boolean).join(" — "),
      };
    });

    return NextResponse.json(logs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent logs fetch error:", message);
    return NextResponse.json([]);
  }
}
