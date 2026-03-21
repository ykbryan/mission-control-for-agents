import { Handle, Position } from "@xyflow/react";

interface AgentNodeProps {
  data: {
    id: string;
    name: string;
    emoji: string;
    role: string;
    status: "online" | "offline" | "idle";
    isSelected: boolean;
  };
}

export default function AgentNode({ data }: AgentNodeProps) {
  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border bg-[#1a1a1a] shadow-lg transition-colors min-w-[200px] ${
        data.isSelected ? "border-[#e85d27] ring-1 ring-[#e85d27]" : "border-[#333] hover:border-[#555]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-[#555] border-none" />
      
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2a2a2a] text-xl shrink-0">
        {data.emoji || "🤖"}
      </div>
      
      <div className="flex flex-col flex-1 min-w-0">
        <div className="font-semibold text-[#f0f0f0] truncate">{data.name}</div>
        <div className="text-xs text-[#888] truncate">{data.role}</div>
      </div>
      
      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          data.status === "online" ? "bg-green-500" : data.status === "idle" ? "bg-yellow-500" : "bg-gray-500"
        }`}
      />
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#555] border-none" />
    </div>
  );
}
