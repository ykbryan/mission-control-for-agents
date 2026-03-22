import { Agent } from "@/lib/agents";

export interface MissionControlUIState {
  theme: "dark" | "light";
  navigation: {
    railExpanded: boolean;
    searchQuery: string;
  };
  stage: {
    mode: "graph" | "workflow";
  };
  selection: {
    agentId: string;
    fileId: string | null;
  };
  inspector: {
    mode: "overview" | "agent" | "file";
    expanded: boolean;
  };
}

export interface MissionControlScreenProps {
  agents: Agent[];
  routerError?: string;
}
