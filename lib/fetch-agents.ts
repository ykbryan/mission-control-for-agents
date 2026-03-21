/**
 * Fetches the live agent list from the OpenClaw gateway.
 *
 * Strategy:
 *  1. Call `sessions_list` to get all unique agentIds from active sessions
 *  2. Call `agents_list` to get names for configured agents
 *  3. Merge with the static metadata in lib/agents.ts for known agents (emoji, role, soul, skills, files)
 *  4. For unknown agents, use sensible defaults
 *
 * This works for both localhost and remote gateways since both calls use plain HTTP.
 */

import { agents as staticAgents, type Agent } from "./agents";

const DEFAULT_FILES = ["IDENTITY.md", "SOUL.md", "TOOLS.md", "HEARTBEAT.md", "AGENTS.md", "USER.md"];
const DEFAULT_EMOJI = "🤖";
const DEFAULT_ROLE = "AI Agent";
const DEFAULT_SOUL = "An intelligent agent powered by OpenClaw.";

const staticById = new Map(staticAgents.map((a) => [a.id, a]));

interface GatewaySession {
  key: string;
  totalTokens?: number;
  updatedAt?: number;
}

interface GatewayAgent {
  id: string;
  name?: string;
  configured?: boolean;
}

async function invokeHttp(
  gatewayUrl: string,
  gatewayToken: string,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${gatewayUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({ tool, args }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message ?? `${tool} failed`);
  const text = (data.result?.content?.[0]?.text ?? "{}") as string;
  return JSON.parse(text);
}

export async function fetchAgentsFromGateway(
  gatewayUrl: string,
  gatewayToken: string
): Promise<Agent[]> {
  // Run both calls in parallel
  const [sessionData, agentData] = await Promise.all([
    invokeHttp(gatewayUrl, gatewayToken, "sessions_list", { limit: 500 }).catch(() => ({ sessions: [] })),
    invokeHttp(gatewayUrl, gatewayToken, "agents_list", {}).catch(() => ({ agents: [] })),
  ]) as [{ sessions: GatewaySession[] }, { agents: GatewayAgent[] }];

  // Build name map from agents_list
  const nameById = new Map<string, string>();
  for (const a of agentData.agents ?? []) {
    if (a.id && a.name) nameById.set(a.id, a.name);
  }

  // Collect unique agentIds from sessions_list (agent:<id>:<rest>)
  const agentIdsFromSessions = new Set<string>();
  for (const s of sessionData.sessions ?? []) {
    const parts = s.key?.split(":");
    if (parts?.[0] === "agent" && parts[1]) agentIdsFromSessions.add(parts[1]);
  }

  // Also include agents from agents_list that may not have sessions yet
  for (const a of agentData.agents ?? []) {
    if (a.id) agentIdsFromSessions.add(a.id);
  }

  // Build final agent list
  const result: Agent[] = [];

  for (const id of agentIdsFromSessions) {
    const staticAgent = staticById.get(id);

    // Prefer static metadata for known agents, fall back to defaults
    result.push({
      id,
      name: nameById.get(id) ?? staticAgent?.name ?? formatId(id),
      emoji: staticAgent?.emoji ?? DEFAULT_EMOJI,
      role: staticAgent?.role ?? DEFAULT_ROLE,
      soul: staticAgent?.soul ?? DEFAULT_SOUL,
      skills: staticAgent?.skills ?? [],
      files: staticAgent?.files ?? DEFAULT_FILES,
    });
  }

  // Sort: known agents first (by static order), then unknown alphabetically
  const staticOrder = new Map(staticAgents.map((a, i) => [a.id, i]));
  result.sort((a, b) => {
    const ai = staticOrder.get(a.id) ?? Infinity;
    const bi = staticOrder.get(b.id) ?? Infinity;
    if (ai !== bi) return ai - bi;
    return a.id.localeCompare(b.id);
  });

  return result;
}

function formatId(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
}
