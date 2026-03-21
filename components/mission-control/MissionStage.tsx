"use client";

import { useMemo, useCallback, useEffect } from "react";
import { ReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Agent } from "@/lib/agents";
import AgentNode from "@/components/canvas/AgentNode";
import CanvasControls from "@/components/canvas/CanvasControls";

interface Props {
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  mode: "graph" | "workflow";
  darkMode: boolean;
  onModeChange: (mode: "graph" | "workflow") => void;
}

const nodeTypes = {
  agentNode: AgentNode,
};

export default function MissionStage({ agents, selectedAgentId, onSelectAgent, mode, darkMode, onModeChange }: Props) {
  // Simple layout logic for MVP: Grid placement
  const initialNodes = useMemo(() => {
    return agents.map((agent, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      return {
        id: agent.id,
        type: "agentNode",
        position: { x: col * 280 + 100, y: row * 150 + 100 },
        data: {
          id: agent.id,
          name: agent.name,
          emoji: agent.emoji,
          role: agent.role,
          status: "online", // mock status
          isSelected: agent.id === selectedAgentId,
        },
      };
    });
  }, [agents]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync isSelected state when selectedAgentId changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, isSelected: node.id === selectedAgentId },
      }))
    );
  }, [selectedAgentId, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      onSelectAgent(node.id);
    },
    [onSelectAgent]
  );

  return (
    <section className="mc-stage flex flex-col h-full w-full bg-[#0a0a0a]">
      <div className="mc-stage__toolbar p-4 flex justify-between items-center bg-[#111] z-10" style={{ borderBottom: "1px solid #333" }}>
        <div>
          <div className="text-xs text-[#e85d27] uppercase font-bold tracking-wider mb-1">Center stage</div>
          <h2 className="text-xl font-semibold text-[#f0f0f0] m-0">Agent Canvas</h2>
        </div>
      </div>

      <div className="flex-1 w-full h-full relative" style={{ minHeight: 0 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="w-full h-full"
            proOptions={{ hideAttribution: true }}
          >
            <CanvasControls />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </section>
  );
}
