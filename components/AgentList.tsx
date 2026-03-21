"use client";
import { Agent } from "@/lib/agents";

interface Props {
  agents: Agent[];
  selectedAgent: Agent;
  onSelect: (a: Agent) => void;
}

export default function AgentList({ agents, selectedAgent, onSelect }: Props) {
  return (
    <div style={{
      width: 220,
      borderRight: "1px solid rgba(255,255,255,0.06)",
      overflowY: "auto",
      background: "rgba(10,10,10,0.6)",
      flexShrink: 0,
    }}>
      <div style={{ padding: "12px 12px 8px", fontSize: 10, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
        Agents ({agents.length})
      </div>
      {agents.map((agent) => {
        const isSelected = agent.id === selectedAgent.id;
        return (
          <div
            key={agent.id}
            onClick={() => onSelect(agent)}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              borderLeft: `3px solid ${isSelected ? "#e85d27" : "transparent"}`,
              background: isSelected ? "rgba(232,93,39,0.08)" : "transparent",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) (e.currentTarget.style.background = "rgba(255,255,255,0.03)");
            }}
            onMouseLeave={(e) => {
              if (!isSelected) (e.currentTarget.style.background = "transparent");
            }}
          >
            <div style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: isSelected ? "rgba(232,93,39,0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${isSelected ? "rgba(232,93,39,0.5)" : "rgba(255,255,255,0.08)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
              transition: "all 0.15s",
            }}>
              {agent.emoji}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#f0f0f0" : "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {agent.name}
              </div>
              <div style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                {agent.role}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
