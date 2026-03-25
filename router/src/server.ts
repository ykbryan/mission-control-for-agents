/**
 * Mission Control Router
 *
 * Runs on the same machine as OpenClaw. Exposes a simple REST API that the
 * remote Mission Control dashboard can call over HTTP(S).
 *
 * Usage:
 *   npm run dev          # development with hot reload
 *   npm run build && npm start   # production
 *
 * Environment variables (or .env file):
 *   OPENCLAW_URL    URL of the local OpenClaw gateway  (default: http://127.0.0.1:18789)
 *   OPENCLAW_TOKEN  Bearer token for OpenClaw
 *   ROUTER_PORT     Port to listen on                  (default: 3010)
 *   ROUTER_TOKEN    Token Mission Control uses to auth (auto-generated if blank)
 */

import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import {
  listSessions,
  listAgents,
  listNodes,
  listCrons,
  GatewaySession,
  GatewayMessage,
} from "./openclaw";
import { estimateCost, DEFAULT_PRICE_PER_1M } from "./pricing";
import { parseMessages } from "./parse-session";

// ---------------------------------------------------------------------------
// Filesystem helpers (router runs alongside OpenClaw — direct disk access)
// ---------------------------------------------------------------------------

/** Read a .jsonl transcript and parse each line as a GatewayMessage. */
function readTranscript(transcriptPath: string): GatewayMessage[] {
  if (!fs.existsSync(transcriptPath)) return [];
  const lines = fs.readFileSync(transcriptPath, "utf8").split("\n");
  const messages: GatewayMessage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      // OpenClaw JSONL lines have a "message" wrapper or are direct message objects
      const msg = obj.message ?? obj;
      if (msg.role) messages.push(msg as GatewayMessage);
    } catch { /* skip malformed lines */ }
  }
  return messages;
}

/** Derive the agent's base directory from a session transcript path.
 *  e.g. /home/user/.openclaw/agents/main/sessions/abc.jsonl → /home/user/.openclaw/agents/main
 */
function agentDirFromTranscript(transcriptPath: string): string {
  // Go up two levels: sessions/ → agent dir
  return path.dirname(path.dirname(transcriptPath));
}

/**
 * After session compaction OpenClaw creates a NEW .jsonl file and updates
 * sessions.json on disk, but the sessions_list HTTP API may still return the
 * OLD transcriptPath (stale in-memory cache).  This function reads sessions.json
 * directly and overwrites any stale transcriptPaths with the current on-disk
 * value so callers always read the live file.
 */
function patchStaleTranscriptPaths(sessions: GatewaySession[]): void {
  // Build map: sessionKey → agentsBase (derived from each session's transcriptPath)
  const agentsBaseDirs = new Set<string>();
  for (const s of sessions) {
    if (s.transcriptPath) {
      agentsBaseDirs.add(path.dirname(path.dirname(path.dirname(s.transcriptPath))));
    }
  }
  if (agentsBaseDirs.size === 0) return;

  // Index of on-disk session files keyed by session key
  const diskMap = new Map<string, string>(); // sessionKey → sessionFile (on-disk)

  for (const agentsBase of agentsBaseDirs) {
    if (!fs.existsSync(agentsBase)) continue;
    let agentIds: string[];
    try { agentIds = fs.readdirSync(agentsBase); } catch { continue; }

    for (const agentId of agentIds) {
      const indexPath = path.join(agentsBase, agentId, "sessions", "sessions.json");
      if (!fs.existsSync(indexPath)) continue;
      try {
        type IndexEntry = { sessionFile?: string };
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, IndexEntry>;
        for (const [key, meta] of Object.entries(index)) {
          if (meta.sessionFile) diskMap.set(key, meta.sessionFile);
        }
      } catch { /* skip */ }
    }
  }

  // Patch: if disk has a different (newer) file for a known session, update it
  for (const s of sessions) {
    if (!s.key) continue;
    const diskFile = diskMap.get(s.key);
    if (!diskFile) continue;
    if (diskFile === s.transcriptPath) continue; // already correct

    // Only upgrade if disk file is newer
    let diskStat: fs.Stats;
    try { diskStat = fs.statSync(diskFile); } catch { continue; }

    const apiStat = s.transcriptPath ? (() => { try { return fs.statSync(s.transcriptPath!); } catch { return null; } })() : null;
    const apiMtime = apiStat?.mtimeMs ?? 0;
    if (diskStat.mtimeMs > apiMtime) {
      console.log(`[router] patching stale transcriptPath for ${s.key}: ${path.basename(s.transcriptPath ?? "?")} → ${path.basename(diskFile)}`);
      s.transcriptPath = diskFile;
      // Also freshen updatedAt
      if (diskStat.mtimeMs > (s.updatedAt ?? 0)) s.updatedAt = diskStat.mtimeMs;
    }
  }
}

/**
 * Supplement listSessions() with sessions found directly on disk.
 *
 * OpenClaw writes session metadata to sessions.json immediately when a session
 * starts, but sessions_list (the HTTP API) may lag behind or only return
 * completed sessions. Reading sessions.json directly gives us zero-lag access
 * to in-progress sessions.
 *
 * Two sources:
 *   1. sessions.json entries not yet in sessions_list → in-progress registered sessions
 *      (have proper agent:x:type:context keys)
 *   2. Recent .jsonl files not referenced by sessions.json at all → brand-new
 *      unregistered sessions (get a synthetic agent:x:running:uuid key)
 */
function supplementSessionsFromDisk(knownSessions: GatewaySession[]): GatewaySession[] {
  const knownKeys   = new Set(knownSessions.map(s => s.key).filter(Boolean));
  const knownFiles  = new Set(knownSessions.map(s => s.transcriptPath).filter(Boolean) as string[]);
  const agentsBaseDirs = new Set<string>();

  for (const s of knownSessions) {
    if (!s.transcriptPath) continue;
    // transcriptPath = {agentsBase}/{agentId}/sessions/{uuid}.jsonl  →  up 3 levels
    agentsBaseDirs.add(path.dirname(path.dirname(path.dirname(s.transcriptPath))));
  }

  if (agentsBaseDirs.size === 0) return [];

  const now = Date.now();
  const SCAN_WINDOW_MS = 30 * 60 * 1000; // 30 min look-back
  const extra: GatewaySession[] = [];

  for (const agentsBase of agentsBaseDirs) {
    if (!fs.existsSync(agentsBase)) continue;
    let agentIds: string[];
    try { agentIds = fs.readdirSync(agentsBase); } catch { continue; }

    for (const agentId of agentIds) {
      const sessionsDir = path.join(agentsBase, agentId, "sessions");
      if (!fs.existsSync(sessionsDir)) continue;

      // ── Source 1: sessions.json ──────────────────────────────────────────
      const indexPath = path.join(sessionsDir, "sessions.json");
      const knownSessionFiles = new Set<string>();
      if (fs.existsSync(indexPath)) {
        try {
          type IndexEntry = { sessionId?: string; updatedAt?: number; sessionFile?: string };
          const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, IndexEntry>;
          for (const [sessionKey, meta] of Object.entries(index)) {
            if (meta.sessionFile) knownSessionFiles.add(meta.sessionFile);
            if (knownKeys.has(sessionKey)) continue; // already in sessions_list
            if (!meta.sessionFile) continue;

            let stat: fs.Stats;
            try { stat = fs.statSync(meta.sessionFile); } catch { continue; }
            const mtimeMs = stat.mtimeMs;
            if (now - mtimeMs > SCAN_WINDOW_MS) continue;

            // Prefer updatedAt from the index; fall back to file mtime
            const rawTs = meta.updatedAt ?? 0;
            const updatedAt = rawTs > 0 && rawTs < 1e12 ? rawTs * 1000 : (rawTs || mtimeMs);

            extra.push({
              key: sessionKey,
              transcriptPath: meta.sessionFile,
              updatedAt,
              totalTokens: 0,
            });
          }
        } catch { /* skip malformed sessions.json */ }
      }

      // ── Source 2: orphan .jsonl files (not in sessions.json yet) ─────────
      let files: string[];
      try { files = fs.readdirSync(sessionsDir); } catch { continue; }
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const filePath = path.join(sessionsDir, file);
        if (knownFiles.has(filePath) || knownSessionFiles.has(filePath)) continue;

        let stat: fs.Stats;
        try { stat = fs.statSync(filePath); } catch { continue; }
        const mtimeMs = stat.mtimeMs;
        if (now - mtimeMs > SCAN_WINDOW_MS) continue;

        const uuid = file.slice(0, -".jsonl".length);
        extra.push({
          key: `agent:${agentId}:running:${uuid}`,
          transcriptPath: filePath,
          updatedAt: mtimeMs,
          totalTokens: Math.floor(stat.size / 800),
        });
      }
    }
  }

  return extra;
}

/** Fetch all sessions: OpenClaw API + disk supplement for in-progress ones. */
async function getAllSessions(): Promise<GatewaySession[]> {
  const api = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
  patchStaleTranscriptPaths(api);
  const disk = supplementSessionsFromDisk(api);
  return [...api, ...disk];
}

/** Resolve the directory that actually contains .md files.
 *  OpenClaw may store them directly in agentDir or in agentDir/workspace/. */
function resolveFilesDir(agentDir: string): string {
  const workspace = path.join(agentDir, "workspace");
  if (fs.existsSync(workspace) && fs.readdirSync(workspace).some((f) => f.endsWith(".md"))) {
    return workspace;
  }
  return agentDir;
}

/** List markdown files in an agent directory (checks workspace/ subdir too). */
function listAgentFiles(agentDir: string): string[] {
  const dir = resolveFilesDir(agentDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
}

/** Read a specific file from an agent directory (checks workspace/ subdir too). */
function readAgentFile(agentDir: string, name: string): string | null {
  // Safety: only allow simple filenames with .md extension, no path traversal
  if (!name.endsWith(".md") || name.includes("/") || name.includes("..")) return null;
  const filePath = path.join(resolveFilesDir(agentDir), name);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();

const OPENCLAW_URL = (process.env.OPENCLAW_URL ?? "http://127.0.0.1:18789").replace(/\/$/, "");
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN ?? "";
const ROUTER_PORT = parseInt(process.env.ROUTER_PORT ?? "3010", 10);

// Load or generate router token
const TOKEN_FILE = path.join(__dirname, "..", ".router-token");
function getOrCreateRouterToken(): string {
  if (process.env.ROUTER_TOKEN) return process.env.ROUTER_TOKEN;
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const token = randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}
const ROUTER_TOKEN = getOrCreateRouterToken();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function json(res: http.ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  });
  res.end(data);
}

function authenticate(req: http.IncomingMessage): boolean {
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${ROUTER_TOKEN}`;
}

function parseUrl(req: http.IncomingMessage): { path: string; params: URLSearchParams } {
  const parsed = new URL(req.url ?? "/", "http://localhost");
  return { path: parsed.pathname, params: parsed.searchParams };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleAgents(res: http.ServerResponse) {
  const [sessions, gatewayAgents, gatewayNodes] = await Promise.all([
    listSessions(OPENCLAW_URL, OPENCLAW_TOKEN),
    listAgents(OPENCLAW_URL, OPENCLAW_TOKEN).catch(() => [] as Awaited<ReturnType<typeof listAgents>>),
    listNodes(OPENCLAW_URL, OPENCLAW_TOKEN).catch(() => []),
  ]);

  // Build agentId → nodeHostname map from nodes_list response
  // Handles two shapes: {agents:[...], hostname} or agents list with host field
  const agentNodeMap = new Map<string, string>();
  for (const node of gatewayNodes) {
    const hostname = node.hostname ?? node.host ?? node.name ?? node.id ?? "";
    if (!hostname) continue;
    for (const agentId of (node.agents ?? [])) {
      agentNodeMap.set(String(agentId), hostname);
    }
  }
  // Also pick up host/node fields directly on each agent from agents_list
  for (const a of gatewayAgents) {
    const nodeHostname = a.host ?? a.hostname ?? a.node ?? "";
    if (nodeHostname && !agentNodeMap.has(a.id)) {
      agentNodeMap.set(a.id, String(nodeHostname));
    }
  }

  // Build a map from agentId → most recent session (for transcriptPath)
  const latestSession = new Map<string, GatewaySession>();
  for (const s of sessions) {
    const parts = s.key?.split(":");
    if (parts?.[0] === "agent" && parts[1]) {
      const existing = latestSession.get(parts[1]);
      if (!existing || (s.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        latestSession.set(parts[1], s);
      }
    }
  }

  // Merge gateway agents with session-derived ids
  type AgentEntry = { id: string; name: string; configured: boolean; files: string[]; skills?: string[]; soul?: string; lastActiveAt?: number; tier?: string; nodeHostname?: string };
  // Filter out backup/deleted agent directories (e.g. "chatty.bak_deleted_20260314")
  const BAK_RE = /\.bak[_.]|_deleted_|\.deleted\b/i;
  const agentMap = new Map<string, AgentEntry>();
  for (const a of gatewayAgents) {
    if (BAK_RE.test(a.id)) continue;
    const sess = latestSession.get(a.id);
    const agentDir: string | null =
      typeof a.workspaceDir === "string" ? a.workspaceDir
      : sess?.transcriptPath ? agentDirFromTranscript(sess.transcriptPath)
      : null;
    const files = agentDir ? listAgentFiles(agentDir) : [];
    // Skip known CLI tools that OpenClaw registers as sessions but aren't real agents.
    // Use an explicit blocklist rather than a blanket configured+files check so that
    // legitimate unconfigured agents (e.g. a bare "main" agent) are not hidden.
    const CLI_TOOLS = new Set(["claude-code", "gemini", "codex", "gemini-cli", "codex-cli", "aider", "cursor"]);
    if (CLI_TOOLS.has(a.id) && files.length === 0 && !a.configured) continue;
    // Extract skills from TOOLS.md for dynamically discovered agents.
    // Only treat an identifier as a tool name when it is the PRIMARY subject of a
    // list item — either the sole content ("- web_search") or the value after a
    // colon ("- Primary capability: web_search").  This avoids picking up tokens
    // that appear as prose modifiers ("- Anything environment-specific") or inside
    // fenced code block examples.
    const skills = agentDir ? (() => {
      const content = readAgentFile(agentDir, "TOOLS.md");
      if (!content) return undefined;
      // Strip fenced code blocks — they often hold template/example content.
      const stripped = content.replace(/```[\s\S]*?```/g, "");
      // Matches compound identifiers (web_search, pdf-reader) OR plain lowercase
      // words of 2+ chars (pdf, bash, git).  Single letters are excluded to avoid
      // false positives from stray abbreviations.
      const TOOL_ID = /^[a-z][a-z0-9]*([_-][a-z0-9][a-z0-9_-]*)*$/;
      const TOOL_MIN_LEN = 2;
      const isToolId = (s: string) => TOOL_ID.test(s) && s.length >= TOOL_MIN_LEN;
      const found: string[] = [];
      for (const line of stripped.split("\n")) {
        const m = line.match(/^\s*[-*]\s+(.+)/);
        if (!m) continue;
        const item = m[1].trim();
        // Case 1: the entire list item is a tool identifier  ("- web_search", "- pdf")
        if (isToolId(item)) { found.push(item); continue; }
        // Case 2: tool identifier follows the last colon    ("- Label: web_search")
        const colonIdx = item.lastIndexOf(":");
        if (colonIdx !== -1) {
          const after = item.slice(colonIdx + 1).trim();
          if (isToolId(after)) found.push(after);
        }
      }
      return found.length > 0 ? [...new Set(found)] : undefined;
    })() : undefined;
    // Extract a one-line soul summary from the agent's markdown files.
    // Strategy:
    //  1. AGENTS.md — first paragraph under a "Core job", "Purpose", "Mission", or "Role" heading
    //  2. SOUL.md   — first non-empty, non-heading line that isn't a bare identity declaration
    //                 ("You are X." / "I am X." add no value as a summary)
    const soul: string | undefined = agentDir ? (() => {
      // Pass 1: AGENTS.md core-job section
      const agentsMd = readAgentFile(agentDir, "AGENTS.md");
      if (agentsMd) {
        const CORE_HEADING = /^#{1,3}\s*(core\s*job|purpose|mission|primary\s*role|role)\s*$/i;
        const lines = agentsMd.split("\n");
        let inSection = false;
        for (const line of lines) {
          if (CORE_HEADING.test(line.trim())) { inSection = true; continue; }
          if (inSection) {
            if (line.trim().startsWith("#")) break; // next heading — stop
            const trimmed = line.trim();
            if (trimmed) return trimmed;
          }
        }
      }
      // Pass 2: SOUL.md — skip bare identity openers
      const soulMd = readAgentFile(agentDir, "SOUL.md");
      if (soulMd) {
        const IDENTITY_LINE = /^(you are|i am)\s+\S+\.?$/i;
        for (const line of soulMd.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && !IDENTITY_LINE.test(trimmed)) return trimmed;
        }
      }
      return undefined;
    })() : undefined;
    agentMap.set(a.id, { ...a, files, ...(skills ? { skills } : {}), ...(soul ? { soul } : {}), lastActiveAt: sess?.updatedAt, nodeHostname: agentNodeMap.get(a.id) });
  }
  for (const [id, sess] of latestSession) {
    if (BAK_RE.test(id)) continue;
    if (!agentMap.has(id)) {
      const files = sess.transcriptPath ? listAgentFiles(agentDirFromTranscript(sess.transcriptPath)) : [];
      // Only surface session-derived entries that have a real agent directory
      // (at least one markdown file). Tool/CLI sessions (claude-code, gemini,
      // codex, gemini-cli, etc.) leave transcripts but have no agent files.
      if (files.length === 0) continue;
      agentMap.set(id, { id, name: id, configured: false, files, lastActiveAt: sess?.updatedAt, nodeHostname: agentNodeMap.get(id) });
    }
  }

  // ── Orchestrator detection (three-signal scoring) ──────────────────────────
  //
  // Signal 1 — AGENTS.md responsibilities:
  //   Read every agent's AGENTS.md. If it contains delegation/management language
  //   ("delegate", "coordinate", "you manage", "assign tasks") near other agent IDs
  //   → strong orchestrator signal. If it contains "report to", "your lead",
  //   "orchestrator is" → subtract (this agent is a specialist, not the top).
  //
  // Signal 2 — MEMORY.md orchestration evidence:
  //   Read MEMORY.md. Patterns like "I asked <id> to…", "delegated to <id>",
  //   "<id> completed" → this agent has been actively orchestrating others.
  //
  // Signal 3 — Inbound subagent count:
  //   For each agent, count how many OTHER agents' files reference it in a
  //   "report-to" / "lead" / "orchestrator" context → more inbound = more orchestrator.
  //
  // Agents are multi-orchestrator aware: score >= 70% of max score qualifies.
  // ────────────────────────────────────────────────────────────────────────────

  const allIds = new Set(agentMap.keys());

  // Keywords that indicate this agent delegates/manages others (outbound)
  const DELEGATE_KW = ["delegate", "orchestrat", "coordinate", "you manage", "your team", "assign task", "assigns task", "direct the", "you lead", "manage the following"];
  // Keywords that indicate this agent reports to someone else (inbound — penalise)
  const REPORT_KW   = ["report to", "your orchestrator", "your lead", "managed by", "supervised by", "work under"];
  // Delegation verb patterns in MEMORY.md: "<verb> <agentId>"
  const DELEG_VERBS = ["asked", "delegated to", "assigned", "told", "instructed", "requested"];

  // Pre-load AGENTS.md + MEMORY.md for agents that have a session path
  const agentDocs = new Map<string, { agentsMd: string; memoryMd: string }>();
  for (const [id] of agentMap) {
    const sess = latestSession.get(id);
    if (!sess?.transcriptPath) continue;
    const dir = agentDirFromTranscript(sess.transcriptPath);
    agentDocs.set(id, {
      agentsMd: readAgentFile(dir, "AGENTS.md") ?? "",
      memoryMd: readAgentFile(dir, "MEMORY.md") ?? "",
    });
  }

  const scores = new Map<string, number>();
  const getScore = (id: string) => scores.get(id) ?? 0;

  // ── Signal 1: AGENTS.md ──────────────────────────────────────────────────
  for (const [id, docs] of agentDocs) {
    const lower = docs.agentsMd.toLowerCase();
    let s = 0;

    // How many other registered agents appear in this agent's AGENTS.md?
    for (const otherId of allIds) {
      if (otherId !== id && lower.includes(otherId.toLowerCase())) s += 2;
    }
    // Delegation/management language → strong positive
    for (const kw of DELEGATE_KW) {
      if (lower.includes(kw)) s += 12;
    }
    // "Report to / lead" language → this agent is a specialist
    for (const kw of REPORT_KW) {
      if (lower.includes(kw)) s -= 8;
    }

    scores.set(id, getScore(id) + s);
  }

  // ── Signal 2: MEMORY.md delegation patterns ──────────────────────────────
  for (const [id, docs] of agentDocs) {
    const lower = docs.memoryMd.toLowerCase();
    let s = 0;

    for (const otherId of allIds) {
      if (otherId === id) continue;
      for (const verb of DELEG_VERBS) {
        // "asked angel to", "delegated to bob" etc.
        if (lower.includes(`${verb} ${otherId}`)) s += 6;
      }
      // "<agentId> completed", "<agentId> reported back" → orchestrator assigned work
      if (lower.includes(`${otherId} completed`) || lower.includes(`${otherId} reported`)) s += 4;
    }
    // Explicit orchestration memory entries
    if (lower.includes("orchestrat") || lower.includes("i coordinated") || lower.includes("i delegated")) s += 10;

    scores.set(id, getScore(id) + s);
  }

  // ── Signal 3: Inbound subagent references ────────────────────────────────
  // If agent B's files say "report to X" / "orchestrator is X", give X inbound credit.
  for (const [, docs] of agentDocs) {
    const lower = (docs.agentsMd + " " + docs.memoryMd).toLowerCase();
    for (const candidateId of allIds) {
      const cLower = candidateId.toLowerCase();
      for (const kw of REPORT_KW) {
        // "report to evelyn", "orchestrator is evelyn"
        if (lower.includes(`${kw} ${cLower}`) || lower.includes(`${kw}: ${cLower}`)) {
          scores.set(candidateId, getScore(candidateId) + 5);
        }
      }
    }
  }

  // ── Determine orchestrators ───────────────────────────────────────────────
  let maxScore = 0;
  for (const s of scores.values()) if (s > maxScore) maxScore = s;

  // Qualify agents scoring >= 70% of top score, and at least a minimum threshold
  // to avoid false positives when there's no meaningful signal.
  const MIN_THRESHOLD = 10;
  const orchestratorIds = maxScore >= MIN_THRESHOLD
    ? new Set([...scores.entries()].filter(([, s]) => s >= maxScore * 0.7).map(([id]) => id))
    : new Set<string>();

  console.log(`[router] orchestrator detection scores: ${[...scores.entries()].sort(([,a],[,b]) => b-a).slice(0,5).map(([id,s]) => `${id}=${s}`).join(", ")}`);

  for (const [id, agent] of agentMap) {
    agent.tier = orchestratorIds.has(id) ? "orchestrator" : "specialist";
  }

  json(res, 200, { agents: Array.from(agentMap.values()) });
}

async function handleSessions(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId");
  const sessions = await getAllSessions();
  const filtered = agentId
    ? sessions.filter((s) => {
        const parts = s.key?.split(":");
        return parts?.[0] === "agent" && parts[1] === agentId;
      })
    : sessions;
  // Sort most recent first
  filtered.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  json(res, 200, { sessions: filtered });
}

async function handleSession(res: http.ServerResponse, params: URLSearchParams) {
  const key = params.get("key");
  const agentId = params.get("agentId");

  const sessions = await getAllSessions();

  // Single session by key
  if (key) {
    const target = sessions.find((s) => s.key === key);
    if (!target?.transcriptPath) { json(res, 404, { error: "No session found" }); return; }
    const messages = readTranscript(target.transcriptPath);
    const events = parseMessages(messages as Parameters<typeof parseMessages>[0]);
    json(res, 200, { key: target.key, events });
    return;
  }

  if (!agentId) { json(res, 400, { error: "Missing key or agentId" }); return; }

  // Aggregate across ALL non-empty sessions for this agent, sorted by timestamp
  const agentSessions = sessions.filter((s) => {
    const p = s.key?.split(":");
    return p?.[0] === "agent" && p[1] === agentId;
  });

  // Diagnostic: log what we found so empty-data issues can be debugged via pm2 logs
  if (agentSessions.length === 0) {
    // Help diagnose key format mismatches — log a sample of actual keys seen
    const sample = sessions.slice(0, 8).map(s => s.key).join(", ");
    console.warn(`[router] no sessions found for agent="${agentId}" (${sessions.length} total sessions; sample keys: ${sample})`);
  }

  const allMessages: GatewayMessage[] = [];
  let noPathCount = 0;
  let emptyTranscriptCount = 0;
  for (const s of agentSessions) {
    if (!s.transcriptPath) { noPathCount++; continue; }
    const msgs = readTranscript(s.transcriptPath);
    if (msgs.length === 0) { emptyTranscriptCount++; continue; }
    allMessages.push(...msgs);
  }

  if (allMessages.length === 0) {
    if (agentSessions.length > 0) {
      console.warn(`[router] agent="${agentId}" has ${agentSessions.length} sessions but 0 messages (noPath=${noPathCount}, emptyTranscript=${emptyTranscriptCount})`);
    }
    json(res, 200, { agentId, events: [] });
    return;
  }

  // Sort by timestamp ascending so events appear in chronological order
  allMessages.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  console.log(`[router] aggregated ${allMessages.length} messages across ${agentSessions.length} sessions for agent=${agentId}`);

  const events = parseMessages(allMessages as Parameters<typeof parseMessages>[0]);
  json(res, 200, { agentId, events });
}

async function handleFile(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId");
  const name = params.get("name");
  if (!agentId || !name) { json(res, 400, { error: "Missing agentId or name" }); return; }

  // Find agent dir: prefer session transcriptPath, fall back to workspace dir on disk
  const sessions = await getAllSessions();
  const latestSess = sessions
    .filter((s) => { const p = s.key?.split(":"); return p?.[0] === "agent" && p[1] === agentId; })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

  let agentDir: string | null = latestSess?.transcriptPath
    ? agentDirFromTranscript(latestSess.transcriptPath)
    : null;

  // If the transcript-derived dir has no .md files, try workspace-{agentId}/
  // (new OpenClaw layout where markdown files live in workspace-{id}/ not agents/{id}/)
  if (!agentDir || listAgentFiles(agentDir).length === 0) {
    const wsDir = path.join(os.homedir(), ".openclaw", `workspace-${agentId}`);
    if (fs.existsSync(wsDir) && listAgentFiles(wsDir).length > 0) agentDir = wsDir;
  }

  if (!agentDir) {
    console.warn(`[router] /file: no dir found for agent=${agentId}`);
    json(res, 404, { error: `No files found for agent "${agentId}"` });
    return;
  }
  const filesOnDisk = listAgentFiles(agentDir);
  console.log(`[router] /file agent=${agentId} dir=${agentDir} filesOnDisk=${filesOnDisk.join(",") || "none"} requested=${name}`);

  const content = readAgentFile(agentDir, name);
  if (content === null) {
    json(res, 404, { error: `"${name}" not found in ${agentDir} (found: ${filesOnDisk.join(", ") || "no .md files"})` });
    return;
  }
  json(res, 200, { content });
}

function readCronsFromDisk(): unknown[] {
  // OpenClaw stores registered cron jobs in ~/.openclaw/cron/jobs.json
  const candidates = [
    path.join(os.homedir(), ".openclaw", "cron", "jobs.json"),
    "/opt/openclaw/cron/jobs.json",
    "/etc/openclaw/cron/jobs.json",
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { jobs?: unknown[] } | unknown[];
      const jobs = Array.isArray(raw) ? raw : ((raw as { jobs?: unknown[] }).jobs ?? []);
      console.log(`[router] /crons-native: read ${jobs.length} jobs from ${p}`);
      return jobs;
    } catch (e) {
      console.warn(`[router] /crons-native: failed to read ${p}:`, e);
    }
  }
  console.warn("[router] /crons-native: no cron jobs.json found in any candidate path");
  return [];
}

async function handleCronsNative(res: http.ServerResponse) {
  const jobs = readCronsFromDisk();
  json(res, 200, { jobs });
}

// Cache the OpenClaw version so we only shell out once per process lifetime
let _openclawVersion: string | null = null;
function getOpenClawVersion(): string {
  if (_openclawVersion !== null) return _openclawVersion;
  try {
    const out = execSync("openclaw --version 2>/dev/null", { timeout: 3000 }).toString().trim();
    // "OpenClaw 2026.3.13 (61d171a)"  →  "2026.3.13"
    const m = out.match(/(\d{4}\.\d+\.\d+)/);
    _openclawVersion = m ? m[1] : out.split(" ")[1] ?? "unknown";
  } catch {
    _openclawVersion = "unknown";
  }
  return _openclawVersion;
}

async function handleInfo(res: http.ServerResponse) {
  const cpus = os.cpus();
  const totalMemGb = Math.round(os.totalmem() / (1024 ** 3) * 10) / 10;
  // Derive a friendly OS label
  const platform = os.platform(); // "darwin" | "linux" | "win32" | …
  let osLabel: string = platform;
  if (platform === "darwin") {
    // e.g. "macOS 14.4.1"
    osLabel = `macOS ${os.release()}`;
  } else if (platform === "linux") {
    // Try to read /etc/os-release for distro name
    try {
      const release = fs.readFileSync("/etc/os-release", "utf8");
      const nameLine = release.split("\n").find(l => l.startsWith("PRETTY_NAME="));
      if (nameLine) osLabel = nameLine.replace(/^PRETTY_NAME=["']?/, "").replace(/["']?$/, "").trim();
    } catch { osLabel = `Linux ${os.release()}`; }
  }

  json(res, 200, {
    hostname:    os.hostname(),
    platform,
    arch:        os.arch(),
    osLabel,
    cpuModel:    cpus[0]?.model ?? "Unknown",
    cpuCount:    cpus.length,
    totalMemGb,
    uptimeSeconds: Math.floor(os.uptime()),
    nodeVersion: process.version,
    routerVersion: (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (require("../package.json") as { version: string }).version;
      } catch { return "unknown"; }
    })(),
    openclawVersion: getOpenClawVersion(),
  });
}

async function handleDebug(res: http.ServerResponse) {
  const out: Record<string, unknown> = {
    gatewayUrl: OPENCLAW_URL,
    wsUrl: OPENCLAW_URL.replace(/^http(s?):\/\//, "ws$1://"),
    hasToken: !!OPENCLAW_TOKEN,
  };

  // 1. HTTP — sessions list
  try {
    const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
    out.http_sessions = { ok: true, count: sessions.length, first: sessions[0] ?? null };
  } catch (e) {
    out.http_sessions = { ok: false, error: String(e) };
  }

  // 2. HTTP — agents list
  try {
    const agents = await listAgents(OPENCLAW_URL, OPENCLAW_TOKEN);
    out.http_agents = { ok: true, count: agents.length, agents };
  } catch (e) {
    out.http_agents = { ok: false, error: String(e) };
  }

  // 3. Filesystem — read transcript of first session
  try {
    const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
    const first = sessions[0];
    if (!first) {
      out.fs_session = { ok: false, error: "No sessions found" };
    } else if (!first.transcriptPath) {
      out.fs_session = { ok: false, error: "Session has no transcriptPath" };
    } else {
      const messages = readTranscript(first.transcriptPath);
      out.fs_session = { ok: true, key: first.key, transcriptPath: first.transcriptPath, messageCount: messages.length, firstRole: messages[0]?.role ?? null };
    }
  } catch (e) {
    out.fs_session = { ok: false, error: String(e) };
  }

  // 4. Filesystem — list agent files
  try {
    const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
    const first = sessions[0];
    if (first?.transcriptPath) {
      const agentDir = agentDirFromTranscript(first.transcriptPath);
      const files = listAgentFiles(agentDir);
      out.fs_files = { ok: true, agentDir, files };
    } else {
      out.fs_files = { ok: false, error: "No transcriptPath" };
    }
  } catch (e) {
    out.fs_files = { ok: false, error: String(e) };
  }

  json(res, 200, out);
}

async function handleCosts(res: http.ServerResponse) {
  const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
  const byAgent      = new Map<string, number>();  // agentId → totalTokens
  const byAgentDate  = new Map<string, number>();  // "agentId|YYYY-MM-DD" → tokens
  const byModel      = new Map<string, number>();  // modelName → totalTokens
  const agentModel   = new Map<string, string>();  // agentId → most recent model

  for (const s of sessions) {
    const parts = s.key?.split(":");
    const agentId = parts?.[0] === "agent" ? parts[1] : null;
    if (!agentId) continue;
    const tokens = s.totalTokens ?? 0;

    byAgent.set(agentId, (byAgent.get(agentId) ?? 0) + tokens);

    // updatedAt from OpenClaw is in seconds; normalise to ms
    const raw = s.updatedAt ?? 0;
    const ts = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
    const date = ts > 0 ? new Date(ts).toISOString().split("T")[0] : "unknown";
    const key = `${agentId}|${date}`;
    byAgentDate.set(key, (byAgentDate.get(key) ?? 0) + tokens);

    // Track per-model usage — most recent session wins for agent model
    if (tokens > 0 && s.model) {
      const model = s.model.trim();
      byModel.set(model, (byModel.get(model) ?? 0) + tokens);
      // Sessions from listSessions are already sorted newest-first from OpenClaw;
      // only set if not yet assigned so first-seen (newest) wins.
      if (!agentModel.has(agentId)) agentModel.set(agentId, model);
    }
  }

  // Per-agent costs — use model-accurate pricing where available
  const costs = Array.from(byAgent.entries()).map(([agentId, totalTokens]) => ({
    agentId,
    model: agentModel.get(agentId),
    totalTokens,
    estimatedCost: estimateCost(totalTokens, agentModel.get(agentId) ?? ""),
  }));
  costs.sort((a, b) => b.totalTokens - a.totalTokens);

  // Daily costs — approximate with flat rate (no per-day model tracking yet)
  const daily = Array.from(byAgentDate.entries()).map(([key, tokens]) => {
    const sep = key.indexOf("|");
    const agentId = key.slice(0, sep);
    return {
      agentId,
      date: key.slice(sep + 1),
      tokens,
      estimatedCost: estimateCost(tokens, agentModel.get(agentId) ?? ""),
    };
  });
  daily.sort((a, b) => a.date.localeCompare(b.date) || a.agentId.localeCompare(b.agentId));

  // Per-model costs — accurate pricing
  const models = Array.from(byModel.entries()).map(([model, totalTokens]) => ({
    model,
    totalTokens,
    estimatedCost: estimateCost(totalTokens, model),
  }));
  models.sort((a, b) => b.totalTokens - a.totalTokens);

  json(res, 200, { costs, daily, models });
}

async function handleAllSessions(res: http.ServerResponse) {
  const raw = await getAllSessions();
  const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const now = Date.now();

  const sessions = raw.map((s) => {
    const parts = s.key?.split(":") ?? [];
    const agentId   = parts[0] === "agent" ? parts[1] : null;
    const sessionType = parts[2] ?? "main";
    const context   = parts.slice(3).join(":") || null;

    const raw_ts = s.updatedAt ?? 0;
    const updatedAtMs = raw_ts > 0 && raw_ts < 1e12 ? raw_ts * 1000 : raw_ts;
    const isActive = updatedAtMs > 0 && (now - updatedAtMs) < ACTIVE_WINDOW_MS;

    return {
      key:       s.key,
      agentId,
      type:      sessionType,
      context,
      updatedAt: updatedAtMs,
      totalTokens: s.totalTokens ?? 0,
      isActive,
    };
  }).filter(s => s.agentId);

  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  json(res, 200, { sessions });
}

async function handleDebugSession(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId") ?? "";
  const sessions = await getAllSessions();

  const agentSessions = sessions.filter((s) => {
    const p = s.key?.split(":");
    return p?.[0] === "agent" && p[1] === agentId;
  });

  // Annotate each session with its file size so we can pick the right one
  const annotated = agentSessions.map((s) => {
    let fileSize = 0;
    let lineCount = 0;
    if (s.transcriptPath && fs.existsSync(s.transcriptPath)) {
      const content = fs.readFileSync(s.transcriptPath, "utf8");
      fileSize = Buffer.byteLength(content);
      lineCount = content.split("\n").filter(Boolean).length;
    }
    return { key: s.key, updatedAt: s.updatedAt, transcriptPath: s.transcriptPath, fileSize, lineCount };
  });

  // Pick the session with the most content
  const best = [...annotated].sort((a, b) => b.lineCount - a.lineCount)[0];

  if (!best?.transcriptPath || best.lineCount === 0) {
    json(res, 200, { agentId, sessions: annotated, error: "All transcripts are empty or missing" });
    return;
  }

  // Read first 3 raw lines from the best transcript to inspect format
  const rawLines = fs.readFileSync(best.transcriptPath, "utf8").split("\n").filter(Boolean).slice(0, 3);

  // Try parsing
  const messages = readTranscript(best.transcriptPath);
  const { parseMessages } = await import("./parse-session");
  const events = parseMessages(messages as Parameters<typeof parseMessages>[0]);

  json(res, 200, {
    agentId,
    sessions: annotated,
    bestSession: best,
    rawSample: rawLines.map((l) => { try { return JSON.parse(l); } catch { return l; } }),
    parsedMessageCount: messages.length,
    eventCount: events.length,
    firstMessages: messages.slice(0, 3),
  });
}

// ---------------------------------------------------------------------------
// Telemetry event log (Option C: append-only rolling .jsonl file)
//
// A background poller fires every 60 s. For each session whose updatedAt
// changed it:
//   • counts new assistant turns from the transcript .jsonl (= requests)
//   • records delta totalTokens from OpenClaw              (= token cost)
//   • estimates USD cost via the pricing table
//
// Events are appended to agent-telemetry.jsonl and pruned to 31 days on
// startup. The /request-stats endpoint reads and buckets this log into
// rolling time windows for both requests AND costs.
// ---------------------------------------------------------------------------

const TELEMETRY_LOG_FILE    = path.join(__dirname, "..", "agent-telemetry.jsonl");
const TELEMETRY_RETENTION   = 31 * 24 * 60 * 60 * 1000; // 31 days in ms
const POLL_INTERVAL_MS      = 60_000; // 60 s

interface TelemetryEvent {
  ts: number;   // detection time (ms)
  a:  string;   // agentId
  n:  number;   // new assistant turns (requests)
  tk: number;   // delta tokens consumed
  c:  number;   // estimated USD cost for these tokens
}

// In-memory snapshot of each session's last-seen state
const pollState = new Map<string, { updatedAt: number; lineCount: number; totalTokens: number }>();

function countAssistantLines(transcriptPath: string): number {
  if (!fs.existsSync(transcriptPath)) return 0;
  try {
    let count = 0;
    for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t);
        if ((obj.message ?? obj).role === "assistant") count++;
      } catch { /* skip malformed */ }
    }
    return count;
  } catch { return 0; }
}

function readTelemetryLog(): TelemetryEvent[] {
  // Support both old request-events.jsonl and new agent-telemetry.jsonl
  const cutoff = Date.now() - TELEMETRY_RETENTION;
  const events: TelemetryEvent[] = [];
  const files = [TELEMETRY_LOG_FILE, path.join(__dirname, "..", "request-events.jsonl")];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          const ev = JSON.parse(t) as TelemetryEvent;
          // Backfill missing fields from old format (n only, no tk/c)
          if (ev.ts >= cutoff && ev.a && ev.n > 0) {
            events.push({ ...ev, tk: ev.tk ?? 0, c: ev.c ?? 0 });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return events;
}

function pruneTelemetryLog() {
  const kept = readTelemetryLog().filter(e => e.ts >= Date.now() - TELEMETRY_RETENTION);
  try {
    fs.writeFileSync(
      TELEMETRY_LOG_FILE,
      kept.map(e => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : ""),
      { flag: "w" }
    );
  } catch { /* best-effort */ }
}

function appendTelemetryEvents(events: TelemetryEvent[]) {
  if (!events.length) return;
  try {
    fs.appendFileSync(TELEMETRY_LOG_FILE, events.map(e => JSON.stringify(e)).join("\n") + "\n");
  } catch { /* best-effort */ }
}

function startRequestPoller() {
  // Prune stale entries once on startup
  pruneTelemetryLog();

  const poll = async () => {
    try {
      const sessions = await getAllSessions();
      const newEvents: TelemetryEvent[] = [];

      for (const s of sessions) {
        const parts   = s.key?.split(":");
        const agentId = parts?.[0] === "agent" ? parts[1] : null;
        if (!agentId || !s.transcriptPath) continue;

        const raw = s.updatedAt ?? 0;
        const updatedAtMs = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
        if (!updatedAtMs) continue;

        const known = pollState.get(s.key);

        // Nothing changed since last poll — skip expensive file read
        if (known && updatedAtMs <= known.updatedAt) continue;

        // Count new assistant turns (requests)
        const currentLines  = countAssistantLines(s.transcriptPath);
        const prevLines     = known?.lineCount ?? 0;
        const newTurns      = Math.max(0, currentLines - prevLines);

        // Delta tokens and estimated cost
        const currentTokens = s.totalTokens ?? 0;
        const prevTokens    = known?.totalTokens ?? 0;
        const deltaTokens   = Math.max(0, currentTokens - prevTokens);
        const deltaCost     = parseFloat(estimateCost(deltaTokens, s.model ?? "").toFixed(8));

        pollState.set(s.key, { updatedAt: updatedAtMs, lineCount: currentLines, totalTokens: currentTokens });

        if (newTurns > 0 || deltaTokens > 0) {
          newEvents.push({ ts: Date.now(), a: agentId, n: newTurns, tk: deltaTokens, c: deltaCost });
        }
      }

      appendTelemetryEvents(newEvents);
    } catch (e) {
      console.error("[router] telemetry poller error:", e instanceof Error ? e.message : e);
    }
  };

  // Run immediately then on interval
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

function handleRequestStats(res: http.ServerResponse) {
  const now = Date.now();
  const WINDOWS = [
    { key: "h1", ms: 1  * 60 * 60 * 1000 },
    { key: "h5", ms: 5  * 60 * 60 * 1000 },
    { key: "d1", ms: 24 * 60 * 60 * 1000 },
    { key: "d5", ms: 5  * 24 * 60 * 60 * 1000 },
    { key: "w1", ms: 7  * 24 * 60 * 60 * 1000 },
    { key: "m1", ms: 30 * 24 * 60 * 60 * 1000 },
  ];

  const events = readTelemetryLog();

  type WindowStats = { requests: number; tokens: number; cost: number };
  const windows: Record<string, WindowStats> = {
    h1: { requests: 0, tokens: 0, cost: 0 },
    h5: { requests: 0, tokens: 0, cost: 0 },
    d1: { requests: 0, tokens: 0, cost: 0 },
    d5: { requests: 0, tokens: 0, cost: 0 },
    w1: { requests: 0, tokens: 0, cost: 0 },
    m1: { requests: 0, tokens: 0, cost: 0 },
  };

  // byAgent: windowKey → agentId → { requests, tokens, cost }
  const byAgent: Record<string, Record<string, WindowStats>> = {};

  // Daily series map: date → { requests, tokens, cost }
  const dailyMap = new Map<string, WindowStats>();

  for (const ev of events) {
    const age = now - ev.ts;
    for (const w of WINDOWS) {
      if (age <= w.ms) {
        windows[w.key].requests += ev.n;
        windows[w.key].tokens   += ev.tk;
        windows[w.key].cost     += ev.c;
        if (!byAgent[w.key]) byAgent[w.key] = {};
        const ag = byAgent[w.key][ev.a] ?? { requests: 0, tokens: 0, cost: 0 };
        ag.requests += ev.n;
        ag.tokens   += ev.tk;
        ag.cost     += ev.c;
        byAgent[w.key][ev.a] = ag;
      }
    }
    const date = new Date(ev.ts).toISOString().split("T")[0];
    const day  = dailyMap.get(date) ?? { requests: 0, tokens: 0, cost: 0 };
    day.requests += ev.n;
    day.tokens   += ev.tk;
    day.cost     += ev.c;
    dailyMap.set(date, day);
  }

  // Round cost values
  for (const w of Object.values(windows)) w.cost = parseFloat(w.cost.toFixed(6));
  for (const agents of Object.values(byAgent)) {
    for (const w of Object.values(agents)) w.cost = parseFloat(w.cost.toFixed(6));
  }

  const dailySeries = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({ date, requests: s.requests, tokens: s.tokens, cost: parseFloat(s.cost.toFixed(6)) }));

  const totals = events.reduce((acc, e) => {
    acc.requests += e.n; acc.tokens += e.tk; acc.cost += e.c; return acc;
  }, { requests: 0, tokens: 0, cost: 0 });
  totals.cost = parseFloat(totals.cost.toFixed(6));

  json(res, 200, { windows, byAgent, dailySeries, totals });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }

  const { path: urlPath, params } = parseUrl(req);

  // Health check — no auth required
  if (urlPath === "/health") {
    json(res, 200, {
      ok: true,
      version: "1.0.0",
      time: new Date().toISOString(),
      gateway: OPENCLAW_URL,
    });
    return;
  }

  if (!authenticate(req)) { json(res, 401, { error: "Unauthorized" }); return; }

  try {
    if (urlPath === "/agents") { await handleAgents(res); return; }
    if (urlPath === "/sessions") { await handleSessions(res, params); return; }
    if (urlPath === "/session") { await handleSession(res, params); return; }
    if (urlPath === "/file") { await handleFile(res, params); return; }
    if (urlPath === "/costs") { await handleCosts(res); return; }
    if (urlPath === "/all-sessions") { await handleAllSessions(res); return; }
    if (urlPath === "/crons-native") { await handleCronsNative(res); return; }
    if (urlPath === "/info") { await handleInfo(res); return; }
    if (urlPath === "/debug") { await handleDebug(res); return; }
    if (urlPath === "/debug-session") { await handleDebugSession(res, params); return; }
    if (urlPath === "/request-stats") { handleRequestStats(res); return; }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[router] ${req.url} →`, message);
    json(res, 502, { error: message });
  }
});

// Start the background request poller after the event loop is ready
startRequestPoller();

server.listen(ROUTER_PORT, () => {
  const b = '\x1b[1m', r = '\x1b[0m', dim = '\x1b[2m', cyan = '\x1b[36m', green = '\x1b[32m', orange = '\x1b[38;5;208m';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require("../package.json") as { version: string };
  const url = `http://localhost:${ROUTER_PORT}`;
  console.log("");
  console.log(`  ${orange}${b}🛰  Mission Control Router${r}  ${dim}v${pkg.version}${r}`);
  console.log("");
  console.log(`  ${dim}Listening ${r} ${cyan}${url}${r}`);
  console.log(`  ${dim}OpenClaw  ${r} ${dim}${OPENCLAW_URL}${r}`);
  console.log("");
  console.log(`  ${dim}────────────────────────────────────────${r}`);
  console.log(`  ${b}In Mission Control, add this router:${r}`);
  console.log(`  ${dim}────────────────────────────────────────${r}`);
  console.log("");
  console.log(`  ${dim}Router URL  ${r} ${green}${url}${r}`);
  console.log(`  ${dim}Token       ${r} ${green}${ROUTER_TOKEN}${r}`);
  console.log("");

  if (!OPENCLAW_TOKEN) {
    console.warn("[router] WARNING: OPENCLAW_TOKEN is not set. Requests will fail.");
    console.warn("[router] Set it in router/.env or as an environment variable.");
  }
});
