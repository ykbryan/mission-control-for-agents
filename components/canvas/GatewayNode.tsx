import { Handle, Position } from "@xyflow/react";

interface GatewayNodeProps {
  data: {
    label: string;
    url: string;
    agentCount: number;
  };
}

export default function GatewayNode({ data }: GatewayNodeProps) {
  return (
    <div className="relative flex items-center gap-3 px-5 py-3 rounded-2xl border border-[#e85d27]/60 bg-[#1a0f0a] shadow-xl shadow-[#e85d27]/10 min-w-[240px]">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#e85d27]/15 text-xl shrink-0">
        🛰️
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <div className="font-bold text-[#e85d27] truncate text-sm">{data.label}</div>
        <div className="text-[10px] text-[#888] truncate">{data.url}</div>
        <div className="text-[10px] text-[#666] mt-0.5">{data.agentCount} agent{data.agentCount !== 1 ? "s" : ""}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#e85d27]/60 border-none" />
    </div>
  );
}
