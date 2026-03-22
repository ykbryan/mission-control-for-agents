import { cookies } from "next/headers";
import { parseRouters } from "@/lib/router-config";
import MissionControlScreen from "@/components/mission-control/MissionControlScreen";
import { agents as staticAgents } from "@/lib/agents";
import { fetchAgentsFromRouter } from "@/lib/fetch-agents";
import { RouterConfig } from "@/lib/router-config";

export default async function Home() {
  const cookieStore = await cookies();

  // Parse routers (new format)
  let routerConfigs: RouterConfig[] = parseRouters(cookieStore.get("routers")?.value);

  // Backward compat: migrate legacy single-router cookies
  if (routerConfigs.length === 0) {
    const legacyUrl = cookieStore.get("routerUrl")?.value;
    const legacyToken = cookieStore.get("routerToken")?.value;
    if (legacyUrl && legacyToken) {
      routerConfigs = [{ id: "legacy", url: legacyUrl, token: legacyToken, label: "Router" }];
    }
  }

  const routerErrors: Record<string, string> = {};
  let agents = staticAgents;

  if (routerConfigs.length > 0) {
    const results = await Promise.allSettled(
      routerConfigs.map(rc => fetchAgentsFromRouter(rc.url, rc.token, rc.id, rc.label))
    );
    const allAgents = results.flatMap((r, i) => {
      if (r.status === "fulfilled") return r.value;
      routerErrors[routerConfigs[i].id] = r.reason instanceof Error ? r.reason.message : String(r.reason);
      return [];
    });
    if (allAgents.length > 0) agents = allAgents;
  }

  return <MissionControlScreen agents={agents} routerConfigs={routerConfigs} routerErrors={routerErrors} />;
}
