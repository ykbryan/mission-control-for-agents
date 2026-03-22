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
    if (known) return { ...known, files, routerId, routerLabel };
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
