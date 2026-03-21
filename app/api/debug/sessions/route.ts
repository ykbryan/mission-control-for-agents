import { NextRequest, NextResponse } from "next/server";

/**
 * Debug endpoint — returns raw sessions_list output so we can verify
 * the session key format and what agentIds are present.
 * Usage: GET /api/debug/sessions?agent=evelyn
 */
export async function GET(req: NextRequest) {
  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized — no gateway cookies" }, { status: 401 });
  }

  const agentFilter = new URL(req.url).searchParams.get("agent");

  try {
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
    if (!data.ok) {
      return NextResponse.json({ error: data.error?.message ?? "sessions_list failed" }, { status: 502 });
    }

    const text = data.result?.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as { count: number; sessions: Array<{ key: string; [k: string]: unknown }> };

    // Extract unique agentIds from session keys
    const agentIds = new Set<string>();
    const keyPrefixes = new Set<string>();
    for (const s of parsed.sessions ?? []) {
      const parts = s.key?.split(":");
      if (parts?.[0]) keyPrefixes.add(parts[0]);
      if (parts?.[0] === "agent" && parts[1]) agentIds.add(parts[1]);
    }

    // If filtering by agent, show those sessions; otherwise show summary
    const filtered = agentFilter
      ? (parsed.sessions ?? []).filter((s) => {
          const parts = s.key?.split(":");
          return parts?.[0] === "agent" && parts[1] === agentFilter;
        })
      : [];

    return NextResponse.json({
      totalSessions: parsed.count ?? parsed.sessions?.length ?? 0,
      uniqueAgentIds: Array.from(agentIds).sort(),
      keyPrefixes: Array.from(keyPrefixes),
      sampleKeys: (parsed.sessions ?? []).slice(0, 20).map((s) => s.key),
      ...(agentFilter
        ? {
            filterAgent: agentFilter,
            matchedSessions: filtered.length,
            matchedKeys: filtered.map((s) => s.key),
          }
        : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
