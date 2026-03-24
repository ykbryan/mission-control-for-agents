"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { agents as staticAgents, type Agent } from "@/lib/agents";
import NavRail from "@/components/mission-control/NavRail";
import AgentProfileStage from "@/components/stage/AgentProfileStage";

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
  teamName?: string;        // extracted from "## Name — Team …" heading in AGENTS.md
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";
const GREEN  = "#22c55e";

const MANAGE_KEYWORDS   = ["delegate", "orchestrat", "manage", "assign task", "coordinate", "direct", "lead", "dispatch", "your team", "you manage"];
const REPORT_KEYWORDS   = ["report to", "work under", "supervised by", "managed by", "your orchestrator", "your lead", "you report"];
const MEMORY_ORCH_TERMS = ["delegated to", "asked .+ to", "assigned .+ to", "coordinated with", "i manage", "my team"];

// Lines that are part of generic AGENTS.md templates — skip these
const TEMPLATE_SKIP = [
  "bootstrap", "birth certificate", "figure out who you are",
  "you won't need it again", "delete it", "if `",
];

function extractWorkflow(content: string): string {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("-") || line.startsWith("*") || line.startsWith("|")) continue;
    if (line.startsWith("If ") || line.startsWith("You ") || line.startsWith("Your ")) continue;
    const lower = line.toLowerCase();
    if (TEMPLATE_SKIP.some(t => lower.includes(t))) continue;
    if (line.length > 40) return line.slice(0, 220) + (line.length > 220 ? "…" : "");
  }
  return "";
}

// Extract numbered/bulleted pipeline steps from AGENTS.md content
function extractPipelineSteps(content: string): string[] {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const steps: string[] = [];
  for (const line of lines) {
    if (/^\d+[\.)]\s+/.test(line)) {
      const cleaned = line.replace(/^\d+[\.)]\s+/, "").trim();
      if (cleaned.length > 8 && cleaned.length < 220) steps.push(cleaned);
    }
  }
  if (steps.length >= 3) return steps.slice(0, 12);
  // Fallback: grab meaningful bullet points
  for (const line of lines) {
    if (/^[-*•]\s+/.test(line)) {
      const cleaned = line.replace(/^[-*•]\s+/, "").trim();
      if (cleaned.length > 8 && cleaned.length < 220) steps.push(cleaned);
    }
  }
  return steps.slice(0, 8);
}

// Extract a named team from a heading like "## The Octonauts — Team & Responsibilities"
function extractTeamName(agentsMd: string | null): string | undefined {
  if (!agentsMd) return undefined;
  const m = agentsMd.match(/^#{1,3}\s+(.+?)\s*(?:—|--|–|-)\s*(?:team|squad|crew|members?|roster|group|responsibilities)/im);
  if (m) return m[1].trim();
  return undefined;
}

// Extract task-routing lines from an orchestrator's MEMORY.md for a specific member agent
function extractMemberTaskLines(memoryMd: string, memberId: string, memberName: string | undefined): string[] {
  const lines = memoryMd.split("\n").map(l => l.trim()).filter(Boolean);
  const results: string[] = [];
  const targets = [memberId, memberName].filter(Boolean).map(s => s!.toLowerCase());
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (targets.some(t => lower.includes(t))) {
      const cleaned = line.replace(/^[-*>•#\s]+/, "").replace(/\*\*/g, "").trim();
      if (cleaned.length > 8 && cleaned.length < 150) results.push(cleaned);
    }
  }
  // dedupe
  return [...new Set(results)].slice(0, 2);
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
//
// MEMORY.md is the authoritative source — it contains real delegation records:
//   Evelyn:  "Route all X tasks to **Name**"
//   Brainy:  "→ assign to **Name**" / "assign to **Name**"
// AGENTS.md is a generic workspace template, not team-structure data.

function detectOrchestrators(
  agents: RouterAgent[],
  analyses: Map<string, AgentAnalysis>,
): Map<string, AgentAnalysis> {

  // Build a lookup: name/id (lowercase) → agentId
  const nameToId = new Map<string, string>();
  for (const a of agents) {
    nameToId.set(a.id.toLowerCase(), a.id);
    if (a.name && a.name !== a.id) nameToId.set(a.name.toLowerCase(), a.id);
  }
  // Also add static agent names/emojis
  for (const sa of staticAgents) {
    if (sa.name) nameToId.set(sa.name.toLowerCase(), sa.id);
  }

  // Helper: extract agent IDs mentioned in a text string (matches ID or Name, bold or plain)
  function extractMentionedAgents(text: string, selfId: string): Set<string> {
    const found = new Set<string>();
    // Match **Name**, *Name*, plain Name — all agent names/IDs in the lookup
    for (const [lookup, agentId] of nameToId) {
      if (agentId === selfId) continue;
      if (lookup.length < 2) continue; // skip single-char matches
      // Check for the name (case-insensitive) as a word boundary match
      const re = new RegExp(`\\b${lookup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) found.add(agentId);
    }
    return found;
  }

  // ── Pass 0: AGENTS.md — structural team definition ───────────────────────
  // New orchestrators may not yet have a MEMORY.md (never run yet).
  // Only triggers when THIS agent's own name/ID appears on the same line as
  // an orchestration verb — e.g. "Uma orchestrates" / "Uma | Orchestrator".
  // This prevents other agents' AGENTS.md templates (which share the same
  // team roster table) from being falsely promoted.
  for (const [, an] of analyses) {
    const agentsMd = an.agentsMd ?? "";
    if (!agentsMd) continue;
    const esc = an.agentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Agent's own name must be subject of (or described as) an orchestration role on the same line
    const selfOrchestratesRe = new RegExp(
      `\\b${esc}\\b[^\\n]{0,140}\\b(orchestrat|is\\s+the\\s+\\w[\\w\\s]{0,20}lead|manages\\s+the|coordinates\\s+the)\\b` +
      `|\\b(orchestrat|content\\s+lead|coordinates)\\b[^\\n]{0,80}\\b${esc}\\b`,
      "i"
    );
    if (!selfOrchestratesRe.test(agentsMd)) continue;
    const mentioned = extractMentionedAgents(agentsMd, an.agentId);
    if (mentioned.size < 2) continue;
    for (const targetId of mentioned) {
      an.outgoing.add(targetId);
    }
  }

  // ── Pass 1: MEMORY.md — primary delegation evidence ──────────────────────
  // Parse the actual delegation patterns found in the MEMORY.md files.
  // Evelyn-style:  "Route all X to **Agent**"
  // Brainy-style:  "→ assign to **Agent**" or "assign to **Agent**"
  // General:       "delegate to **Agent**", "hand to **Agent**", "ask **Agent**"
  // Agent names are single words (possibly hyphenated: evelyn-linkedin).
  // Capture exactly one such token — no spaces — then stop at whitespace or punctuation.
  const DELEGATION_PATTERNS = [
    /route\s+.*?\bto\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s+(?:in|at|via|for|and|through|about|from)\b|\s*[-–(,.]|\s*$)/gim,
    /→\s*assign\s+to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
    /assign\s+to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
    /delegate\s+to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
    /hand(?:s?)\s+(?:off\s+)?to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
    /\bask\s+\*?\*?(\w[\w-]*)\*?\*?\s+to\b/gim,
    /escalate\s+to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
  ];

  for (const [, an] of analyses) {
    const mem = an.memoryMd ?? "";
    for (const pattern of DELEGATION_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(mem)) !== null) {
        const name = match[1]?.trim().toLowerCase();
        if (!name) continue;
        const targetId = nameToId.get(name);
        if (targetId && targetId !== an.agentId) {
          an.outgoing.add(targetId);
        }
      }
    }
  }

  // ── Pass 2: inbound — who do agents say they route to / work under? ───────
  // Each agent's MEMORY.md may cite the orchestrator they report through.
  // "Evelyn remains the executive router", "report back to Bryan via Evelyn"
  const inboundScore = new Map<string, number>();
  for (const [, an] of analyses) {
    const mem = (an.memoryMd ?? "").toLowerCase();
    // Look for this agent deferring/escalating to another agent
    const ESCALATION = [
      /escalat\w*\s+to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
      /report\s+back\s+to\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s*[-–(,.]|\s+|\s*$)/gim,
      /via\s+\*?\*?(\w[\w-]*)\*?\*?(?:\s+for\s+cross|\s+for\s+exec)/gim,
      /(\w[\w-]*)\s+remains\s+the\s+(?:executive|primary|main)\s+router/gim,
    ];
    for (const pat of ESCALATION) {
      const re = new RegExp(pat.source, pat.flags);
      let m;
      while ((m = re.exec(mem)) !== null) {
        const name = m[1]?.trim().toLowerCase();
        if (!name) continue;
        const targetId = nameToId.get(name);
        if (targetId && targetId !== an.agentId) {
          inboundScore.set(targetId, (inboundScore.get(targetId) ?? 0) + 2);
        }
      }
    }
  }

  // ── Pass 4: scoring ────────────────────────────────────────────────────────
  for (const [, an] of analyses) {
    // Primary: number of unique agents this one delegates to (×5)
    let score = an.outgoing.size * 5;

    // Inbound: cited as orchestrator/router by others (×3)
    score += (inboundScore.get(an.agentId) ?? 0) * 3;

    // Role/soul keyword in static config — high-confidence explicit label (+12)
    const staticAgent = staticAgents.find(s => s.id === an.agentId);
    if (staticAgent) {
      const text = `${staticAgent.role ?? ""} ${staticAgent.soul ?? ""}`.toLowerCase();
      if (["chief of staff", "orchestrat", "project lead", "swarm lead", "lead agent"].some(w => text.includes(w))) {
        score += 12;
      }
    }

    // MEMORY.md explicitly says this agent IS the orchestrator/lead (+10)
    const mem = an.memoryMd ?? "";
    if (/\b(is the|as the|acting as|serves as)\s+(project lead|orchestrator|swarm\s+orchestrator|executive router|lead)\b/i.test(mem)) {
      score += 10;
    }

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
  // null = all collapsed (default). Clicking a team expands it.
  const [openTeamId, setOpenTeamId]           = useState<string | null>(null);
  const [openPipelineId, setOpenPipelineId]   = useState<string | null>(null);
  const [drilledAgent, setDrilledAgent]       = useState<Agent | null>(null);

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

  const { teams, specialized, unassigned } = useMemo(() => {
    if (!analyses.size) return { teams: [], specialized: [], unassigned: agents };

    // Sort by orchScore desc
    const sorted = [...analyses.values()].sort((a, b) => b.orchScore - a.orchScore);

    // Orchestrator = outgoing ≥ 1 AND score is a statistical outlier
    // Use mean + 0.5 std-dev as the adaptive threshold so we don't need a
    // magic number — works whether there are 2 or 5 orchestrators in the set.
    const scores = sorted.map(a => a.orchScore);
    const mean = scores.reduce((s, v) => s + v, 0) / (scores.length || 1);
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length || 1);
    const stdDev = Math.sqrt(variance);
    const threshold = Math.max(3, mean + 0.5 * stdDev); // floor at 3 to ignore near-zero noise
    const orchestrators = sorted.filter(a => a.orchScore >= threshold && a.outgoing.size >= 1);

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
      const teamName = extractTeamName(orch.agentsMd);
      return {
        orchestratorId: orch.agentId,
        orchestratorRouterId: orch.routerId,
        members,
        workflow,
        teamName,
      };
    });

    const remaining = agents.filter(a => !assigned.has(`${a.routerId}--${a.id}`));
    // Specialized = remaining agents that have a static profile with meaningful skills
    const specialized = remaining.filter(a => {
      const stat = staticAgents.find(s => s.id === a.id);
      return stat && stat.skills.length >= 1;
    });
    const specializedIds = new Set(specialized.map(a => `${a.routerId}--${a.id}`));
    const unassigned = remaining.filter(a => !specializedIds.has(`${a.routerId}--${a.id}`));
    return { teams, specialized, unassigned };
  }, [analyses, agents]);

  // ── helpers to get static agent info ────────────────────────────────────────

  const getStatic = (agentId: string) => staticAgents.find(a => a.id === agentId);
  const getLiveAgent = (agentId: string, routerId: string) =>
    agents.find(a => a.id === agentId && a.routerId === routerId) ??
    agents.find(a => a.id === agentId);

  // ── open agent profile overlay ───────────────────────────────────────────────

  function openAgentProfile(agentId: string, routerId: string) {
    const stat = staticAgents.find(a => a.id === agentId);
    if (!stat) return;
    const live = getLiveAgent(agentId, routerId);
    const status: Agent["status"] = live?.lastActiveAt && Date.now() - live.lastActiveAt < 300_000 ? "online" : "offline";
    setDrilledAgent({ ...stat, routerId, status });
  }

  // ── agent mini-card ─────────────────────────────────────────────────────────

  function MemberCard({ agentId, routerId, taskLines }: { agentId: string; routerId: string; taskLines?: string[] }) {
    const live = getLiveAgent(agentId, routerId);
    const stat = getStatic(agentId);
    const dot  = statusColor(live?.lastActiveAt);
    const skills = (stat?.skills ?? []).slice(0, 4);
    return (
      <div
        onClick={() => openAgentProfile(agentId, routerId)}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e85d2750"; (e.currentTarget as HTMLElement).style.background = "#0f0f14"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1e1e26"; (e.currentTarget as HTMLElement).style.background = "#0c0c10"; }}
        style={{
          background: "#0c0c10", border: "1px solid #1e1e26", borderRadius: "10px",
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px",
          transition: "border-color 0.15s, background 0.15s", cursor: "pointer",
        }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px", lineHeight: 1, flexShrink: 0 }}>{stat?.emoji ?? "🤖"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#d0d0d0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stat?.name ?? agentId}
            </p>
            <p style={{ margin: 0, fontSize: "10px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stat?.role ?? "Agent"}
            </p>
          </div>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
        </div>
        {/* Task lines from orchestrator memory */}
        {taskLines && taskLines.length > 0 && (
          <div style={{ paddingLeft: "2px", borderLeft: "2px solid #1e1e26" }}>
            {taskLines.map((line, i) => (
              <p key={i} style={{ margin: i > 0 ? "4px 0 0 0" : 0, fontSize: "10px", color: "#4a4a5a", lineHeight: 1.4, paddingLeft: "8px" }}>{line}</p>
            ))}
          </div>
        )}
        {/* Skills */}
        {skills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
            {skills.map(sk => (
              <span key={sk} style={{
                fontSize: "8px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                background: "rgba(255,255,255,0.03)", color: "#3a3a4a", borderRadius: "3px",
                padding: "2px 5px", border: "1px solid #1a1a22",
              }}>{sk}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize: "10px", color: "#2a2a34" }}>{fmtDate(live?.lastActiveAt)}</div>
      </div>
    );
  }

  function SpecialistCard({ agentId, routerId }: { agentId: string; routerId: string }) {
    const live = getLiveAgent(agentId, routerId);
    const stat = getStatic(agentId);
    const dot  = statusColor(live?.lastActiveAt);
    const skills = stat?.skills ?? [];
    return (
      <div
        onClick={() => openAgentProfile(agentId, routerId)}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e85d2750"; (e.currentTarget as HTMLElement).style.background = "#0f0f14"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1a1a22"; (e.currentTarget as HTMLElement).style.background = "#0c0c10"; }}
        style={{
          background: "#0c0c10", border: "1px solid #1a1a22", borderRadius: "10px",
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px",
          transition: "border-color 0.15s, background 0.15s", cursor: "pointer",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px", lineHeight: 1 }}>{stat?.emoji ?? "🤖"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#d0d0d0" }}>
              {stat?.name ?? agentId}
            </p>
            <p style={{ margin: 0, fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stat?.role ?? "Agent"}
            </p>
          </div>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
        </div>
        {skills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {skills.map(sk => (
              <span key={sk} style={{
                fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                background: "rgba(255,255,255,0.04)", color: "#555", borderRadius: "4px", padding: "2px 6px",
                border: "1px solid #1e1e26",
              }}>{sk}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Compact team row — always visible, click to expand
  function TeamRow({
    team, memberEmojis, isOpen, onToggle,
  }: {
    team: Team;
    memberEmojis: string[];
    isOpen: boolean;
    onToggle: () => void;
  }) {
    const live = getLiveAgent(team.orchestratorId, team.orchestratorRouterId);
    const stat = getStatic(team.orchestratorId);
    const dot  = statusColor(live?.lastActiveAt);
    const an   = analyses.get(`${team.orchestratorRouterId}--${team.orchestratorId}`);

    return (
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", cursor: "pointer",
          background: isOpen ? "#0f0f14" : "#0c0c10",
          border: "1px solid",
          borderColor: isOpen ? "#2a2a36" : "#1a1a22",
          borderLeft: `3px solid ${isOpen ? ORANGE : "#2a2a30"}`,
          borderRadius: "10px",
          padding: "14px 18px",
          display: "flex", alignItems: "center", gap: "14px",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {/* Orchestrator avatar */}
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
          background: isOpen ? "rgba(232,93,39,0.12)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${isOpen ? "rgba(232,93,39,0.25)" : "#1e1e26"}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
        }}>{stat?.emoji ?? "🤖"}</div>

        {/* Name + role */}
        <div style={{ minWidth: "160px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#e0e0e0" }}>{stat?.name ?? team.orchestratorId}</span>
            <span style={{
              fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              background: "rgba(232,93,39,0.13)", color: ORANGE, borderRadius: "3px", padding: "1px 5px",
            }}>Lead</span>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
          </div>
          <p style={{ margin: 0, fontSize: "10px", color: "#444" }}>{stat?.role ?? "Orchestrator"}</p>
          {team.teamName && (
            <p style={{ margin: "2px 0 0", fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: ORANGE + "99" }}>{team.teamName}</p>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "28px", background: "#1e1e26", flexShrink: 0 }} />

        {/* Member emoji strip */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1, minWidth: 0, flexWrap: "wrap" }}>
          {memberEmojis.map((em, i) => (
            <span key={i} style={{
              width: "28px", height: "28px", borderRadius: "7px", fontSize: "15px",
              background: "#111118", border: "1px solid #1a1a22",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>{em}</span>
          ))}
          <span style={{ fontSize: "10px", color: "#333", marginLeft: "4px" }}>
            {team.members.length} member{team.members.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Meta + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {an?.outgoing.size ? (
            <span style={{ fontSize: "10px", color: "#333" }}>{an.outgoing.size} reports</span>
          ) : null}
          <span style={{ fontSize: "10px", color: "#2a2a34", fontFamily: "ui-monospace,monospace" }}>
            {fmtDate(live?.lastActiveAt)}
          </span>
          <span style={{ fontSize: "11px", color: isOpen ? ORANGE : "#2a2a34" }}>{isOpen ? "▲" : "▼"}</span>
        </div>
      </button>
    );
  }

  // Expanded detail panel — pipeline + member cards
  function TeamDetail({
    team, orchAn, isPipelineOpen, onPipelineToggle,
  }: {
    team: Team;
    orchAn: AgentAnalysis | undefined;
    isPipelineOpen: boolean;
    onPipelineToggle: () => void;
  }) {
    const orchMemory = orchAn?.memoryMd ?? "";
    const pipelineSteps = extractPipelineSteps(orchAn?.agentsMd ?? "");

    return (
      <div style={{
        background: "#08080c", border: "1px solid #1a1a22",
        borderTop: "none", borderRadius: "0 0 10px 10px",
        overflow: "hidden",
      }}>
        {/* Pipeline toggle bar */}
        {pipelineSteps.length > 0 && (
          <div style={{ borderBottom: "1px solid #111116" }}>
            <button
              onClick={onPipelineToggle}
              style={{
                width: "100%", textAlign: "left", padding: "10px 20px",
                display: "flex", alignItems: "center", gap: "8px",
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: isPipelineOpen ? ORANGE : "#2a2a34" }}>
                Coordination Pipeline
              </span>
              <span style={{ fontSize: "9px", color: "#2a2a34" }}>· {pipelineSteps.length} steps</span>
              <span style={{ marginLeft: "auto", fontSize: "10px", color: isPipelineOpen ? ORANGE : "#2a2a34" }}>
                {isPipelineOpen ? "▲" : "▼"}
              </span>
            </button>
            {isPipelineOpen && (
              <div style={{ padding: "4px 20px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {pipelineSteps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{
                      width: "17px", height: "17px", borderRadius: "50%", flexShrink: 0,
                      background: "rgba(232,93,39,0.08)", border: "1px solid rgba(232,93,39,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "8px", fontWeight: 700, color: ORANGE,
                    }}>{i + 1}</span>
                    <p style={{ margin: 0, fontSize: "11px", color: "#555", lineHeight: 1.5, flex: 1 }}>{step}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Member grid */}
        {team.members.length > 0 && (
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: "0 0 10px 0", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#252530" }}>
              Team Members — {team.members.length}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
              {team.members.map(m => {
                const mStat = getStatic(m.agentId);
                const taskLines = extractMemberTaskLines(orchMemory, m.agentId, mStat?.name);
                return (
                  <MemberCard
                    key={`${m.routerId}--${m.agentId}`}
                    agentId={m.agentId}
                    routerId={m.routerId}
                    taskLines={taskLines}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>

      {/* Top nav */}
      <div style={{ borderBottom: "1px solid #1a1a22", padding: "0 24px", display: "flex", alignItems: "center", height: "52px", gap: "16px", flexShrink: 0 }}>
        <span style={{ color: "#888", fontSize: "13px" }}>Mission Control</span>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ color: "#f0f0f0", fontSize: "13px", fontWeight: 500 }}>Agentic Teams</span>
        <div style={{ flex: 1 }} />
        {loadingFiles && (
          <span style={{ fontSize: "11px", color: "#444", fontFamily: "ui-monospace,monospace" }}>
            Analysing files… {filesDone}/{filesTotal}
          </span>
        )}
      </div>

      {/* Body with NavRail */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <NavRail activeView="swarms" onViewChange={(view) => {
          if (view === "mission") window.location.href = "/";
          if (view === "activities") window.location.href = "/activities";
          if (view === "spending") window.location.href = "/spending";
        }} />

        <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 40px", display: "flex", flexDirection: "column", gap: "20px" }}>

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

        {/* Teams section label */}
        {!loadingAgents && !loadingFiles && teams.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: 0 }}>
              Orchestrated Teams — {teams.length}
            </p>
            <div style={{ flex: 1, height: "1px", background: "#1a1a22" }} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {teams.map(team => {
            const teamId = `${team.orchestratorRouterId}--${team.orchestratorId}`;
            const orchAn = analyses.get(teamId);
            const isOpen = openTeamId === teamId;
            const isPipelineOpen = openPipelineId === teamId;
            const memberEmojis = team.members.map(m => getStatic(m.agentId)?.emoji ?? "🤖");

            return (
              <div key={teamId} style={{ borderRadius: "10px", overflow: "hidden" }}>
                <TeamRow
                  team={team}
                  memberEmojis={memberEmojis}
                  isOpen={isOpen}
                  onToggle={() => setOpenTeamId(isOpen ? null : teamId)}
                />
                {isOpen && (
                  <TeamDetail
                    team={team}
                    orchAn={orchAn}
                    isPipelineOpen={isPipelineOpen}
                    onPipelineToggle={() => setOpenPipelineId(isPipelineOpen ? null : teamId)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Specialized Agents */}
        {!loadingAgents && !loadingFiles && specialized.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: 0 }}>
                Specialized Agents — {specialized.length}
              </p>
              <div style={{ flex: 1, height: "1px", background: "#1a1a22" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px" }}>
              {specialized.map(a => (
                <SpecialistCard key={`${a.routerId}--${a.id}`} agentId={a.id} routerId={a.routerId} />
              ))}
            </div>
          </div>
        )}

        {/* Unassigned agents */}
        {!loadingAgents && unassigned.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#333", margin: 0 }}>
                Other — {unassigned.length}
              </p>
              <div style={{ flex: 1, height: "1px", background: "#1a1a22" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
              {unassigned.map(a => (
                <MemberCard key={`${a.routerId}--${a.id}`} agentId={a.id} routerId={a.routerId} />
              ))}
            </div>
          </div>
        )}
        </div>
        </div>{/* end scrollable content */}
      </div>{/* end body flex */}

      {/* ── Agent Profile Overlay ──────────────────────────────────────────── */}
      {drilledAgent && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          {/* Backdrop */}
          <div
            onClick={() => setDrilledAgent(null)}
            style={{ flex: 1, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          />
          {/* Side panel */}
          <div style={{
            width: "min(520px, 100vw)", height: "100%",
            display: "flex", flexDirection: "column",
            background: "#080810",
            borderLeft: "1px solid #1a1a2e",
            boxShadow: "-24px 0 80px rgba(0,0,0,0.6)",
            animation: "slideInRight 0.22s cubic-bezier(0.16,1,0.3,1)",
          }}>
            <AgentProfileStage agent={drilledAgent} onBack={() => setDrilledAgent(null)} />
          </div>
          <style>{`@keyframes slideInRight { from { transform: translateX(40px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
        </div>
      )}
    </div>
  );
}
