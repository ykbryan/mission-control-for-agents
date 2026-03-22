import { routerGet } from "@/lib/router-client";
import { agents as staticAgents, Agent } from "@/lib/agents";

// Keywords in role or soul that strongly indicate an orchestrator
const ORCH_KEYWORDS = [
  "chief of staff", "orchestrator", "orchestrating", "chief agent",
  "head of agents", "lead agent", "agent coordinator", "agent manager",
];

function inferTier(known: Agent | undefined, routerTier: Agent["tier"]): Agent["tier"] {
  // Highest signal: role/soul keyword match on the static definition
  if (known) {
    const text = `${known.role} ${known.soul}`.toLowerCase();
    if (ORCH_KEYWORDS.some(k => text.includes(k))) return "orchestrator";
  }
  // Next: explicit tier in static config
  if (known?.tier) return known.tier;
  // Last resort: router's AGENTS.md cross-reference detection
  return routerTier ?? "specialist";
}

interface RouterAgent {
  id: string;
  name: string;
  configured: boolean;
  files?: string[];
  lastActiveAt?: number;
  tier?: string;
}

export async function fetchAgentsFromRouter(
  routerUrl: string,
  routerToken: string,
  routerId: string,
  routerLabel: string
): Promise<Agent[]> {
  const data = await routerGet<{ agents: RouterAgent[] }>(
    routerUrl, routerToken, "/agents"
  );

  const routerAgents = data.agents ?? [];
  const staticMap = new Map(staticAgents.map((a) => [a.id, a]));

  const merged: Agent[] = routerAgents.map((ra) => {
    // Always use the real file list from the router (what actually exists on disk).
    // Fall back to static metadata for name/emoji/role/soul/skills.
    const known = staticMap.get(ra.id);
    const files = ra.files && ra.files.length > 0 ? ra.files : (known?.files ?? []);
    const now = Date.now();
    const raw = ra.lastActiveAt ?? 0;
    // Normalise to ms — OpenClaw may return seconds (< 1e12) or ms (>= 1e12)
    const last = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
    const status: "online" | "idle" | "offline" =
      last > now - 7 * 24 * 60 * 60 * 1000  ? "online"
      : last > now - 30 * 24 * 60 * 60 * 1000 ? "idle"
      : "offline";
    // Tier detection — three signals, highest confidence wins:
    // 1. Role/soul keywords on the static agent (most reliable — "Chief of Staff" etc.)
    // 2. Static config tier field (explicit override in agents.ts)
    // 3. Router AGENTS.md cross-reference detection (dynamic, but noisy when all agents share a template)
    const routerTier = ra.tier === "orchestrator" || ra.tier === "specialist" ? ra.tier : undefined;
    const tier: Agent["tier"] = inferTier(known, routerTier);
    if (known) return { ...known, files, routerId, routerLabel, status, tier };
    return {
      id: ra.id,
      name: ra.name || ra.id,
      emoji: "🤖",
      role: "AI Agent",
      soul: "A capable AI agent.",
      skills: [],
      files,
      routerId,
      routerLabel,
      status,
      tier,
    };
  });

  // Sort: known static agents first (preserve their order), then alphabetically
  const staticOrder = new Map(staticAgents.map((a, i) => [a.id, i]));
  merged.sort((a, b) => {
    const ai = staticOrder.get(a.id) ?? Infinity;
    const bi = staticOrder.get(b.id) ?? Infinity;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return merged.length > 0 ? merged : staticAgents.map(a => ({ ...a, routerId, routerLabel }));
}
