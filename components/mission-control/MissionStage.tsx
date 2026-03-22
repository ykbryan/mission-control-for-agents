"use client";

import { useMemo, useCallback, useEffect } from "react";
import { ReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Agent } from "@/lib/agents";
import { RouterConfig } from "@/lib/router-config";
import AgentNode from "@/components/canvas/AgentNode";
import GatewayNode from "@/components/canvas/GatewayNode";
import CanvasControls from "@/components/canvas/CanvasControls";

interface Props {
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
  mode: "graph" | "workflow";
  darkMode: boolean;
  onModeChange: (mode: "graph" | "workflow") => void;
  routerConfigs: RouterConfig[];
}

const nodeTypes = {
  agentNode: AgentNode,
  gatewayNode: GatewayNode,
};

export default function MissionStage({ agents, selectedAgentId, onSelectAgent, onNodeDoubleClick, mode, darkMode, onModeChange, routerConfigs }: Props) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const multiRouter = routerConfigs.length > 1;

    if (!multiRouter) {
      // Single router: show agents in a grid (current behavior), no gateway node
      const nodes = agents.map((agent, index) => {
        const col = index % 4;
        const row = Math.floor(index / 4);
        return {
          id: agent.id,
          type: "agentNode" as const,
          position: { x: col * 280 + 100, y: row * 150 + 100 },
          data: {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            status: "online" as const,
            isSelected: agent.id === selectedAgentId,
          },
        };
      });
      return { initialNodes: nodes, initialEdges: [] };
    }

    // Multi-router: show gateway nodes at top, agents clustered beneath them
    const GATEWAY_Y = 60;
    const AGENT_Y_START = 260;
    const COLUMN_WIDTH = 320;
    const AGENT_ROW_HEIGHT = 150;
    const AGENTS_PER_ROW = 3;

    // Group agents by routerId
    const agentsByRouter: Record<string, Agent[]> = {};
    for (const rc of routerConfigs) {
      agentsByRouter[rc.id] = [];
    }
    for (const agent of agents) {
      const rid = agent.routerId ?? routerConfigs[0]?.id;
      if (rid && agentsByRouter[rid]) {
        agentsByRouter[rid].push(agent);
      }
    }

    const nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, unknown>;
    }> = [];
    const edges: Array<{ id: string; source: string; target: string; style?: Record<string, unknown> }> = [];

    routerConfigs.forEach((rc, routerIndex) => {
      const colCenterX = routerIndex * (AGENTS_PER_ROW * COLUMN_WIDTH + 80) + (AGENTS_PER_ROW * COLUMN_WIDTH) / 2;
      const gatewayId = `gateway-${rc.id}`;

      // Count agents for this gateway
      const routerAgents = agentsByRouter[rc.id] ?? [];

      // Gateway node
      nodes.push({
        id: gatewayId,
        type: "gatewayNode",
        position: { x: colCenterX - 110, y: GATEWAY_Y },
        data: {
          label: rc.label,
          url: rc.url,
          agentCount: routerAgents.length,
        },
      });

      // Agent nodes
      routerAgents.forEach((agent, agentIndex) => {
        const col = agentIndex % AGENTS_PER_ROW;
        const row = Math.floor(agentIndex / AGENTS_PER_ROW);
        const x = routerIndex * (AGENTS_PER_ROW * COLUMN_WIDTH + 80) + col * COLUMN_WIDTH + 20;
        const y = AGENT_Y_START + row * AGENT_ROW_HEIGHT;

        nodes.push({
          id: agent.id,
          type: "agentNode",
          position: { x, y },
          data: {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            status: "online" as const,
            isSelected: agent.id === selectedAgentId,
          },
        });

        // Edge from gateway to agent
        edges.push({
          id: `edge-${gatewayId}-${agent.id}`,
          source: gatewayId,
          target: agent.id,
          style: { stroke: "#444", strokeWidth: 1 },
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [agents, selectedAgentId, routerConfigs]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes when agents filter changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

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
    (_: React.MouseEvent, node: { id: string; type?: string }) => {
      // Don't select gateway nodes
      if (node.type === "gatewayNode") return;
      onSelectAgent(node.id);
    },
    [onSelectAgent]
  );

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: { id: string; type?: string }) => {
      if (node.type === "gatewayNode") return;
      onSelectAgent(node.id);
      if (onNodeDoubleClick) {
        onNodeDoubleClick(node.id);
      }
    },
    [onSelectAgent, onNodeDoubleClick]
  );

  return (
    <section className="mc-stage flex flex-col h-full w-full bg-[#0a0a0a]">
      <div className="mc-stage__toolbar p-4 flex justify-between items-center bg-[#111] z-10 border-b border-[#333]">
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
            onNodeDoubleClick={handleNodeDoubleClick}
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
