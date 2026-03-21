import { cookies } from "next/headers";
import MissionControlScreen from "@/components/mission-control/MissionControlScreen";
import { agents as staticAgents } from "@/lib/agents";
import { fetchAgentsFromGateway } from "@/lib/fetch-agents";

export default async function Home() {
  const cookieStore = await cookies();
  const gatewayUrl = cookieStore.get("gatewayUrl")?.value;
  const gatewayToken = cookieStore.get("gatewayToken")?.value;

  let agents = staticAgents;

  if (gatewayUrl && gatewayToken) {
    try {
      agents = await fetchAgentsFromGateway(gatewayUrl, gatewayToken);
    } catch {
      // Gateway unreachable — fall back to static agent list
    }
  }

  return <MissionControlScreen agents={agents} />;
}
