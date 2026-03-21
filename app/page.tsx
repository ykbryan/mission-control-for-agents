import { agents } from "@/lib/agents";
import MissionControlScreen from "@/components/mission-control/MissionControlScreen";

export default function Home() {
  return <MissionControlScreen agents={agents} />;
}
