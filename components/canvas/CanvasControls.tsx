import { Controls, Background, MiniMap } from "@xyflow/react";

export default function CanvasControls() {
  return (
    <>
      <Background color="#333" gap={24} size={2} />
      <Controls className="!bg-[#1a1a1a] !border-[#333] [&>button]:!bg-[#1a1a1a] [&>button]:!border-[#333] [&>button]:!text-gray-400 [&>button:hover]:!text-white" />
      <MiniMap 
        className="!bg-[#1a1a1a] !border !border-[#333] !rounded-lg"
        nodeStrokeColor="#e85d27"
        nodeColor="#2a2a2a"
        maskColor="rgba(0, 0, 0, 0.7)"
      />
    </>
  );
}
