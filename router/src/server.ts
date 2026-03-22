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
import { randomBytes } from "crypto";
import {
  listSessions,
  listAgents,
  GatewaySession,
  GatewayMessage,
} from "./openclaw";
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
  const [sessions, gatewayAgents] = await Promise.all([
    listSessions(OPENCLAW_URL, OPENCLAW_TOKEN),
    listAgents(OPENCLAW_URL, OPENCLAW_TOKEN).catch(() => [] as Awaited<ReturnType<typeof listAgents>>),
  ]);

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
  const agentMap = new Map<string, { id: string; name: string; configured: boolean; files: string[] }>();
  for (const a of gatewayAgents) {
    const sess = latestSession.get(a.id);
    const files = sess?.transcriptPath ? listAgentFiles(agentDirFromTranscript(sess.transcriptPath)) : [];
    agentMap.set(a.id, { ...a, files });
  }
  for (const [id, sess] of latestSession) {
    if (!agentMap.has(id)) {
      const files = sess.transcriptPath ? listAgentFiles(agentDirFromTranscript(sess.transcriptPath)) : [];
      agentMap.set(id, { id, name: id, configured: false, files });
    }
  }

  json(res, 200, { agents: Array.from(agentMap.values()) });
}

async function handleSessions(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId");
  const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
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

  const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);

  // Find target session
  let targetSession: GatewaySession | undefined;
  if (key) {
    targetSession = sessions.find((s) => s.key === key);
  } else if (agentId) {
    targetSession = sessions
      .filter((s) => { const p = s.key?.split(":"); return p?.[0] === "agent" && p[1] === agentId; })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  }

  if (!targetSession) {
    json(res, 404, { error: "No session found" });
    return;
  }

  // Read transcript directly from disk (router is co-located with OpenClaw)
  let messages: GatewayMessage[] = [];
  if (targetSession.transcriptPath) {
    messages = readTranscript(targetSession.transcriptPath);
    console.log(`[router] read ${messages.length} messages from ${targetSession.transcriptPath}`);
  } else {
    json(res, 502, { error: "No transcriptPath available" });
    return;
  }

  const events = parseMessages(messages as Parameters<typeof parseMessages>[0]);
  json(res, 200, { key: targetSession.key, events });
}

async function handleFile(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId");
  const name = params.get("name");
  if (!agentId || !name) { json(res, 400, { error: "Missing agentId or name" }); return; }

  // Find agent dir from latest session transcriptPath
  const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
  const latestSess = sessions
    .filter((s) => { const p = s.key?.split(":"); return p?.[0] === "agent" && p[1] === agentId; })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

  if (!latestSess?.transcriptPath) {
    console.warn(`[router] /file: no transcriptPath for agent=${agentId}`);
    json(res, 404, { error: `No transcript found for agent "${agentId}"` });
    return;
  }

  const agentDir = agentDirFromTranscript(latestSess.transcriptPath);
  const filesOnDisk = listAgentFiles(agentDir);
  console.log(`[router] /file agent=${agentId} dir=${agentDir} filesOnDisk=${filesOnDisk.join(",") || "none"} requested=${name}`);

  const content = readAgentFile(agentDir, name);
  if (content === null) {
    json(res, 404, { error: `"${name}" not found in ${agentDir} (found: ${filesOnDisk.join(", ") || "no .md files"})` });
    return;
  }
  json(res, 200, { content });
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
  const byAgent = new Map<string, { totalTokens: number }>();
  for (const s of sessions) {
    const parts = s.key?.split(":");
    const agentId = parts?.[0] === "agent" ? parts[1] : null;
    if (!agentId) continue;
    const existing = byAgent.get(agentId) ?? { totalTokens: 0 };
    existing.totalTokens += s.totalTokens ?? 0;
    byAgent.set(agentId, existing);
  }
  const costs = Array.from(byAgent.entries()).map(([agentId, { totalTokens }]) => ({
    agentId,
    totalTokens,
    estimatedCost: parseFloat((totalTokens * 3 / 1_000_000).toFixed(4)),
  }));
  costs.sort((a, b) => b.totalTokens - a.totalTokens);
  json(res, 200, { costs });
}

async function handleDebugSession(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId") ?? "";
  const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);

  // Show all session keys so we can see the key format
  const allKeys = sessions.map((s) => ({ key: s.key, updatedAt: s.updatedAt, hasPath: !!s.transcriptPath }));

  const agentSessions = sessions.filter((s) => {
    const p = s.key?.split(":");
    return p?.[0] === "agent" && p[1] === agentId;
  }).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const latest = agentSessions[0];
  if (!latest?.transcriptPath) {
    json(res, 200, { agentId, allKeys, agentSessions, error: "No transcriptPath found" });
    return;
  }

  // Read first 5 raw lines from the transcript to inspect format
  const rawLines: string[] = [];
  if (fs.existsSync(latest.transcriptPath)) {
    const lines = fs.readFileSync(latest.transcriptPath, "utf8").split("\n").filter(Boolean);
    rawLines.push(...lines.slice(0, 5));
  }

  // Try parsing
  const messages = readTranscript(latest.transcriptPath);
  const { parseMessages } = await import("./parse-session");
  const events = parseMessages(messages as Parameters<typeof parseMessages>[0]);

  json(res, 200, {
    agentId,
    transcriptPath: latest.transcriptPath,
    rawLineCount: rawLines.length,
    rawSample: rawLines.map((l) => { try { return JSON.parse(l); } catch { return l; } }),
    parsedMessageCount: messages.length,
    eventCount: events.length,
    firstMessages: messages.slice(0, 3),
  });
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
    if (urlPath === "/debug") { await handleDebug(res); return; }
    if (urlPath === "/debug-session") { await handleDebugSession(res, params); return; }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[router] ${req.url} →`, message);
    json(res, 502, { error: message });
  }
});

server.listen(ROUTER_PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         Mission Control Router — started             ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Listening on  http://localhost:${ROUTER_PORT}                ║`);
  console.log(`║  OpenClaw URL  ${OPENCLAW_URL.padEnd(38)}║`);
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║  In Mission Control, set:                            ║");
  console.log(`║  Router URL    http://localhost:${ROUTER_PORT}                ║`);
  console.log(`║  Router Token  ${ROUTER_TOKEN.slice(0, 38)}║`);
  if (ROUTER_TOKEN.length > 38) {
    console.log(`║                ${ROUTER_TOKEN.slice(38).padEnd(38)}║`);
  }
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");

  if (!OPENCLAW_TOKEN) {
    console.warn("[router] WARNING: OPENCLAW_TOKEN is not set. Requests will fail.");
    console.warn("[router] Set it in router/.env or as an environment variable.");
  }
});
