import { routerGet } from "@/lib/router-client";
import type { RouterAgent } from "./types";

const FILES_TO_SCAN = ["IDENTITY.md", "AGENTS.md", "TOOLS.md", "USER.md", "MEMORY.md", "SOUL.md", "HEARTBEAT.md"];

interface RouterConfig {
  id: string;
  label: string;
  url: string;
  token: string;
}

export async function loadAgents(routers: RouterConfig[]): Promise<RouterAgent[]> {
  const agentResults = await Promise.allSettled(
    routers.map(r => routerGet<{ agents: Omit<RouterAgent, "routerId" | "routerLabel">[] }>(r.url, r.token, "/agents"))
  );

  return agentResults.flatMap((result, i) => {
    if (result.status !== "fulfilled") return [];
    return (result.value.agents ?? []).map(a => ({
      ...a,
      routerId: routers[i].id,
      routerLabel: routers[i].label,
    }));
  });
}

export async function loadAgentFiles(
  agents: RouterAgent[],
  routers: RouterConfig[]
): Promise<{ fileMap: Map<string, Map<string, string>>; filesScanned: number }> {
  const fileMap = new Map<string, Map<string, string>>();
  let filesScanned = 0;

  await Promise.allSettled(
    agents.flatMap(agent => {
      const router = routers.find(r => r.id === agent.routerId);
      if (!router) return [];
      const filesToTry = (agent.files && agent.files.length > 0)
        ? FILES_TO_SCAN.filter(f => agent.files!.includes(f))
        : FILES_TO_SCAN;

      return filesToTry.map(async (filename) => {
        try {
          const { content } = await routerGet<{ content: string }>(
            router.url, router.token, "/file", { agentId: agent.id, name: filename }
          );
          if (!fileMap.has(agent.id)) fileMap.set(agent.id, new Map());
          fileMap.get(agent.id)!.set(filename, content);
          filesScanned++;
        } catch {
          // File doesn't exist for this agent — silently skip
        }
      });
    })
  );

  return { fileMap, filesScanned };
}
