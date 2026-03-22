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

const AGENT_W = 240;
const AGENT_H = 72;
const AGENT_COL_GAP = 32;
const AGENT_ROW_GAP = 24;
const AGENTS_PER_ROW = 3;
const GATEWAY_H = 64;
const GATEWAY_MARGIN_TOP = 60;
const CLUSTER_GAP = 80;      // horizontal gap between gateway clusters
const AGENTS_TOP_OFFSET = 120; // vertical space below gateway node

export default function MissionStage({ agents, selectedAgentId, onSelectAgent, onNodeDoubleClick, mode, darkMode, onModeChange, routerConfigs }: Props) {

  const { initialNodes, initialEdges } = useMemo(() => {
    // Group agents by routerId
    const agentsByRouter = new Map<string, Agent[]>();
    for (const agent of agents) {
      const rid = agent.routerId ?? "default";
      if (!agentsByRouter.has(rid)) agentsByRouter.set(rid, []);
      agentsByRouter.get(rid)!.push(agent);
    }

    // Always iterate over routerConfigs so every gateway gets a node,
    // even if it has no agents or returned an error.
    const sourceList: Array<{ routerId: string; label: string; url: string; routerAgents: Agent[] }> =
      routerConfigs.length > 0
        ? routerConfigs.map(rc => ({
            routerId: rc.id,
            label: rc.label || "OpenClaw",
            url: rc.url,
            routerAgents: agentsByRouter.get(rc.id) ?? [],
          }))
        : // Fallback: no routerConfigs — use whatever groups we have
          Array.from(agentsByRouter.entries()).map(([rid, ags]) => ({
            routerId: rid,
            label: rid === "legacy" ? "OpenClaw" : rid,
            url: "",
            routerAgents: ags,
          }));

    const nodes: any[] = [];
    const edges: any[] = [];
    const gatewayW = 260;
    let cursorX = 60;

    for (const { routerId, label, url, routerAgents } of sourceList) {
      const cols = Math.min(Math.max(routerAgents.length, 1), AGENTS_PER_ROW);
      const clusterW = cols * AGENT_W + (cols - 1) * AGENT_COL_GAP;
      const totalW = Math.max(clusterW, gatewayW);

      const gatewayId = `gateway-${routerId}`;
      const gatewayX = cursorX + totalW / 2 - gatewayW / 2;

      nodes.push({
        id: gatewayId,
        type: "gatewayNode",
        position: { x: gatewayX, y: GATEWAY_MARGIN_TOP },
        data: { label, url, agentCount: routerAgents.length },
      });

      // Use compound node ID (routerId--agentId) to avoid collisions when
      // two gateways expose the same agent name.
      routerAgents.forEach((agent, i) => {
        const col = i % AGENTS_PER_ROW;
        const row = Math.floor(i / AGENTS_PER_ROW);
        const nodeId = `${routerId}--${agent.id}`;
        const agentX = cursorX + col * (AGENT_W + AGENT_COL_GAP);
        const agentY = GATEWAY_MARGIN_TOP + GATEWAY_H + AGENTS_TOP_OFFSET + row * (AGENT_H + AGENT_ROW_GAP);

        nodes.push({
          id: nodeId,
          type: "agentNode",
          position: { x: agentX, y: agentY },
          data: {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            status: "online" as const,
            isSelected: agent.id === selectedAgentId && agent.routerId === routerId,
          },
        });

        edges.push({
          id: `e-${gatewayId}-${nodeId}`,
          source: gatewayId,
          target: nodeId,
          style: { stroke: "#e85d27", strokeWidth: 1, opacity: 0.3 },
          animated: false,
        });
      });

      cursorX += totalW + CLUSTER_GAP;
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [agents, selectedAgentId, routerConfigs]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  // Sync selection highlight — node IDs are "routerId--agentId"
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, isSelected: node.data.id === selectedAgentId },
      }))
    );
  }, [selectedAgentId, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      if (node.id.startsWith("gateway-")) return;
      onSelectAgent(node.data.id); // use real agentId stored in data
    },
    [onSelectAgent]
  );

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      if (node.id.startsWith("gateway-")) return;
      onSelectAgent(node.data.id);
      if (onNodeDoubleClick) onNodeDoubleClick(node.data.id);
    },
    [onSelectAgent, onNodeDoubleClick]
  );

  return (
    <section className="mc-stage flex flex-col h-full w-full bg-[#0a0a0a]">
      <div className="mc-stage__toolbar p-4 flex justify-between items-center bg-[#111] z-10 border-b border-[#333]">
        <div>
          <div className="text-xs text-[#e85d27] uppercase font-bold tracking-wider mb-1">Center stage</div>
          <h2 className="text-xl font-semibold text-[#f0f0f0] m-0">
            Agent Canvas
            {routerConfigs.length > 0 && (
              <span className="ml-3 text-sm font-normal text-[#666]">
                {routerConfigs.length} gateway{routerConfigs.length !== 1 ? "s" : ""} · {agents.length} agent{agents.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
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
            fitViewOptions={{ padding: 0.15 }}
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

