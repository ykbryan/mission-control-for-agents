import { cookies } from "next/headers";
import MissionControlScreen from "@/components/mission-control/MissionControlScreen";
import { agents as staticAgents } from "@/lib/agents";
import { fetchAgentsFromRouter } from "@/lib/fetch-agents";

export default async function Home() {
  const cookieStore = await cookies();
  const routerUrl = cookieStore.get("routerUrl")?.value;
  const routerToken = cookieStore.get("routerToken")?.value;

  let agents = staticAgents;

  if (routerUrl && routerToken) {
    try {
      agents = await fetchAgentsFromRouter(routerUrl, routerToken);
    } catch {
      // Router unreachable — fall back to static agent list
    }
  }

  return <MissionControlScreen agents={agents} />;
}
