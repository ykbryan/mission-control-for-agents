import { agents as staticAgents } from "@/lib/agents";

// ─── types ────────────────────────────────────────────────────────────────────

export interface RouterAgent {
  id: string;
  name: string;
  routerId: string;
  files?: string[];
  tier?: string;
}

export interface AgentAnalysis {
  agentId: string;
  routerId: string;
  agentsMd: string | null;
  memoryMd: string | null;
  outgoing: Set<string>;   // agents this one explicitly manages/delegates to
  incoming: Set<string>;   // agents that delegate TO this agent
  orchScore: number;
}

export interface SimpleTeam {
  orchestratorId: string;
  orchestratorRouterId: string;
  teamName?: string;
  members: { agentId: string; routerId: string }[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// Extract a named team from a heading like:
//   "## The Octonauts — Team & Responsibilities"
//   "## Shelldon Swarm Protocol — Brainy's Operating Law"
// Checks both AGENTS.md and MEMORY.md
export function extractTeamName(agentsMd: string | null, memoryMd?: string | null): string | undefined {
  // [^\n]* allows arbitrary words (including apostrophes) before the keyword on the same line
  const PATTERN = /^#{1,3}\s+(.+?)\s*(?:—|--|–|-)[^\n]*\b(?:team|squad|crew|members?|roster|group|responsibilities|protocol|operating|law|framework|swarm)\b/im;
  const fromAgents = agentsMd?.match(PATTERN);
  if (fromAgents) return fromAgents[1].trim();
  const fromMemory = memoryMd?.match(PATTERN);
  if (fromMemory) return fromMemory[1].trim();
  return undefined;
}

// ─── orchestrator detection ───────────────────────────────────────────────────
//
// MEMORY.md is the authoritative source — it contains real delegation records:
//   Evelyn:  "Route all X tasks to **Name**"
//   Brainy:  "→ assign to **Name**" / "assign to **Name**"
// AGENTS.md is a generic workspace template, not team-structure data.

export function detectOrchestrators(
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

// ─── buildTeamStructure ───────────────────────────────────────────────────────

export function buildTeamStructure(
  agents: RouterAgent[],
  analyses: Map<string, AgentAnalysis>,
): { teams: SimpleTeam[]; specialized: RouterAgent[] } {
  if (!analyses.size) return { teams: [], specialized: [] };

  // Sort by orchScore desc
  const sorted = [...analyses.values()].sort((a, b) => b.orchScore - a.orchScore);

  // Orchestrator = outgoing ≥ 1 AND score is a statistical outlier
  // Use mean + 0.5 std-dev as the adaptive threshold so we don't need a
  // magic number — works whether there are 2 or 5 orchestrators in the set.
  const scores = sorted.map(a => a.orchScore);
  const mean = scores.reduce((s, v) => s + v, 0) / (scores.length || 1);
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length || 1);
  const stdDev = Math.sqrt(variance);
  const threshold = Math.max(3, mean + 0.5 * stdDev);
  const orchestrators = sorted.filter(a => a.orchScore >= threshold && a.outgoing.size >= 1);

  const assigned = new Set<string>();
  // Pre-mark all orchestrators so they are never listed as members of each other's teams
  for (const orch of orchestrators) {
    assigned.add(`${orch.routerId}--${orch.agentId}`);
  }
  const teams: SimpleTeam[] = orchestrators.map(orch => {
    const members = [...orch.outgoing]
      .map(memberId => {
        const a = agents.find(ag => ag.id === memberId && ag.routerId === orch.routerId)
          ?? agents.find(ag => ag.id === memberId);
        if (!a) return null;
        const key = `${a.routerId}--${a.id}`;
        if (assigned.has(key)) return null; // already in an earlier team
        assigned.add(key);
        return { agentId: a.id, routerId: a.routerId };
      })
      .filter(Boolean) as { agentId: string; routerId: string }[];

    const teamName = extractTeamName(orch.agentsMd, orch.memoryMd);
    return {
      orchestratorId: orch.agentId,
      orchestratorRouterId: orch.routerId,
      teamName,
      members,
    };
  });

  const remaining = agents.filter(a => !assigned.has(`${a.routerId}--${a.id}`));
  // Specialized = remaining agents that have a static profile with meaningful skills
  const specialized = remaining.filter(a => {
    const stat = staticAgents.find(s => s.id === a.id);
    return stat && stat.skills.length >= 1;
  });

  return { teams, specialized };
}
