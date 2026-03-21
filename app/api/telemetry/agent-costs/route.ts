import { NextRequest, NextResponse } from "next/server";

interface GatewaySession {
  key: string;
  totalTokens?: number;
  updatedAt?: number;
  model?: string;
}

interface SessionsListResult {
  count: number;
  sessions: GatewaySession[];
}

async function sessionsListHttp(
  gatewayUrl: string,
  gatewayToken: string
): Promise<SessionsListResult> {
  const res = await fetch(`${gatewayUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({ tool: "sessions_list", args: { limit: 500 } }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message ?? "sessions_list failed");
  const text = data.result?.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as SessionsListResult;
}

export async function GET(req: NextRequest) {
  try {
    const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
    const gatewayToken = req.cookies.get("gatewayToken")?.value;

    if (!gatewayUrl || !gatewayToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await sessionsListHttp(gatewayUrl, gatewayToken);

    // Aggregate total tokens and latest date by agentId
    const byAgent: Record<string, { tokens: number; date: string }> = {};

    for (const session of parsed.sessions) {
      const parts = session.key.split(":");
      if (parts[0] !== "agent" || !parts[1]) continue;
      const agentId = parts[1];

      if (!byAgent[agentId]) {
        byAgent[agentId] = { tokens: 0, date: "1970-01-01" };
      }

      byAgent[agentId].tokens += session.totalTokens ?? 0;

      if (session.updatedAt) {
        const d = new Date(session.updatedAt).toISOString().split("T")[0];
        if (d > byAgent[agentId].date) byAgent[agentId].date = d;
      }
    }

    const agentCosts = Object.entries(byAgent).map(([agentId, { tokens, date }]) => ({
      agentId,
      date,
      tokens,
      // Rough blended estimate: ~$3 per 1M tokens
      estimatedCost: Number(((tokens / 1_000_000) * 3).toFixed(4)),
    }));

    return NextResponse.json(agentCosts);
  } catch (error) {
    console.error("Failed to fetch telemetry:", error);
    return NextResponse.json({ error: "Failed to fetch telemetry" }, { status: 500 });
  }
}
