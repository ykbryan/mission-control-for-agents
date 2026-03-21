import { Agent } from "@/lib/agents";

export function filterAgents(agents: Agent[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) return agents;

  return agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(normalized) ||
      agent.role.toLowerCase().includes(normalized) ||
      agent.skills.some((skill) => skill.toLowerCase().includes(normalized))
  );
}

export function getSelectedAgent(agents: Agent[], agentId: string) {
  return agents.find((agent) => agent.id === agentId) ?? agents[0];
}

export function getSystemStatusSummary(agents: Agent[], mode: "graph" | "workflow", selectedAgent?: Agent) {
  return [
    `${agents.length} agents online`,
    mode === "graph" ? "graph stage" : "workflow stage",
    selectedAgent ? `${selectedAgent.name} focused` : null,
  ].filter(Boolean) as string[];
}

export function getInspectorMode(activeFile: string | null): "overview" | "agent" | "file" {
  if (activeFile) return "file";
  return "agent";
}
