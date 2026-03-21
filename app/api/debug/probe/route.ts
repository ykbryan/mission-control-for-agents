import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway-rpc";

/**
 * Probes various WebSocket RPC methods to discover what the gateway supports.
 * Usage: GET /api/debug/probe?agent=evelyn
 */

const PROBE_METHODS = [
  { method: "sessions.messages", params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "sessions.events",   params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "agents.events",     params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "agents.history",    params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "messages.list",     params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "agents.sessions",   params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "sessions.get",      params: (agentId: string) => ({ agentId }) },
  { method: "agents.get",        params: (agentId: string) => ({ agentId }) },
  { method: "agents.logs",       params: (agentId: string) => ({ agentId, limit: 10 }) },
  { method: "logs.list",         params: (agentId: string) => ({ agentId, limit: 10 }) },
];

export async function GET(req: NextRequest) {
  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized — no gateway cookies" }, { status: 401 });
  }

  const agentId = new URL(req.url).searchParams.get("agent") ?? "evelyn";

  const results: Record<string, unknown> = {};

  for (const { method, params } of PROBE_METHODS) {
    try {
      const result = await gatewayRpc(gatewayUrl, gatewayToken, method, params(agentId), 5000);
      results[method] = { ok: true, result };
    } catch (err: unknown) {
      results[method] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ agentId, results });
}
