import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway-rpc";

/**
 * Probes various WebSocket RPC methods and HTTP tools to discover what the gateway supports.
 * Usage: GET /api/debug/probe?agent=main&key=agent:main:main
 */

export async function GET(req: NextRequest) {
  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized — no gateway cookies" }, { status: 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent") ?? "main";
  const sessionKey = url.searchParams.get("key") ?? `agent:${agentId}:main`;

  // --- WebSocket RPC probes ---
  const wsProbes: Array<{ method: string; params: Record<string, unknown> }> = [
    // sessions.get with actual key
    { method: "sessions.get",          params: { key: sessionKey } },
    { method: "sessions.get",          params: { key: sessionKey, includeMessages: true } },
    // message-related
    { method: "sessions.messages",     params: { key: sessionKey, limit: 20 } },
    { method: "sessions.messages",     params: { agentId, limit: 20 } },
    { method: "messages.list",         params: { key: sessionKey, limit: 20 } },
    // event-related
    { method: "sessions.events",       params: { key: sessionKey, limit: 20 } },
    { method: "agents.events",         params: { agentId, limit: 20 } },
    // turns / runs
    { method: "sessions.turns",        params: { key: sessionKey, limit: 20 } },
    { method: "runs.list",             params: { agentId, limit: 20 } },
    { method: "agents.runs",           params: { agentId, limit: 20 } },
  ];

  const wsResults: Record<string, unknown> = {};
  for (const { method, params } of wsProbes) {
    const label = `${method}(${JSON.stringify(params)})`;
    try {
      const result = await gatewayRpc(gatewayUrl, gatewayToken, method, params, 5000);
      wsResults[label] = { ok: true, result };
    } catch (err: unknown) {
      wsResults[label] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // --- HTTP /tools/invoke probes ---
  const httpTools = [
    { tool: "sessions_get",     args: { key: sessionKey } },
    { tool: "messages_list",    args: { key: sessionKey, limit: 20 } },
    { tool: "sessions_messages",args: { key: sessionKey, limit: 20 } },
    { tool: "sessions_events",  args: { key: sessionKey, limit: 20 } },
    { tool: "agents_get",       args: { agentId } },
    { tool: "runs_list",        args: { agentId, limit: 20 } },
    { tool: "tools_list",       args: {} },
  ];

  const httpResults: Record<string, unknown> = {};
  for (const { tool, args } of httpTools) {
    try {
      const res = await fetch(`${gatewayUrl}/tools/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken}` },
        body: JSON.stringify({ tool, args }),
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        const text = data.result?.content?.[0]?.text ?? "{}";
        httpResults[tool] = { ok: true, result: JSON.parse(text) };
      } else {
        httpResults[tool] = { ok: false, error: data.error?.message ?? "failed" };
      }
    } catch (err: unknown) {
      httpResults[tool] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ agentId, sessionKey, wsResults, httpResults });
}
