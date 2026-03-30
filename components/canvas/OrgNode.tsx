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

/** Stable accent colour derived from the gateway label string. */
export function gatewayColor(label: string): string {
  const PALETTE = ["#e85d27", "#4285f4", "#22c55e", "#9b59b6", "#f59e0b", "#ec4899", "#06b6d4"];
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (Math.imul(31, h) + label.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

interface OrgNodeProps {
  data: {
    // Section header variant
    _isLabel?: boolean;
    label?: string;
    color?: string;
    width?: number;
    // Agent card variant
    id?: string;
    name: string;
    emoji: string;
    role: string;
    status: "online" | "offline" | "idle";
    isSelected: boolean;
    isHighlighted?: boolean;
    isDimmed?: boolean;
    tier?: "orchestrator" | "specialist";
    routerLabel?: string;
    gatewayColor?: string;   // pre-computed accent for this gateway
    model?: string;
    nodeHostname?: string;
  };
}

export default function OrgNode({ data }: OrgNodeProps) {
  // ── Section header / gateway banner ─────────────────────────────────────
  if (data._isLabel) {
    const c = data.color ?? "#555";
    return (
      <div style={{
        width: data.width ?? 280,
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 4px",
        pointerEvents: "none",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0,
          boxShadow: `0 0 6px ${c}` }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: c }}>
          {data.label}
        </span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${c}44, transparent)` }} />
      </div>
    );
  }

  const isOrch   = data.tier === "orchestrator";
  const gwColor  = data.gatewayColor ?? "#555";
  const statusColor = data.status === "online" ? "#22c55e" : data.status === "idle" ? "#eab308" : "#ef4444";

  const borderColor = data.isSelected
    ? "#e85d27"
    : data.isHighlighted
    ? (isOrch ? "#7c3aed" : "#e85d2799")
    : isOrch
    ? "#7c3aed"
    : "#222";

  const shadowStyle = data.isSelected
    ? "0 0 0 2px #e85d2760, 0 4px 24px #00000088"
    : data.isHighlighted
    ? `0 0 0 1.5px ${isOrch ? "#7c3aed80" : "#e85d2740"}, 0 4px 20px #00000066`
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
        padding: "12px 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: shadowStyle,
        transition: "border-color 0.2s, box-shadow 0.2s, opacity 0.2s",
        cursor: "pointer",
        position: "relative",
        opacity: data.isDimmed ? 0.18 : 1,
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ width: 8, height: 8, background: "#333", border: "none", top: -4 }} />

      {/* Top row: avatar + text */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          background: isOrch ? "#7c3aed22" : "#1e1e28",
          border: `1.5px solid ${isOrch ? "#7c3aed44" : "#2a2a3a"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
        }}>
          {data.emoji || "🤖"}
        </div>

        {/* Name + role + model */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "#f0f0f0",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {data.role || data.name}
          </div>

          <div style={{ fontSize: 11, color: "#666", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: statusColor, fontSize: 8,
              filter: data.status === "online" ? `drop-shadow(0 0 3px ${statusColor})` : "none" }}>●</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.name}
            </span>
          </div>

          {data.model && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4,
              color: modelColor(data.model),
              background: `${modelColor(data.model)}18`,
              border: `1px solid ${modelColor(data.model)}30`,
              alignSelf: "flex-start",
            }}>
              {shortModel(data.model)}
            </span>
          )}
        </div>
      </div>

      {/* Gateway badge — bottom strip */}
      {data.routerLabel && (
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          paddingTop: 6,
          borderTop: `1px solid ${gwColor}22`,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: gwColor,
            boxShadow: `0 0 4px ${gwColor}88`,
          }} />
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: gwColor, opacity: 0.9,
          }}>
            {data.routerLabel}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ width: 8, height: 8, background: "#333", border: "none", bottom: -4 }} />
    </div>
  );
}
