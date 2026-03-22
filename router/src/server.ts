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
import WebSocket from "ws";
import {
  listSessions,
  listAgents,
  getSession,
  getAgentFile,
  GatewaySession,
} from "./openclaw";
import { parseMessages } from "./parse-session";

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

  // Derive unique agent IDs from session keys (agent:<id>:<channel>)
  const seenIds = new Set<string>();
  const agentIdsFromSessions: string[] = [];
  for (const s of sessions) {
    const parts = s.key?.split(":");
    if (parts?.[0] === "agent" && parts[1]) {
      if (!seenIds.has(parts[1])) { seenIds.add(parts[1]); agentIdsFromSessions.push(parts[1]); }
    }
  }

  // Merge gateway agents (may have configured names) with session-derived ids
  const agentMap = new Map<string, { id: string; name: string; configured: boolean }>();
  for (const a of gatewayAgents) agentMap.set(a.id, a);
  for (const id of agentIdsFromSessions) {
    if (!agentMap.has(id)) agentMap.set(id, { id, name: id, configured: false });
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

  let sessionKey = key;

  // If only agentId given, look up the most recent session key
  if (!sessionKey && agentId) {
    const sessions = await listSessions(OPENCLAW_URL, OPENCLAW_TOKEN);
    const match = sessions
      .filter((s) => {
        const parts = s.key?.split(":");
        return parts?.[0] === "agent" && parts[1] === agentId;
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    sessionKey = match?.key ?? null;
  }

  if (!sessionKey) {
    json(res, 404, { error: "No session found" });
    return;
  }

  const messages = await getSession(OPENCLAW_URL, OPENCLAW_TOKEN, sessionKey);
  const events = parseMessages(messages as Parameters<typeof parseMessages>[0]);
  json(res, 200, { key: sessionKey, events });
}

async function handleFile(res: http.ServerResponse, params: URLSearchParams) {
  const agentId = params.get("agentId");
  const name = params.get("name");
  if (!agentId || !name) { json(res, 400, { error: "Missing agentId or name" }); return; }
  const content = await getAgentFile(OPENCLAW_URL, OPENCLAW_TOKEN, agentId, name);
  if (content === null) { json(res, 404, { error: "File not found" }); return; }
  json(res, 200, { content });
}

async function handleDebug(res: http.ServerResponse) {
  // Probe WebSocket: open connection, collect first 10 messages over 5s, report them
  const wsUrl = OPENCLAW_URL.replace(/^http(s?):\/\//, "ws$1://").replace(/\/$/, "");
  const messages: { t: number; type?: string; raw: string }[] = [];
  const start = Date.now();

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, 5000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, { headers: { Origin: OPENCLAW_URL } });
    } catch (e) {
      messages.push({ t: 0, raw: `[open error] ${e}` });
      clearTimeout(timer);
      finish();
      return;
    }

    ws.on("open", () => messages.push({ t: Date.now() - start, raw: "[open]" }));
    ws.on("error", (e) => { messages.push({ t: Date.now() - start, raw: `[error] ${e.message}` }); clearTimeout(timer); try { ws.close(); } catch {} finish(); });
    ws.on("close", (code, reason) => { messages.push({ t: Date.now() - start, raw: `[close] code=${code} reason=${reason}` }); clearTimeout(timer); finish(); });
    ws.on("message", (raw) => {
      const str = raw.toString();
      let parsed: { type?: string } = {};
      try { parsed = JSON.parse(str); } catch {}
      messages.push({ t: Date.now() - start, type: parsed.type, raw: str.slice(0, 500) });
      if (messages.filter((m) => m.type).length >= 5) { clearTimeout(timer); try { ws.close(); } catch {} finish(); }
    });
  });

  json(res, 200, {
    wsUrl,
    gatewayUrl: OPENCLAW_URL,
    hasToken: !!OPENCLAW_TOKEN,
    messages,
  });
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
