"use client";
import { Agent } from "@/lib/agents";

interface Props {
  agents: Agent[];
  selectedAgent: Agent;
  onSelect: (a: Agent) => void;
}

export default function AgentList({ agents, selectedAgent, onSelect }: Props) {
  return (
    <div
      style={{
        width: 244,
        overflowY: "auto",
        background: "linear-gradient(180deg, rgba(15,16,20,0.88), rgba(12,13,17,0.72))",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 28,
        boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        flexShrink: 0,
        padding: 10,
      }}
    >
      <div
        style={{
          padding: "12px 12px 10px",
          fontSize: 10,
          color: "#626b78",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        Agents ({agents.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {agents.map((agent) => {
          const isSelected = agent.id === selectedAgent.id;
          return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent)}
              style={{
                padding: "12px 14px",
                cursor: "pointer",
                border: `1px solid ${isSelected ? "rgba(232,93,39,0.28)" : "rgba(255,255,255,0.02)"}`,
                background: isSelected
                  ? "linear-gradient(135deg, rgba(232,93,39,0.16), rgba(232,93,39,0.06))"
                  : "rgba(255,255,255,0.02)",
                borderRadius: 18,
                transition: "all 0.18s ease",
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: isSelected ? "0 16px 30px rgba(232,93,39,0.14)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.02)";
                }
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  background: isSelected ? "rgba(232,93,39,0.18)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isSelected ? "rgba(232,93,39,0.38)" : "rgba(255,255,255,0.07)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                  flexShrink: 0,
                  transition: "all 0.18s ease",
                }}
              >
                {agent.emoji}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 650,
                    color: isSelected ? "#f5f5f5" : "#d4d7dd",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {agent.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: isSelected ? "rgba(255,255,255,0.72)" : "#727a86",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 2,
                  }}
                >
                  {agent.role}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
