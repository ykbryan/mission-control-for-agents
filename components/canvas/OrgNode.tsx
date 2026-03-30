import { Handle, Position } from "@xyflow/react";

function shortModel(m: string): string {
  const l = m.toLowerCase();
  if (l.includes("claude")) {
    const v = m.match(/claude[- _.](sonnet|opus|haiku)[- _.]?(\d+[-.]?\d*)/i);
    return v ? `claude-${v[1][0].toLowerCase()}${v[2]}` : "claude";
  }
  if (l.includes("gemini")) {
    const v = m.match(/gemini[-_.]?(\d+\.?\d*)/i);
    return v ? `gemini-${v[1]}` : "gemini";
  }
  if (l.includes("gpt")) {
    const v = m.match(/gpt[-_.]?(\d+\.?\d*)/i);
    return v ? `gpt-${v[1]}` : "gpt";
  }
  if (l.includes("codex")) return "codex";
  return m.split(/[-_:/]/)[0].slice(0, 14);
}

function modelColor(m: string): string {
  const l = m.toLowerCase();
  if (l.includes("claude"))  return "#c77c3a";
  if (l.includes("gemini") || l.includes("google")) return "#4285f4";
  if (l.includes("gpt") || l.includes("openai"))   return "#19c37d";
  if (l.includes("grok"))    return "#1da1f2";
  if (l.includes("codex"))   return "#19c37d";
  if (l.includes("mistral")) return "#f97316";
  return "#666";
}

interface OrgNodeProps {
  data: {
    id: string;
    name: string;
    emoji: string;
    role: string;
    status: "online" | "offline" | "idle";
    isSelected: boolean;
    tier?: "orchestrator" | "specialist";
    routerLabel?: string;
    model?: string;
    nodeHostname?: string;
  };
}

export default function OrgNode({ data }: OrgNodeProps) {
  const isOrch = data.tier === "orchestrator";
  const statusColor = data.status === "online" ? "#22c55e" : data.status === "idle" ? "#eab308" : "#ef4444";

  const borderColor = data.isSelected
    ? "#e85d27"
    : isOrch
    ? "#7c3aed"
    : "#222";

  const shadowStyle = data.isSelected
    ? "0 0 0 2px #e85d2760, 0 4px 24px #00000088"
    : isOrch
    ? "0 0 0 1px #7c3aed50, 0 4px 20px #00000066"
    : "0 2px 12px #00000055";

  return (
    <div
      style={{
        width: 280,
        background: isOrch ? "#14101f" : "#111118",
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: shadowStyle,
        transition: "border-color 0.15s, box-shadow 0.15s",
        cursor: "pointer",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ width: 8, height: 8, background: "#333", border: "none", top: -4 }} />

      {/* Avatar circle */}
      <div style={{
        width: 52, height: 52,
        borderRadius: "50%",
        background: isOrch ? "#7c3aed22" : "#1e1e28",
        border: `1.5px solid ${isOrch ? "#7c3aed44" : "#2a2a3a"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, flexShrink: 0,
      }}>
        {data.emoji || "🤖"}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Role — primary heading like Paperclip */}
        <div style={{
          fontSize: 13, fontWeight: 700, color: "#f0f0f0",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.2,
        }}>
          {data.role || data.name}
        </div>

        {/* Agent name — subtitle */}
        <div style={{ fontSize: 11, color: "#666", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            color: statusColor, fontSize: 8,
            filter: data.status === "online" ? `drop-shadow(0 0 3px ${statusColor})` : "none",
          }}>●</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.name}
          </span>
        </div>

        {/* Model badge */}
        {data.model && (
          <div style={{ marginTop: 2 }}>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
              color: modelColor(data.model),
              background: `${modelColor(data.model)}18`,
              border: `1px solid ${modelColor(data.model)}30`,
              letterSpacing: "0.02em",
            }}>
              {shortModel(data.model)}
            </span>
          </div>
        )}
      </div>

      {/* Gateway label top-right */}
      {data.routerLabel && (
        <div style={{
          position: "absolute", top: 8, right: 10,
          fontSize: 8, color: "#444", fontWeight: 500,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {data.routerLabel}
        </div>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ width: 8, height: 8, background: "#333", border: "none", bottom: -4 }} />
    </div>
  );
}
