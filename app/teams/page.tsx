"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { agents as staticAgents } from "@/lib/agents";

// ─── types ────────────────────────────────────────────────────────────────────

interface RouterAgent {
  id: string;
  name: string;
  configured: boolean;
  files?: string[];
  lastActiveAt?: number;
  tier?: string;
  routerId: string;
  routerLabel: string;
}

interface AgentAnalysis {
  agentId: string;
  routerId: string;
  agentsMd: string | null;
  memoryMd: string | null;
  // scoring
  outgoing: Set<string>;   // agents this one explicitly manages/delegates to
  incoming: Set<string>;   // agents that delegate TO this agent
  orchScore: number;
}

interface Team {
  orchestratorId: string;
  orchestratorRouterId: string;
  members: { agentId: string; routerId: string }[];
  workflow: string;         // extracted summary from AGENTS.md
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";
const GREEN  = "#22c55e";

const MANAGE_KEYWORDS   = ["delegate", "orchestrat", "manage", "assign task", "coordinate", "direct", "lead", "dispatch", "your team", "you manage"];
const REPORT_KEYWORDS   = ["report to", "work under", "supervised by", "managed by", "your orchestrator", "your lead", "you report"];
const MEMORY_ORCH_TERMS = ["delegated to", "asked .+ to", "assigned .+ to", "coordinated with", "i manage", "my team"];

function extractWorkflow(content: string): string {
  // Try to pull the first meaningful paragraph (skip headers, lists)
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("-") || line.startsWith("*") || line.startsWith("|")) continue;
    if (line.length > 40) return line.slice(0, 220) + (line.length > 220 ? "…" : "");
  }
  return "";
}

function statusColor(raw: number | undefined): string {
  if (!raw) return "#ef4444";
  const ts = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
  const now = Date.now();
  if (ts > now - 7 * 86400000)  return GREEN;
  if (ts > now - 30 * 86400000) return "#f59e0b";
  return "#ef4444";
}

function fmtDate(raw: number | undefined): string {
  if (!raw) return "Never";
  const ts = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── orchestrator detection ───────────────────────────────────────────────────

function detectOrchestrators(
  agents: RouterAgent[],
  analyses: Map<string, AgentAnalysis>,
): Map<string, AgentAnalysis> {
  const allIds = new Set(agents.map(a => a.id));
  const key = (a: RouterAgent) => `${a.routerId}--${a.id}`;

  // Pass 1: build outgoing (who does this agent manage?) from AGENTS.md
  for (const [, an] of analyses) {
    const content = (an.agentsMd ?? "").toLowerCase();
    for (const otherId of allIds) {
      if (otherId === an.agentId) continue;
      if (!content.includes(otherId.toLowerCase())) continue;
      // Does the content around the mention suggest management?
      const idx = content.indexOf(otherId.toLowerCase());
      const window = content.slice(Math.max(0, idx - 80), idx + 80);
      const isManage  = MANAGE_KEYWORDS.some(k => window.includes(k));
      const isReportTo = REPORT_KEYWORDS.some(k => window.includes(k));
      if (isManage && !isReportTo) an.outgoing.add(otherId);
    }

    // MEMORY.md delegation patterns
    const mem = (an.memoryMd ?? "").toLowerCase();
    for (const otherId of allIds) {
      if (otherId === an.agentId) continue;
      const regexes = [
        new RegExp(`delegated to ${otherId}`),
        new RegExp(`asked ${otherId}`),
        new RegExp(`assigned ${otherId}`),
        new RegExp(`${otherId}.*complet`),
      ];
      if (regexes.some(r => r.test(mem))) an.outgoing.add(otherId);
    }
  }

  // Pass 2: build incoming (who manages this agent?) as inverse of outgoing
  for (const [, an] of analyses) {
    for (const managedId of an.outgoing) {
      const managedKey = [...analyses.entries()].find(([, a]) => a.agentId === managedId)?.[0];
      if (managedKey) analyses.get(managedKey)?.incoming.add(an.agentId);
    }
  }

  // Pass 3: score — orchestrator = high outgoing, low incoming
  for (const [, an] of analyses) {
    let score = an.outgoing.size * 3 - an.incoming.size * 2;

    // Bonus: static agent role contains orchestrator keywords
    const staticAgent = staticAgents.find(s => s.id === an.agentId);
    if (staticAgent) {
      const text = `${staticAgent.role ?? ""} ${staticAgent.soul ?? ""}`.toLowerCase();
      const orchWords = ["chief of staff", "orchestrat", "head of", "director", "lead agent", "chief agent", "manager of agents"];
      if (orchWords.some(w => text.includes(w))) score += 8;
    }

    // Bonus: AGENTS.md contains orchestration language in own description
    const ownContent = (an.agentsMd ?? "").toLowerCase();
    const orchBonusWords = ["you orchestrate", "you manage", "your team", "delegate to", "coordinate across", "you are the orchestrator"];
    if (orchBonusWords.some(w => ownContent.includes(w))) score += 5;

    // Penalty: AGENTS.md says "you report to" or "your orchestrator is"
    if (REPORT_KEYWORDS.some(k => ownContent.includes(k))) score -= 4;

    an.orchScore = score;
  }

  return analyses;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TeamsPage() {
  const [agents, setAgents]           = useState<RouterAgent[]>([]);
  const [analyses, setAnalyses]       = useState<Map<string, AgentAnalysis>>(new Map());
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingFiles, setLoadingFiles]   = useState(false);
  const [filesTotal, setFilesTotal]   = useState(0);
  const [filesDone, setFilesDone]     = useState(0);
  const [error, setError]             = useState<string | null>(null);

  // Step 1: fetch agents
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) throw new Error("Failed to load agents");
        const json = await res.json();
        setAgents(json.agents ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingAgents(false);
      }
    })();
  }, []);

  // Step 2: fetch AGENTS.md + MEMORY.md for each agent in parallel
  const analyseAgents = useCallback(async (agentList: RouterAgent[]) => {
    setLoadingFiles(true);
    const agentsWithFiles = agentList.filter(a =>
      (a.files ?? []).some(f => f === "AGENTS.md" || f === "MEMORY.md")
    );
    const total = agentsWithFiles.length * 2; // AGENTS.md + MEMORY.md per agent
    setFilesTotal(total);
    setFilesDone(0);

    const map = new Map<string, AgentAnalysis>();
    for (const a of agentList) {
      map.set(`${a.routerId}--${a.id}`, {
        agentId: a.id, routerId: a.routerId,
        agentsMd: null, memoryMd: null,
        outgoing: new Set(), incoming: new Set(), orchScore: 0,
      });
    }

    const fetchFile = async (agent: RouterAgent, file: string): Promise<string | null> => {
      try {
        const url = `/api/agent-file?agent=${encodeURIComponent(agent.id)}&file=${encodeURIComponent(file)}&routerId=${encodeURIComponent(agent.routerId)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();
        return json.content ?? null;
      } catch {
        return null;
      } finally {
        setFilesDone(prev => prev + 1);
      }
    };

    // Fetch in parallel batches of 8
    const BATCH = 8;
    const tasks: Promise<void>[] = [];
    for (const agent of agentsWithFiles) {
      const files = agent.files ?? [];
      if (files.includes("AGENTS.md")) {
        tasks.push(fetchFile(agent, "AGENTS.md").then(content => {
          map.get(`${agent.routerId}--${agent.id}`)!.agentsMd = content;
        }));
      }
      if (files.includes("MEMORY.md")) {
        tasks.push(fetchFile(agent, "MEMORY.md").then(content => {
          map.get(`${agent.routerId}--${agent.id}`)!.memoryMd = content;
        }));
      }
    }
    // Run in batches
    for (let i = 0; i < tasks.length; i += BATCH) {
      await Promise.allSettled(tasks.slice(i, i + BATCH));
    }

    detectOrchestrators(agentList, map);
    setAnalyses(map);
    setLoadingFiles(false);
  }, []);

  useEffect(() => {
    if (!loadingAgents && agents.length > 0) analyseAgents(agents);
  }, [agents, loadingAgents, analyseAgents]);

  // ── build teams ─────────────────────────────────────────────────────────────

  const { teams, unassigned } = useMemo(() => {
    if (!analyses.size) return { teams: [], unassigned: agents };

    // Sort by orchScore desc
    const sorted = [...analyses.values()].sort((a, b) => b.orchScore - a.orchScore);

    // An agent is an orchestrator if score > 2 AND has at least 1 outgoing
    const orchestrators = sorted.filter(a => a.orchScore > 2 && a.outgoing.size > 0);

    const assigned = new Set<string>();
    const teams: Team[] = orchestrators.map(orch => {
      const orchAgent = agents.find(a => a.id === orch.agentId && a.routerId === orch.routerId);
      assigned.add(`${orch.routerId}--${orch.agentId}`);
      const members = [...orch.outgoing]
        .map(memberId => {
          const a = agents.find(ag => ag.id === memberId && ag.routerId === orch.routerId)
            ?? agents.find(ag => ag.id === memberId);
          if (!a) return null;
          assigned.add(`${a.routerId}--${a.id}`);
          return { agentId: a.id, routerId: a.routerId };
        })
        .filter(Boolean) as { agentId: string; routerId: string }[];

      const workflow = extractWorkflow(orch.agentsMd ?? "");
      return {
        orchestratorId: orch.agentId,
        orchestratorRouterId: orch.routerId,
        members,
        workflow,
      };
    });

    const unassigned = agents.filter(a => !assigned.has(`${a.routerId}--${a.id}`));
    return { teams, unassigned };
  }, [analyses, agents]);

  // ── helpers to get static agent info ────────────────────────────────────────

  const getStatic = (agentId: string) => staticAgents.find(a => a.id === agentId);
  const getLiveAgent = (agentId: string, routerId: string) =>
    agents.find(a => a.id === agentId && a.routerId === routerId) ??
    agents.find(a => a.id === agentId);

  // ── agent mini-card ─────────────────────────────────────────────────────────

  function AgentChip({ agentId, routerId }: { agentId: string; routerId: string }) {
    const live = getLiveAgent(agentId, routerId);
    const stat = getStatic(agentId);
    const dot  = statusColor(live?.lastActiveAt);
    return (
      <div style={{
        background: "#111117", border: "1px solid #1e1e26", borderRadius: "8px",
        padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px",
      }}>
        <span style={{ fontSize: "20px", lineHeight: 1 }}>{stat?.emoji ?? "🤖"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#d0d0d0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stat?.name ?? agentId}
          </p>
          <p style={{ margin: 0, fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stat?.role ?? "Agent"}
          </p>
        </div>
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
      </div>
    );
  }

  function OrchestratorCard({ agentId, routerId, workflow }: { agentId: string; routerId: string; workflow: string }) {
    const live = getLiveAgent(agentId, routerId);
    const stat = getStatic(agentId);
    const dot  = statusColor(live?.lastActiveAt);
    const an   = analyses.get(`${routerId}--${agentId}`);
    return (
      <div style={{
        background: "#0f0f12", border: "1px solid #1e1e26",
        borderTop: `2px solid ${ORANGE}`,
        borderRadius: "12px", padding: "20px 24px",
        display: "flex", gap: "16px",
      }}>
        <div style={{
          width: "52px", height: "52px", borderRadius: "12px",
          background: "rgba(232,93,39,0.1)", border: "1px solid rgba(232,93,39,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "26px", flexShrink: 0,
        }}>{stat?.emoji ?? "🤖"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#f0f0f0" }}>{stat?.name ?? agentId}</p>
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              background: "rgba(232,93,39,0.15)", color: ORANGE, borderRadius: "4px", padding: "2px 6px",
            }}>Orchestrator</span>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dot, marginLeft: "auto" }} />
          </div>
          <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#666" }}>{stat?.role ?? "Orchestrator"}</p>
          {workflow && (
            <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#888", lineHeight: 1.5, maxWidth: "600px" }}>{workflow}</p>
          )}
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#444" }}>
            <span>{an?.outgoing.size ?? 0} direct reports</span>
            <span>Last active: {fmtDate(live?.lastActiveAt)}</span>
            <span style={{ color: "#333" }}>{live?.routerLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>

      {/* Top nav */}
      <div style={{ borderBottom: "1px solid #1a1a22", padding: "0 40px", display: "flex", alignItems: "center", height: "52px", gap: "16px" }}>
        <a href="/" style={{ color: "#444", fontSize: "13px", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Mission Control
        </a>
        <span style={{ color: "#222" }}>/</span>
        <span style={{ color: "#888", fontSize: "13px", fontWeight: 500 }}>Agentic Teams</span>
        <div style={{ flex: 1 }} />
        {loadingFiles && (
          <span style={{ fontSize: "11px", color: "#444", fontFamily: "ui-monospace,monospace" }}>
            Analysing files… {filesDone}/{filesTotal}
          </span>
        )}
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "36px 40px", display: "flex", flexDirection: "column", gap: "32px" }}>

        {/* Header */}
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#f0f0f0", margin: "0 0 4px 0", letterSpacing: "-0.02em" }}>Agentic Teams</h1>
          <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>
            Team structure detected from AGENTS.md, MEMORY.md and session activity across {agents.length} agents
          </p>
        </div>

        {/* Loading */}
        {loadingAgents && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>
            <p style={{ fontFamily: "ui-monospace,monospace", fontSize: "13px" }}>Loading agents…</p>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "16px 20px", color: "#ef4444", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {/* Analysis progress */}
        {loadingFiles && filesTotal > 0 && (
          <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px 24px" }}>
            <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Analysing AGENTS.md + MEMORY.md
            </p>
            <div style={{ width: "100%", height: "4px", background: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{
                width: `${(filesDone / filesTotal) * 100}%`,
                height: "100%", background: ORANGE,
                borderRadius: "2px", transition: "width 0.3s ease",
              }} />
            </div>
            <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "#333", fontFamily: "ui-monospace,monospace" }}>
              {filesDone} / {filesTotal} files
            </p>
          </div>
        )}

        {/* Teams */}
        {!loadingAgents && !loadingFiles && teams.length === 0 && !error && (
          <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "48px", textAlign: "center" }}>
            <p style={{ color: "#333", fontSize: "13px", margin: "0 0 6px 0" }}>No orchestrators detected yet</p>
            <p style={{ color: "#222", fontSize: "12px", margin: 0 }}>
              Orchestrators are detected from AGENTS.md delegation language and MEMORY.md task patterns.
              Make sure agents have AGENTS.md files with clear delegation descriptions.
            </p>
          </div>
        )}

        {teams.map(team => {
          const orchAgent = getLiveAgent(team.orchestratorId, team.orchestratorRouterId);
          const orchStatic = getStatic(team.orchestratorId);
          return (
            <div key={`${team.orchestratorRouterId}--${team.orchestratorId}`}>
              {/* Orchestrator header */}
              <OrchestratorCard
                agentId={team.orchestratorId}
                routerId={team.orchestratorRouterId}
                workflow={team.workflow}
              />

              {/* Members grid */}
              {team.members.length > 0 && (
                <div style={{ marginTop: "12px", paddingLeft: "32px", position: "relative" }}>
                  {/* Vertical line */}
                  <div style={{
                    position: "absolute", left: "11px", top: 0, bottom: "16px",
                    width: "1px", background: "#1e1e26",
                  }} />
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "8px",
                  }}>
                    {team.members.map(m => (
                      <AgentChip key={`${m.routerId}--${m.agentId}`} agentId={m.agentId} routerId={m.routerId} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned agents */}
        {!loadingAgents && unassigned.length > 0 && (
          <div>
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#333", margin: "0 0 14px 0" }}>
              Unassigned — {unassigned.length} agents
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
              {unassigned.map(a => (
                <AgentChip key={`${a.routerId}--${a.id}`} agentId={a.id} routerId={a.routerId} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
