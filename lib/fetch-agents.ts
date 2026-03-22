import { routerGet } from "@/lib/router-client";
import { agents as staticAgents, Agent } from "@/lib/agents";

interface RouterAgent {
  id: string;
  name: string;
  configured: boolean;
  files?: string[];
}

export async function fetchAgentsFromRouter(
  routerUrl: string,
  routerToken: string
): Promise<Agent[]> {
  const data = await routerGet<{ agents: RouterAgent[] }>(
    routerUrl, routerToken, "/agents"
  );

  const routerAgents = data.agents ?? [];
  const staticMap = new Map(staticAgents.map((a) => [a.id, a]));

  const merged: Agent[] = routerAgents.map((ra) => {
    const known = staticMap.get(ra.id);
    if (known) return known;
    return {
      id: ra.id,
      name: ra.name || ra.id,
      emoji: "🤖",
      role: "AI Agent",
      soul: "A capable AI agent.",
      skills: [],
      files: ra.files ?? [],
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

  return merged.length > 0 ? merged : staticAgents;
}
