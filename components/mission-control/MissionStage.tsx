"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Agent } from "@/lib/agents";
import { RouterConfig } from "@/lib/router-config";
import AgentNode from "@/components/canvas/AgentNode";
import GatewayNode from "@/components/canvas/GatewayNode";
import CanvasControls from "@/components/canvas/CanvasControls";
import type { NodeInfo } from "@/app/api/node-info/route";

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

const AGENT_W = 240;  // must match card w-[240px] in AgentNode
const AGENT_H = 116;  // name + role + model badge + router/node row + padding
const AGENT_COL_GAP = 20;
const AGENT_ROW_GAP = 16;
const AGENTS_PER_ROW = 4;
const GATEWAY_H = 64;
const GATEWAY_MARGIN_TOP = 60;
const CLUSTER_GAP = 120;     // horizontal gap between gateway clusters
const AGENTS_TOP_OFFSET = 128; // vertical space below gateway node

export default function MissionStage({ agents, selectedAgentId, onSelectAgent, onNodeDoubleClick, mode, darkMode, onModeChange, routerConfigs }: Props) {

  // Node info: routerId → NodeInfo (fetched once)
  const [nodeInfoMap, setNodeInfoMap] = useState<Map<string, NodeInfo>>(new Map());
  useEffect(() => {
    fetch("/api/node-info")
      .then(r => r.json())
      .then((d: { nodes?: NodeInfo[] }) => {
        const map = new Map<string, NodeInfo>();
        for (const n of d.nodes ?? []) map.set(n.routerId, n);
        setNodeInfoMap(map);
      })
      .catch(() => {});
  }, []);

  // Agent model map: "routerId--agentId" → model name
  // Built in two passes: cost telemetry first (fast), then live session model overrides (accurate).
  const [agentModelMap, setAgentModelMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;

    async function buildModelMap() {
      // Pass 1: cost telemetry — fast baseline
      const map = new Map<string, string>();
      try {
        const r = await fetch("/api/telemetry/agent-costs");
        const d: { costs?: Array<{ agentId: string; model?: string; routerId?: string }> } = await r.json();
        for (const c of d.costs ?? []) {
          if (c.model) {
            if (c.routerId) map.set(`${c.routerId}--${c.agentId}`, c.model);
            if (!map.has(c.agentId)) map.set(c.agentId, c.model);
          }
        }
      } catch { /* ignore */ }
      if (active) setAgentModelMap(new Map(map));

      // Pass 2: live session model switches — overrides stale telemetry
      // Skips cron sessions (e.g. heartbeat) that run a different model than the primary.
      try {
        const r = await fetch("/api/agent-live-models");
        const d: { models?: Record<string, string> } = await r.json();
        for (const [key, model] of Object.entries(d.models ?? {})) {
          map.set(key, model);
        }
      } catch { /* ignore */ }
      if (active) setAgentModelMap(new Map(map));
    }

    buildModelMap();
    return () => { active = false; };
  }, []);

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
      // Split agents into orchestrators (main) and specialists
      const orchestrators = routerAgents.filter(a => a.tier === "orchestrator");
      const specialists = routerAgents.filter(a => a.tier !== "orchestrator");

      const cols = Math.min(Math.max(specialists.length || orchestrators.length, 1), AGENTS_PER_ROW);
      const clusterW = cols * AGENT_W + (cols - 1) * AGENT_COL_GAP;
      const totalW = Math.max(clusterW, gatewayW);

      const gatewayId = `gateway-${routerId}`;
      const gatewayX = cursorX + totalW / 2 - gatewayW / 2;

      const ni = nodeInfoMap.get(routerId);

      nodes.push({
        id: gatewayId,
        type: "gatewayNode",
        position: { x: gatewayX, y: GATEWAY_MARGIN_TOP },
        data: { label, url, agentCount: routerAgents.length, routerVersion: ni?.openclawVersion || undefined },
      });

      // Place orchestrators centered below the gateway
      const ORCH_Y = GATEWAY_MARGIN_TOP + GATEWAY_H + 40;
      const orchRowW = orchestrators.length * AGENT_W + (orchestrators.length - 1) * AGENT_COL_GAP;
      const orchStartX = cursorX + totalW / 2 - orchRowW / 2;

      orchestrators.forEach((agent, i) => {
        const nodeId = `${routerId}--${agent.id}`;
        const agentX = orchStartX + i * (AGENT_W + AGENT_COL_GAP);

        nodes.push({
          id: nodeId,
          type: "agentNode",
          position: { x: agentX, y: ORCH_Y },
          data: {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            status: (agent.status ?? "online") as "online" | "offline" | "idle",
            isSelected: nodeId === selectedAgentId,
            tier: "orchestrator",
            routerLabel: label,
            nodeHostname: agent.nodeHostname,
            platformIcon: ni?.platformIcon,
            machineLabel: ni?.machineLabel,
            model: agentModelMap.get(`${routerId}--${agent.id}`) ?? agentModelMap.get(agent.id),
          },
        });

        // Edge: gateway → orchestrator (solid orange)
        edges.push({
          id: `e-${gatewayId}-${nodeId}`,
          source: gatewayId,
          target: nodeId,
          style: { stroke: "#e85d27", strokeWidth: 1.5, opacity: 0.6 },
          animated: false,
        });
      });

      // Vertical offset for specialists: below orchestrators (or directly below gateway if none)
      const specialistTopY = orchestrators.length > 0
        ? ORCH_Y + AGENT_H + 40
        : GATEWAY_MARGIN_TOP + GATEWAY_H + AGENTS_TOP_OFFSET;

      // Determine the "parent" node for specialist edges
      // If there's exactly one orchestrator, specialists connect to it; otherwise to gateway
      const specialistParentId = orchestrators.length === 1
        ? `${routerId}--${orchestrators[0].id}`
        : gatewayId;
      const specialistEdgeStyle = orchestrators.length === 1
        ? { stroke: "#7c3aed", strokeWidth: 1, opacity: 0.25, strokeDasharray: "4 3" }
        : { stroke: "#e85d27", strokeWidth: 1, opacity: 0.3 };

      specialists.forEach((agent, i) => {
        const col = i % AGENTS_PER_ROW;
        const row = Math.floor(i / AGENTS_PER_ROW);
        const nodeId = `${routerId}--${agent.id}`;
        const agentX = cursorX + col * (AGENT_W + AGENT_COL_GAP);
        const agentY = specialistTopY + row * (AGENT_H + AGENT_ROW_GAP);

        nodes.push({
          id: nodeId,
          type: "agentNode",
          position: { x: agentX, y: agentY },
          data: {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            status: (agent.status ?? "online") as "online" | "offline" | "idle",
            isSelected: nodeId === selectedAgentId,
            tier: "specialist",
            routerLabel: label,
            nodeHostname: agent.nodeHostname,
            platformIcon: ni?.platformIcon,
            machineLabel: ni?.machineLabel,
            model: agentModelMap.get(`${routerId}--${agent.id}`) ?? agentModelMap.get(agent.id),
          },
        });

        edges.push({
          id: `e-${specialistParentId}-${nodeId}`,
          source: specialistParentId,
          target: nodeId,
          style: specialistEdgeStyle,
          animated: false,
        });
      });

      // If no specialists, connect all agents via orchestrators already done above
      cursorX += totalW + CLUSTER_GAP;
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [agents, selectedAgentId, routerConfigs, nodeInfoMap, agentModelMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  // Sync selection highlight — compare by compound node.id ("routerId--agentId")
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
      if (node.id.startsWith("gateway-")) return;
      onSelectAgent(node.id); // pass compound "routerId--agentId" key
    },
    [onSelectAgent]
  );

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      if (node.id.startsWith("gateway-")) return;
      onSelectAgent(node.id);
      if (onNodeDoubleClick) onNodeDoubleClick(node.id);
    },
    [onSelectAgent, onNodeDoubleClick]
  );

  return (
    <section className="mc-stage flex flex-col h-full w-full bg-[#0a0a0a]">
      <div className="mc-stage__toolbar p-4 flex justify-between items-center bg-[#111] z-10 border-b border-[#333]">
        <div>
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

