import { Handle, Position } from "@xyflow/react";

/** Derive OS icon from a hostname string. */
function hostnameIcon(h: string): string {
  const l = h.toLowerCase();
  if (l.includes("mac") || l.includes("apple") || l.endsWith(".lan") || l.includes("mbp") || l.includes("macbook")) return "🍎";
  if (l.includes("ubuntu") || l.includes("linux") || l.includes("debian") || l.includes("fedora") || l.includes("nix")) return "🐧";
  if (l.includes("win") || l.includes("windows")) return "🪟";
  return "🖥️";
}

/** Compact display label for a model name. */
function shortModel(m: string): string {
  const l = m.toLowerCase();
  if (l.includes("claude")) {
    const match = m.match(/claude[- _.](sonnet|opus|haiku)[- _.]?(\d+[-.]?\d*)/i);
    if (match) return `claude-${match[1][0].toLowerCase()}${match[2]}`;
    return "claude";
  }
  if (l.includes("gpt")) {
    const match = m.match(/gpt[-_.]?(\d+\.?\d*)/i);
    if (match) return `gpt-${match[1]}`;
    return "gpt";
  }
  if (l.includes("gemini")) {
    const match = m.match(/gemini[-_.]?(\d+\.?\d*)/i);
    if (match) return `gemini-${match[1]}`;
    return "gemini";
  }
  if (l.includes("grok")) {
    const match = m.match(/grok[-_.]?(\d+\.?\d*)/i);
    if (match) return `grok-${match[1]}`;
    return "grok";
  }
  if (l.includes("minimax")) return "minimax";
  if (l.includes("qwen")) {
    const match = m.match(/qwen(\d+\.?\d*)/i);
    if (match) return `qwen${match[1]}`;
    return "qwen";
  }
  if (l.includes("deepseek")) return "deepseek";
  if (l.includes("llama")) return "llama";
  if (l.includes("mistral")) return "mistral";
  // Fallback: first segment before special chars, max 12 chars
  return m.split(/[-_:/]/)[0].slice(0, 12);
}

/** Provider-based accent colour for the model badge. */
function modelColor(m: string): string {
  const l = m.toLowerCase();
  if (l.includes("claude"))                          return "#c77c3a";  // Anthropic amber
  if (l.includes("gpt") || /\bo[134]\b/.test(l))    return "#19c37d";  // OpenAI green
  if (l.includes("gemini") || l.includes("google")) return "#4285f4";  // Google blue
  if (l.includes("grok"))                            return "#1da1f2";  // xAI blue
  if (l.includes("minimax"))                         return "#9b59b6";  // MiniMax purple
  if (l.includes("qwen"))                            return "#ff6a00";  // Alibaba orange
  if (l.includes("deepseek"))                        return "#0ea5e9";  // DeepSeek sky
  if (l.includes("mistral"))                         return "#f97316";  // Mistral orange
  if (l.includes("llama"))                           return "#0073e6";  // Meta blue
  return "#666";
}

interface AgentNodeProps {
  data: {
    id: string;
    name: string;
    emoji: string;
    role: string;
    status: "online" | "offline" | "idle";
    isSelected: boolean;
    tier?: "orchestrator" | "specialist";
    routerLabel?: string;
    platformIcon?: string;   // 🍎 | 🐧 | 🪟 | …
    machineLabel?: string;   // e.g. "Bryans MacBook Air" | "gorilla-ubuntu"
    nodeHostname?: string;   // specific OpenClaw worker node (e.g. "develop-ubuntu")
    model?: string;          // primary AI model from session telemetry
  };
}

export default function AgentNode({ data }: AgentNodeProps) {
  const isOrch = data.tier === "orchestrator";

  const borderClass = data.isSelected
    ? "border-[#e85d27] ring-2 ring-[#e85d27]/50"
    : isOrch
    ? "border-[#7c3aed]/70 hover:border-[#7c3aed]"
    : "border-[#333] hover:border-[#555]";

  const bgClass = isOrch ? "bg-[#1a1228]" : "bg-[#1a1a1a]";

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg transition-colors w-[240px] ${bgClass} ${borderClass}`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-[#555] border-none" />

      <div className={`flex items-center justify-center w-10 h-10 rounded-full text-xl shrink-0 ${isOrch ? "bg-[#7c3aed]/20" : "bg-[#2a2a2a]"}`}>
        {data.emoji || "🤖"}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[#f0f0f0] truncate">{data.name}</span>
          {isOrch && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#7c3aed] bg-[#7c3aed]/15 px-1.5 py-0.5 rounded shrink-0">
              main
            </span>
          )}
        </div>
        <div className="text-xs text-[#888] truncate">{data.role}</div>

        {/* Model badge */}
        {data.model && (
          <div className="mt-1">
            <span
              className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
              style={{
                color: modelColor(data.model),
                backgroundColor: `${modelColor(data.model)}18`,
                border: `1px solid ${modelColor(data.model)}30`,
              }}
              title={data.model}
            >
              ⚡ {shortModel(data.model)}
            </span>
          </div>
        )}

        {data.routerLabel && (
          <div className="flex items-center gap-1 mt-1 overflow-hidden">
            <span className="text-[9px] shrink-0">🛰️</span>
            <span className="text-[9px] font-medium tracking-wide shrink-0"
              style={{ color: isOrch ? "#7c3aed99" : "#55556688" }}>
              {data.routerLabel}
            </span>
            {data.nodeHostname ? (
              <>
                <span className="text-[9px] shrink-0">{hostnameIcon(data.nodeHostname)}</span>
                <span className="text-[9px] truncate" style={{ color: "#666680" }}>{data.nodeHostname}</span>
              </>
            ) : (
              <>
                {data.platformIcon && (
                  <span className="text-[9px] shrink-0" title={data.machineLabel}>{data.platformIcon}</span>
                )}
                {data.machineLabel && (
                  <span className="text-[9px] truncate" style={{ color: "#666680" }}>{data.machineLabel}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          data.status === "online" ? "bg-green-500" : data.status === "idle" ? "bg-yellow-500" : "bg-red-500"
        }`}
      />

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#555] border-none" />
    </div>
  );
}
