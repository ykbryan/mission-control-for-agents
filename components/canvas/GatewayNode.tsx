import { Handle, Position } from "@xyflow/react";

interface GatewayNodeProps {
  data: {
    label: string;
    url: string;
    agentCount: number;
  };
}

export default function GatewayNode({ data }: GatewayNodeProps) {
  const shortUrl = data.url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div
      className="relative flex flex-col items-center gap-2 px-5 py-4 rounded-2xl border-2 shadow-xl min-w-[220px]"
      style={{
        background: "#0f1117",
        borderColor: "#e85d27",
        boxShadow: "0 0 18px 2px rgba(232, 93, 39, 0.25)",
      }}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-[#e85d27] border-none" />

      <div className="flex items-center gap-2">
        <span className="text-xl">🌐</span>
        <div className="flex flex-col">
          <span className="font-bold text-[#f0f0f0] text-sm leading-tight">{data.label}</span>
          <span className="text-[10px] text-[#888] truncate max-w-[160px]">{shortUrl}</span>
        </div>
      </div>

      <div
        className="text-[11px] font-semibold px-3 py-1 rounded-full"
        style={{ background: "rgba(232, 93, 39, 0.15)", color: "#e85d27" }}
      >
        {data.agentCount} {data.agentCount === 1 ? "agent" : "agents"}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#e85d27] border-none" />
    </div>
  );
}
