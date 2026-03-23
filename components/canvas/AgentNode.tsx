import { Handle, Position } from "@xyflow/react";

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
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg transition-colors min-w-[200px] ${bgClass} ${borderClass}`}
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
        {data.routerLabel && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <span className="text-[9px]">🛰️</span>
            <span className="text-[9px] font-medium tracking-wide truncate"
              style={{ color: isOrch ? "#7c3aed99" : "#55556688" }}>
              {data.routerLabel}
            </span>
            {data.platformIcon && (
              <span className="text-[9px]" title={data.machineLabel}>{data.platformIcon}</span>
            )}
            {data.machineLabel && (
              <span className="text-[9px] truncate" style={{ color: "#33333a", maxWidth: "80px" }}>{data.machineLabel}</span>
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
