"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Agent } from "@/lib/agents";
import { RouterConfig } from "@/lib/router-config";
import AgentNode from "@/components/canvas/AgentNode";
import OrgNode, { gatewayColor } from "@/components/canvas/OrgNode";
import GatewayNode from "@/components/canvas/GatewayNode";
import CanvasControls from "@/components/canvas/CanvasControls";
import type { NodeInfo } from "@/app/api/node-info/route";
import {
  detectOrchestrators,
  buildTeamStructure,
  type AgentAnalysis,
  type RouterAgent as TARouterAgent,
} from "@/lib/team-analysis";


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
  orgNode: OrgNode,
  gatewayNode: GatewayNode,
};

// ── Canvas mode constants ──────────────────────────────────────────────────
const AGENT_W = 240;  // must match card w-[240px] in AgentNode
const AGENT_H = 116;  // name + role + model badge + router/node row + padding
const AGENT_COL_GAP = 20;
const AGENT_ROW_GAP = 16;
const AGENTS_PER_ROW = 4;
const GATEWAY_H = 64;
const GATEWAY_MARGIN_TOP = 60;
const CLUSTER_GAP = 120;     // horizontal gap between gateway clusters
const AGENTS_TOP_OFFSET = 128; // vertical space below gateway node

// ── Org mode constants ─────────────────────────────────────────────────────
const ORG_W = 280;
const ORG_H = 100;
const ORG_COL_GAP = 24;
const ORG_ROW_GAP = 60;
const ORG_COLS = 5;
const ORG_ORCH_Y = 40;
const ORG_SPECIALIST_Y = ORG_ORCH_Y + ORG_H + 80;

// ── Team data types ────────────────────────────────────────────────────────
interface SimpleTeam {
  orchestratorId: string;
  orchestratorRouterId: string;
  teamName?: string;
  members: { agentId: string; routerId: string }[];
}
interface TeamData {
  teams: SimpleTeam[];
  specialized: Array<{ id: string; routerId: string }>;
}

// Module-level cache — survives React state resets within the same browser session.
// Version tag: bump when the cache schema changes to auto-invalidate stale data.
const CACHE_VERSION = 2;
let _teamDataCacheVersion = 0;
let _teamDataCache: TeamData | null = null;

export default function MissionStage({ agents, selectedAgentId, onSelectAgent, onNodeDoubleClick, mode, darkMode, onModeChange, routerConfigs }: Props) {

  const [viewMode, setViewMode] = useState<"canvas" | "org">("canvas");

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

  // ── Team data state & fetch ────────────────────────────────────────────────
  const [teamData, setTeamData] = useState<TeamData | null>(
    _teamDataCacheVersion === CACHE_VERSION ? _teamDataCache : null
  );
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== "org" || teamData || teamLoading) return;
    setTeamLoading(true);
    (async () => {
      try {
        // Fetch agents list
        const res = await fetch("/api/agents");
        const json = await res.json();
        const agentList: TARouterAgent[] = json.agents ?? [];

        // Build analyses map
        const map = new Map<string, AgentAnalysis>();
        for (const a of agentList) {
          map.set(`${a.routerId}--${a.id}`, {
            agentId: a.id, routerId: a.routerId,
            agentsMd: null, memoryMd: null,
            outgoing: new Set(), incoming: new Set(), orchScore: 0,
          });
        }

        // Fetch AGENTS.md + MEMORY.md for each agent that has them
        const agentsWithFiles = agentList.filter(a => (a.files ?? []).some(f => f === "AGENTS.md" || f === "MEMORY.md"));
        const tasks: Promise<void>[] = [];
        for (const agent of agentsWithFiles) {
          const files = agent.files ?? [];
          const fetchFile = async (file: string) => {
            try {
              const r = await fetch(`/api/agent-file?agent=${encodeURIComponent(agent.id)}&file=${encodeURIComponent(file)}&routerId=${encodeURIComponent(agent.routerId)}`);
              if (!r.ok) return;
              const j = await r.json();
              const an = map.get(`${agent.routerId}--${agent.id}`);
              if (!an) return;
              if (file === "AGENTS.md") an.agentsMd = j.content ?? null;
              else an.memoryMd = j.content ?? null;
            } catch { /* ignore */ }
          };
          if (files.includes("AGENTS.md")) tasks.push(fetchFile("AGENTS.md"));
          if (files.includes("MEMORY.md")) tasks.push(fetchFile("MEMORY.md"));
        }
        // Run in batches of 8
        for (let i = 0; i < tasks.length; i += 8) {
          await Promise.allSettled(tasks.slice(i, i + 8));
        }

        detectOrchestrators(agentList, map);
        const result = buildTeamStructure(agentList, map);
        const td: TeamData = {
          teams: result.teams,
          specialized: result.specialized.map(a => ({ id: a.id, routerId: a.routerId })),
        };
        _teamDataCache = td;
        _teamDataCacheVersion = CACHE_VERSION;
        setTeamData(td);
      } catch { /* ignore */ }
      finally { setTeamLoading(false); }
    })();
  }, [viewMode, teamData, teamLoading]);

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

  // ── Org layout ──────────────────────────────────────────────────────────────
  const { orgNodes, orgEdges } = useMemo(() => {
    const oNodes: any[] = [];
    const oEdges: any[] = [];

    if (teamData) {
      // ── Team-based layout (matches /teams page) ──────────────────────────
      const TEAM_ORCH_Y_OFFSET = 32;   // section header height
      const TEAM_MEMBER_Y_OFFSET = 32 + ORG_H + ORG_ROW_GAP; // header + orch + gap
      const SECTION_GAP = 60;
      const SPECIALIZED_LABEL_H = 32;

      let cursorY = 0;

      // Highlight/dim logic (reuse existing logic)
      const anySelected = !!selectedAgentId;
      const highlightSet = new Set<string>();
      if (anySelected) {
        highlightSet.add(selectedAgentId);
        for (const team of teamData.teams) {
          const orchId = `${team.orchestratorRouterId}--${team.orchestratorId}`;
          if (orchId === selectedAgentId) {
            team.members.forEach(m => highlightSet.add(`${m.routerId}--${m.agentId}`));
          } else if (team.members.some(m => `${m.routerId}--${m.agentId}` === selectedAgentId)) {
            highlightSet.add(orchId);
          }
        }
      }

      const seenNodeIds = new Set<string>();
      const makeNode = (agent: Agent | undefined, nodeId: string, x: number, y: number, tier: "orchestrator" | "specialist", routerLabel: string) => {
        if (!agent) return null;
        if (seenNodeIds.has(nodeId)) return null;
        seenNodeIds.add(nodeId);
        const isSelected = nodeId === selectedAgentId;
        const isHighlighted = !isSelected && highlightSet.has(nodeId);
        const isDimmed = anySelected && !isSelected && !isHighlighted;
        const ni = nodeInfoMap.get(agent.routerId ?? "");
        return {
          id: nodeId,
          type: "orgNode",
          position: { x, y },
          data: {
            id: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role,
            status: (agent.status ?? "online") as "online" | "offline" | "idle",
            isSelected, isHighlighted, isDimmed,
            tier,
            routerLabel,
            gatewayColor: routerConfigs.length > 0 ? gatewayColor(routerLabel) : "#555",
            model: agentModelMap.get(nodeId) ?? agentModelMap.get(agent.id),
            nodeHostname: agent.nodeHostname,
            platformIcon: ni?.platformIcon,
            machineLabel: ni?.machineLabel,
          },
        };
      };

      for (const team of teamData.teams) {
        const orchAgent = agents.find(a => a.id === team.orchestratorId);
        const orchNodeId = `${team.orchestratorRouterId}--${team.orchestratorId}`;
        const rc = routerConfigs.find(r => r.id === team.orchestratorRouterId);
        const routerLabel = rc?.label ?? team.orchestratorRouterId;
        const gwColor = gatewayColor(routerLabel);

        // How many member columns: min(members.length, ORG_COLS)
        const memberCols = Math.min(team.members.length, ORG_COLS);
        const memberRows = Math.ceil(team.members.length / ORG_COLS);
        const memberRowW = memberCols * ORG_W + Math.max(memberCols - 1, 0) * ORG_COL_GAP;
        const clusterW = Math.max(ORG_W, memberRowW);

        // Section header
        oNodes.push({
          id: `team-label-${team.orchestratorId}`,
          type: "orgNode",
          position: { x: 0, y: cursorY },
          draggable: false, selectable: false,
          data: {
            _isLabel: true,
            label: team.teamName ? `${team.teamName} — ${routerLabel}` : routerLabel,
            color: gwColor,
            width: clusterW,
          },
        });
        cursorY += TEAM_ORCH_Y_OFFSET;

        // Orchestrator centered
        const orchX = (clusterW - ORG_W) / 2;
        const orchNode = makeNode(orchAgent, orchNodeId, orchX, cursorY, "orchestrator", routerLabel);
        if (orchNode) oNodes.push(orchNode);
        cursorY += ORG_H + ORG_ROW_GAP;

        // Members grid
        const memberStartX = (clusterW - memberRowW) / 2;
        team.members.forEach((m, i) => {
          const memberAgent = agents.find(a => a.id === m.agentId);
          const memberNodeId = `${m.routerId}--${m.agentId}`;
          const col = i % ORG_COLS;
          const row = Math.floor(i / ORG_COLS);
          const x = memberStartX + col * (ORG_W + ORG_COL_GAP);
          const y = cursorY + row * (ORG_H + ORG_ROW_GAP);
          const memberNode = makeNode(memberAgent, memberNodeId, x, y, "specialist", routerLabel);
          if (memberNode) oNodes.push(memberNode);

          // Edge: orchestrator → member
          const edgeOn = anySelected && highlightSet.has(memberNodeId) && highlightSet.has(orchNodeId);
          oEdges.push({
            id: `org-e-${orchNodeId}-${memberNodeId}`,
            source: orchNodeId, target: memberNodeId,
            type: "smoothstep",
            style: {
              stroke: edgeOn ? gwColor : "#2a2a3a",
              strokeWidth: edgeOn ? 2 : 1.5,
              opacity: anySelected ? (edgeOn ? 0.9 : 0.08) : 0.5,
              transition: "stroke 0.2s, opacity 0.2s",
            },
            animated: edgeOn,
          });
        });

        cursorY += memberRows * (ORG_H + ORG_ROW_GAP) + SECTION_GAP;
      }

      // Specialized agents section
      if (teamData.specialized.length > 0) {
        const specCols = Math.min(teamData.specialized.length, ORG_COLS);
        const specRowW = specCols * ORG_W + Math.max(specCols - 1, 0) * ORG_COL_GAP;
        oNodes.push({
          id: "specialized-label",
          type: "orgNode",
          position: { x: 0, y: cursorY },
          draggable: false, selectable: false,
          data: { _isLabel: true, label: `Specialized Agents — ${teamData.specialized.length}`, color: "#555", width: specRowW },
        });
        cursorY += SPECIALIZED_LABEL_H;

        const specStartX = 0;
        teamData.specialized.forEach((s, i) => {
          const specAgent = agents.find(a => a.id === s.id);
          const specNodeId = `${s.routerId}--${s.id}`;
          const rc = routerConfigs.find(r => r.id === s.routerId);
          const routerLabel = rc?.label ?? s.routerId;
          const col = i % ORG_COLS;
          const row = Math.floor(i / ORG_COLS);
          const x = specStartX + col * (ORG_W + ORG_COL_GAP);
          const y = cursorY + row * (ORG_H + ORG_ROW_GAP);
          const specNode = makeNode(specAgent, specNodeId, x, y, "specialist", routerLabel);
          if (specNode) oNodes.push(specNode);
        });
      }

      return { orgNodes: oNodes, orgEdges: oEdges };
    }

    // ── Fallback: old gateway/tier layout (when teamData not yet loaded) ──

    // ── Group agents by gateway ──────────────────────────────────────────────
    // Use routerConfigs order so gateways appear in consistent order
    const gatewayOrder = routerConfigs.length > 0
      ? routerConfigs.map(rc => rc.id)
      : [...new Set(agents.map(a => a.routerId ?? "default"))];

    interface GwCluster {
      routerId: string;
      label: string;
      color: string;
      orchestrators: Agent[];
      specialists: Agent[];
    }
    const clusters: GwCluster[] = gatewayOrder.map(rid => {
      const rc    = routerConfigs.find(r => r.id === rid);
      const label = rc?.label ?? rid;
      const gwAgents = agents.filter(a => (a.routerId ?? "default") === rid);
      return {
        routerId: rid,
        label,
        color: gatewayColor(label),
        orchestrators: gwAgents.filter(a => a.tier === "orchestrator"),
        specialists: gwAgents.filter(a => a.tier !== "orchestrator")
          .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
      };
    }).filter(c => c.orchestrators.length + c.specialists.length > 0);

    // ── Build parent maps (within-gateway only) ──────────────────────────────
    const childrenOf = new Map<string, Set<string>>();
    const parentOf   = new Map<string, string>();

    for (const cluster of clusters) {
      const orchIds = cluster.orchestrators.map(a => `${cluster.routerId}--${a.id}`);
      orchIds.forEach(id => childrenOf.set(id, new Set()));
      cluster.specialists.forEach((agent, i) => {
        const nodeId = `${cluster.routerId}--${agent.id}`;
        if (orchIds.length === 0) return; // no manager in this gateway
        const col = i % ORG_COLS;
        const pId = orchIds.length === 1
          ? orchIds[0]
          : orchIds[Math.floor(col / Math.ceil(ORG_COLS / orchIds.length))] ?? orchIds[0];
        childrenOf.get(pId)?.add(nodeId);
        parentOf.set(nodeId, pId);
      });
    }

    // ── Highlight/dim based on selection ────────────────────────────────────
    const anySelected  = !!selectedAgentId;
    const allOrchIds   = [...childrenOf.keys()];
    const highlightedIds = new Set<string>();
    if (anySelected) {
      highlightedIds.add(selectedAgentId);
      if (allOrchIds.includes(selectedAgentId)) {
        childrenOf.get(selectedAgentId)?.forEach(id => highlightedIds.add(id));
      } else {
        const mgr = parentOf.get(selectedAgentId);
        if (mgr) highlightedIds.add(mgr);
      }
    }

    // ── Layout: stack clusters vertically with section headers ───────────────
    const SECTION_HEADER_H = 32; // space for gateway label above each cluster
    const SECTION_GAP      = 48; // vertical gap between clusters
    let cursorY = 0;

    for (const cluster of clusters) {
      const { routerId, label, color, orchestrators, specialists } = cluster;
      const ni    = nodeInfoMap.get(routerId);
      const gwC   = color;

      // Compute cluster width from max of orch row and spec grid
      const orchCols = orchestrators.length;
      const specCols = Math.min(specialists.length, ORG_COLS);
      const orchRowW = orchCols  * ORG_W + Math.max(orchCols - 1, 0)  * ORG_COL_GAP;
      const specRowW = specCols  * ORG_W + Math.max(specCols - 1, 0)  * ORG_COL_GAP;
      const clusterW = Math.max(orchRowW, specRowW, ORG_W);

      // Section header node (non-interactive label)
      oNodes.push({
        id: `gw-label-${routerId}`,
        type: "orgNode",
        position: { x: 0, y: cursorY },
        draggable: false,
        selectable: false,
        data: {
          _isLabel: true,
          label,
          color: gwC,
          width: clusterW,
        },
      });
      cursorY += SECTION_HEADER_H;

      const makeOrgNode = (agent: Agent, x: number, y: number) => {
        const nodeId = `${routerId}--${agent.id}`;
        const isSelected    = nodeId === selectedAgentId;
        const isHighlighted = !isSelected && highlightedIds.has(nodeId);
        const isDimmed      = anySelected && !isSelected && !isHighlighted;
        return {
          id: nodeId,
          type: "orgNode",
          position: { x, y },
          data: {
            id: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role,
            status: (agent.status ?? "online") as "online" | "offline" | "idle",
            isSelected, isHighlighted, isDimmed,
            tier: agent.tier ?? "specialist",
            routerLabel: label,
            gatewayColor: gwC,
            nodeHostname: agent.nodeHostname,
            platformIcon: ni?.platformIcon,
            machineLabel: ni?.machineLabel,
            model: agentModelMap.get(`${routerId}--${agent.id}`) ?? agentModelMap.get(agent.id),
          },
        };
      };

      // Orchestrators row
      if (orchestrators.length > 0) {
        const orchStartX = (clusterW - orchRowW) / 2;
        orchestrators.forEach((agent, i) => {
          oNodes.push(makeOrgNode(agent, orchStartX + i * (ORG_W + ORG_COL_GAP), cursorY));
        });
        cursorY += ORG_H + ORG_ROW_GAP;
      }

      // Specialists grid
      if (specialists.length > 0) {
        const specStartX = (clusterW - specRowW) / 2;
        specialists.forEach((agent, i) => {
          const col = i % ORG_COLS;
          const row = Math.floor(i / ORG_COLS);
          const x   = specStartX + col * (ORG_W + ORG_COL_GAP);
          const y   = cursorY + row * (ORG_H + ORG_ROW_GAP);
          const nodeId = `${routerId}--${agent.id}`;
          oNodes.push(makeOrgNode(agent, x, y));

          const pId = parentOf.get(nodeId);
          if (pId) {
            const edgeOn = anySelected && highlightedIds.has(nodeId) && highlightedIds.has(pId);
            oEdges.push({
              id: `org-e-${pId}-${nodeId}`,
              source: pId, target: nodeId,
              type: "smoothstep",
              style: {
                stroke: edgeOn ? gwC : "#2a2a3a",
                strokeWidth: edgeOn ? 2 : 1.5,
                opacity: anySelected ? (edgeOn ? 0.9 : 0.08) : 0.6,
                transition: "stroke 0.2s, opacity 0.2s",
              },
              animated: edgeOn,
            });
          }
        });
        const specRows = Math.ceil(specialists.length / ORG_COLS);
        cursorY += specRows * (ORG_H + ORG_ROW_GAP);
      }

      cursorY += SECTION_GAP;
    }

    return { orgNodes: oNodes, orgEdges: oEdges };
  }, [agents, selectedAgentId, routerConfigs, nodeInfoMap, agentModelMap, teamData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(viewMode === "org" ? orgNodes : initialNodes);
    setEdges(viewMode === "org" ? orgEdges : initialEdges);
  }, [viewMode, initialNodes, initialEdges, orgNodes, orgEdges, setNodes, setEdges]);

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
            {viewMode === "org" ? "Org Chart" : "Agent Canvas"}
            {routerConfigs.length > 0 && (
              <span className="ml-3 text-sm font-normal text-[#666]">
                {viewMode === "org"
                  ? `${agents.length} agent${agents.length !== 1 ? "s" : ""}`
                  : `${routerConfigs.length} gateway${routerConfigs.length !== 1 ? "s" : ""} · ${agents.length} agent${agents.length !== 1 ? "s" : ""}`}
              </span>
            )}
          </h2>
        </div>
        {/* View toggle */}
        <div style={{ display: "flex", gap: 2, background: "#0e0e0e", border: "1px solid #222", borderRadius: 8, padding: 3 }}>
          {(["canvas", "org"] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 6,
                border: "none", cursor: "pointer", transition: "all 0.15s",
                background: viewMode === v ? "#1e1e1e" : "transparent",
                color: viewMode === v ? "#e0e0e0" : "#555",
                boxShadow: viewMode === v ? "0 1px 3px #00000044" : "none",
              }}
            >
              {v === "canvas" ? "⬡ Canvas" : "🏢 Org"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full h-full relative" style={{ minHeight: 0 }}>
        {viewMode === "org" && teamLoading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#0a0a0a", zIndex: 10,
          }}>
            <span style={{ color: "#555", fontSize: 14 }}>Analysing team structure…</span>
          </div>
        )}
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
