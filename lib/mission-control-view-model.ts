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

// nodeId is either a compound "routerId--agentId" key or a plain agentId
export function getSelectedAgent(agents: Agent[], nodeId: string) {
  const sep = nodeId.indexOf("--");
  if (sep !== -1) {
    const routerId = nodeId.slice(0, sep);
    const agentId = nodeId.slice(sep + 2);
    const found = agents.find(a => a.id === agentId && a.routerId === routerId);
    if (found) return found;
  }
  return agents.find(a => a.id === nodeId) ?? agents[0];
}

export function getSystemStatusSummary(agents: Agent[], mode: "graph" | "workflow", selectedAgent?: Agent) {
  const onlineCount = agents.filter(a => a.status === "online").length;
  return [
    `${onlineCount} online`,
    selectedAgent ? `${selectedAgent.name} focused` : null,
  ].filter(Boolean) as string[];
}

export function getInspectorMode(activeFile: string | null): "overview" | "agent" | "file" {
  if (activeFile) return "file";
  return "agent";
}
