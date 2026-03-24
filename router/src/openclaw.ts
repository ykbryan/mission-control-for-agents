/**
 * OpenClaw gateway connection helpers.
 * Handles both HTTP (sessions_list, agents_list) and WebSocket RPC
 * (sessions.get, agents.files.get) — WebSocket is localhost-only in OpenClaw.
 */

import WebSocket from "ws";
import { randomUUID } from "crypto";
import { subtle } from "crypto";
import type { webcrypto } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Ed25519 device identity (cached for process lifetime)
// ---------------------------------------------------------------------------

interface DeviceIdentity {
  deviceId: string;
  publicKeyB64: string;
  privateKey: webcrypto.CryptoKey;
}

let cachedDevice: DeviceIdentity | null = null;

async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cachedDevice) return cachedDevice;
  const kp = await subtle.generateKey("Ed25519", true, ["sign", "verify"]) as webcrypto.CryptoKeyPair;
  const pubRaw = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const hashBuf = await subtle.digest("SHA-256", pubRaw);
  const deviceId = Buffer.from(hashBuf).toString("hex");
  const publicKeyB64 = Buffer.from(pubRaw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  cachedDevice = { deviceId, publicKeyB64, privateKey: kp.privateKey };
  return cachedDevice;
}

// ---------------------------------------------------------------------------
// WebSocket RPC (for sessions.get, agents.files.get)
// ---------------------------------------------------------------------------

export async function gatewayRpc<T = unknown>(
  gatewayUrl: string,
  gatewayToken: string,
  method: string,
  params?: unknown,
  timeoutMs = 15_000
): Promise<T> {
  const wsUrl = gatewayUrl.replace(/^http(s?):\/\//, "ws$1://").replace(/\/$/, "");
  const origin = gatewayUrl.replace(/\/$/, "");
  const device = await getDeviceIdentity();

  return new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
    let settled = false;
    let connectSent = false;
    const instanceId = randomUUID();
    const clientId = randomUUID();

    const done = (err?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (err) reject(err);
      else resolve(value as T);
    };

    const timer = setTimeout(
      () => done(new Error(`Gateway RPC timeout (${method})`)),
      timeoutMs
    );

    const sendConnect = async (nonce?: string) => {
      if (connectSent) return;
      connectSent = true;

      const signedAtMs = Date.now();
      const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
      const role = "operator";
      const clientMode = "webchat";
      const token = gatewayToken;

      const payload = [
        "v2",
        device.deviceId,
        "openclaw-control-ui",
        clientMode,
        role,
        scopes.join(","),
        String(signedAtMs),
        token,
        nonce ?? "",
      ].join("|");

      const sigBytes = await subtle.sign(
        "Ed25519",
        device.privateKey,
        new TextEncoder().encode(payload)
      );
      const signature = Buffer.from(sigBytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const connectMsg = {
        type: "connect",
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "openclaw-control-ui",
          version: "2026.3.13",
          platform: "web",
          mode: clientMode,
          instanceId,
        },
        role,
        scopes,
        caps: [],
        auth: { token },
        userAgent: "mission-control-router/1.0",
        locale: "en-US",
        ...(nonce ? { nonce } : {}),
        device: {
          id: device.deviceId,
          publicKey: device.publicKeyB64,
          signature,
          signedAt: signedAtMs,
          ...(nonce ? { nonce } : {}),
        },
      };

      ws.send(JSON.stringify(connectMsg));
    };

    // 750 ms fallback — send connect without challenge if none arrives
    const challengeTimer = setTimeout(() => sendConnect(), 750);

    ws.on("open", () => { /* wait for challenge or fallback */ });

    ws.on("message", async (raw) => {
      // OpenClaw wraps messages as { type:"event", event:"...", payload:{...} }
      // Some messages may also use type directly — handle both.
      let msg: {
        type?: string;
        event?: string;
        payload?: Record<string, unknown>;
        id?: string;
        result?: T;
        error?: string;
      };
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Resolve the effective event name
      const ev = msg.type === "event" ? (msg.event ?? "") : (msg.type ?? "");
      console.log(`[ws:${method}] type=${msg.type} event=${msg.event ?? "-"}`);

      if (ev === "connect.challenge") {
        clearTimeout(challengeTimer);
        const nonce = msg.payload?.nonce as string | undefined;
        await sendConnect(nonce);
        return;
      }

      if (ev === "connect.ok" || ev === "connected" || ev === "connect.ready") {
        const reqId = randomUUID();
        ws.send(JSON.stringify({ type: "rpc", id: reqId, method, params: params ?? {} }));
        return;
      }

      if (ev === "rpc.result" || ev === "result" || ev === "rpc.response") {
        const payload = (msg.payload ?? msg) as { result?: T; error?: string };
        if (payload.error) { done(new Error(`Gateway RPC error (${method}): ${payload.error}`)); return; }
        done(undefined, (payload.result ?? msg.result) as T);
        return;
      }

      if (ev === "connect.error" || ev === "error") {
        const errMsg = (msg.payload?.message ?? msg.payload?.error ?? msg.error ?? JSON.stringify(msg)) as string;
        done(new Error(`Gateway connect error: ${errMsg}`));
      }
    });

    ws.on("error", (err) => { console.error(`[ws:${method}] error:`, err.message); done(err); });
    ws.on("close", (code, reason) => {
      clearTimeout(challengeTimer);
      console.log(`[ws:${method}] closed code=${code} reason=${reason}`);
      done(new Error(`WebSocket closed (code=${code})`));
    });
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers (sessions_list, agents_list via POST /tools/invoke)
// Some OpenClaw versions (2026.x+) removed /tools/invoke; those use WebSocket
// RPC exclusively. invoke() tries HTTP first, falls back to WebSocket RPC.
// ---------------------------------------------------------------------------

async function httpInvoke<T>(
  gatewayUrl: string,
  gatewayToken: string,
  tool: string,
  args: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${gatewayUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from gateway`);
  const data = await res.json() as { ok: boolean; result?: { content?: Array<{ text?: string }> } };
  if (!data.ok) throw new Error(`Tool error: ${tool}`);
  const text = data.result?.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

/**
 * Unified invoke: tries HTTP /tools/invoke first (older OpenClaw).
 * On 404 falls back to WebSocket RPC using dot-notation method names
 * (e.g. "sessions_list" → "sessions.list") for OpenClaw 2026.x+.
 */
async function invoke<T>(
  gatewayUrl: string,
  gatewayToken: string,
  tool: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await httpInvoke<T>(gatewayUrl, gatewayToken, tool, args);
  } catch (err) {
    if (err instanceof Error && err.message.includes("HTTP 404")) {
      // /tools/invoke not available — fall back to WebSocket RPC.
      // Convert snake_case tool name to dot-notation RPC method.
      const rpcMethod = tool.replace(/_/g, ".");
      return gatewayRpc<T>(gatewayUrl, gatewayToken, rpcMethod, args);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API used by the router server
// ---------------------------------------------------------------------------

export interface GatewaySession {
  key: string;
  displayName?: string;
  label?: string;
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
  transcriptPath?: string;
}

export interface GatewayAgent {
  id: string;
  name: string;
  configured: boolean;
  // OpenClaw may return node/host info per agent
  host?: string;
  node?: string;
  hostname?: string;
  nodeId?: string;
  [key: string]: unknown;
}

export interface GatewayNode {
  id?: string;
  hostname?: string;
  host?: string;
  name?: string;
  status?: string;
  agents?: string[];   // agent IDs on this node
  [key: string]: unknown;
}

/**
 * Try to list physical nodes/workers from OpenClaw.
 * Falls back gracefully if the gateway doesn't expose a nodes tool.
 */
export async function listNodes(
  gatewayUrl: string,
  gatewayToken: string
): Promise<GatewayNode[]> {
  const candidates = ["nodes_list", "node_list", "workers_list", "machines_list", "hosts_list"];
  for (const tool of candidates) {
    try {
      const data = await invoke<{
        nodes?: GatewayNode[];
        workers?: GatewayNode[];
        machines?: GatewayNode[];
        hosts?: GatewayNode[];
      }>(gatewayUrl, gatewayToken, tool, {});
      const result = data.nodes ?? data.workers ?? data.machines ?? data.hosts ?? [];
      if (result.length > 0) return result;
    } catch { /* tool not supported — try next */ }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Filesystem fallbacks — used when the gateway API is unreachable.
//
// Primary agent dirs: ~/.openclaw/agents/{agentId}/
// Extra dirs at root (e.g. workspace-spin) may contain sessions for a
// *different* agent ID — we read session keys to find the real agent ID, and
// only promote the dir to a new agent entry if that ID isn't already covered
// by ~/.openclaw/agents/.  A workspace dir whose sessions belong to an agent
// that already exists in agents/ (e.g. workspace/ → main) is silently ignored
// for agent-listing purposes but still contributes its sessions.
// ---------------------------------------------------------------------------

const OPENCLAW_ROOT = path.join(os.homedir(), ".openclaw");
const AGENT_MD_FILES = ["IDENTITY.md", "SOUL.md", "TOOLS.md", "HEARTBEAT.md", "AGENTS.md"];

/** Read the first session key from sessions.json and return the agentId embedded in it.
 *  Session keys use the format "agent:{agentId}:...". Returns null if unreadable. */
function agentIdFromSessionsJson(indexPath: string): string | null {
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, unknown>;
    const firstKey = Object.keys(index)[0];
    if (firstKey) {
      const parts = firstKey.split(":");
      if (parts[0] === "agent" && parts[1]) return parts[1];
    }
  } catch { /* fall through */ }
  return null;
}

function listSessionsFromDisk(): GatewaySession[] {
  const sessions: GatewaySession[] = [];
  if (!fs.existsSync(OPENCLAW_ROOT)) return sessions;

  // Build a map of dir → agentId for normalization.
  // agents/{id}/ → id; workspace-{id}/ → id
  const dirsToScan: Array<{ dir: string; agentId: string | null }> = [];

  const agentsDir = path.join(OPENCLAW_ROOT, "agents");
  if (fs.existsSync(agentsDir)) {
    try {
      for (const entry of fs.readdirSync(agentsDir)) {
        const d = path.join(agentsDir, entry);
        try { if (fs.statSync(d).isDirectory()) dirsToScan.push({ dir: d, agentId: entry }); } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  try {
    for (const entry of fs.readdirSync(OPENCLAW_ROOT)) {
      const d = path.join(OPENCLAW_ROOT, entry);
      try {
        if (!fs.statSync(d).isDirectory()) continue;
        if (!fs.existsSync(path.join(d, "sessions", "sessions.json"))) continue;
        if (dirsToScan.some(x => x.dir === d)) continue; // already added
        // Derive agentId from workspace-{name} pattern; null for other dirs
        const agentId = entry.startsWith("workspace-") ? entry.slice("workspace-".length) : null;
        dirsToScan.push({ dir: d, agentId });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  for (const { dir, agentId } of dirsToScan) {
    const sessionsDir = path.join(dir, "sessions");
    const indexPath = path.join(sessionsDir, "sessions.json");
    const knownSessionFiles = new Set<string>();

    if (fs.existsSync(indexPath)) {
      try {
        type Entry = { sessionFile?: string; updatedAt?: number; totalTokens?: number };
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, Entry>;
        for (const [key, meta] of Object.entries(index)) {
          if (!meta.sessionFile) continue;
          knownSessionFiles.add(meta.sessionFile);
          let updatedAt = meta.updatedAt;
          if (!updatedAt) {
            try { updatedAt = fs.statSync(meta.sessionFile).mtimeMs; } catch { /* skip */ }
          }
          // Ensure the key starts with "agent:{agentId}:" so handleAgents can
          // resolve the transcriptPath → files mapping correctly.
          const normKey = key.startsWith("agent:") ? key
            : agentId ? `agent:${agentId}:${key}`
            : key;
          sessions.push({ key: normKey, transcriptPath: meta.sessionFile, totalTokens: meta.totalTokens ?? 0, updatedAt });
        }
      } catch { /* skip */ }
    }

    // Also surface soft-deleted / compacted transcripts ({uuid}.jsonl.deleted.{ts}).
    // OpenClaw renames the active transcript during compaction; these files still
    // hold the full conversation history and should be shown so the sessions list
    // is never empty due to compaction.
    if (!fs.existsSync(sessionsDir)) continue;
    try {
      for (const file of fs.readdirSync(sessionsDir)) {
        const m = file.match(/^([0-9a-f-]{36})\.jsonl\.deleted\./);
        if (!m) continue;
        const filePath = path.join(sessionsDir, file);
        if (knownSessionFiles.has(filePath)) continue;
        let updatedAt: number;
        try { updatedAt = fs.statSync(filePath).mtimeMs; } catch { continue; }
        const uuid = m[1];
        const key = agentId ? `agent:${agentId}:session:${uuid}` : `session:${uuid}`;
        sessions.push({ key, transcriptPath: filePath, totalTokens: 0, updatedAt });
      }
    } catch { /* skip */ }
  }
  return sessions;
}

function listAgentsFromDisk(): GatewayAgent[] {
  if (!fs.existsSync(OPENCLAW_ROOT)) return [];

  // Step 1: collect agents from ~/.openclaw/agents/{id}/ (legacy layout).
  // These dirs may be empty stubs — the actual markdown files live in
  // workspace-{id}/ in newer OpenClaw installs.
  const agentMap = new Map<string, GatewayAgent>();
  const agentsDir = path.join(OPENCLAW_ROOT, "agents");
  if (fs.existsSync(agentsDir)) {
    try {
      for (const entry of fs.readdirSync(agentsDir)) {
        const dir = path.join(agentsDir, entry);
        try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
        agentMap.set(entry, {
          id: entry,
          name: entry,
          configured: AGENT_MD_FILES.some(f => fs.existsSync(path.join(dir, f))),
        });
      }
    } catch { /* skip */ }
  }

  // Step 2: scan root-level workspace-{name}/ dirs (new layout).
  // - If the agent is already known from step 1, enrich it with workspaceDir
  //   so handleAgents can find the markdown files even if agents/{id}/ is empty.
  // - If the agent is new, register it as a fresh entry.
  // Plain "workspace" (no suffix after stripping) is skipped.
  try {
    for (const entry of fs.readdirSync(OPENCLAW_ROOT)) {
      if (!entry.startsWith("workspace-")) continue;
      const agentId = entry.slice("workspace-".length);
      if (!agentId) continue;

      const dir = path.join(OPENCLAW_ROOT, entry);
      try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }

      const hasMdFiles = AGENT_MD_FILES.some(f => fs.existsSync(path.join(dir, f)));
      const hasSessions = fs.existsSync(path.join(dir, "sessions", "sessions.json"));
      if (!hasMdFiles && !hasSessions) continue;

      const existing = agentMap.get(agentId);
      if (existing) {
        // Enrich known agent with workspaceDir (files are here, not in agents/)
        agentMap.set(agentId, { ...existing, workspaceDir: dir, configured: hasMdFiles || existing.configured });
      } else {
        agentMap.set(agentId, { id: agentId, name: agentId, configured: hasMdFiles, workspaceDir: dir });
      }
    }
  } catch { /* skip */ }

  return Array.from(agentMap.values());
}

export async function listSessions(
  gatewayUrl: string,
  gatewayToken: string
): Promise<GatewaySession[]> {
  let apiSessions: GatewaySession[] = [];
  try {
    const data = await invoke<{ sessions: GatewaySession[] }>(
      gatewayUrl, gatewayToken, "sessions_list", { limit: 500 }
    );
    apiSessions = data.sessions ?? [];
  } catch {
    console.log("[openclaw] sessions API unavailable, falling back to disk scan");
  }

  // Always supplement with sessions from workspace-{name}/ dirs on disk.
  // The API may not know about workspace-based agents.
  const diskSessions = listSessionsFromDisk();
  const apiKeys = new Set(apiSessions.map(s => s.key));
  const extra = diskSessions.filter(s => !apiKeys.has(s.key));

  return apiSessions.length > 0 ? [...apiSessions, ...extra] : diskSessions;
}

export async function listAgents(
  gatewayUrl: string,
  gatewayToken: string
): Promise<GatewayAgent[]> {
  let apiAgents: GatewayAgent[] = [];
  try {
    const data = await invoke<{ agents: GatewayAgent[] }>(
      gatewayUrl, gatewayToken, "agents_list", {}
    );
    apiAgents = data.agents ?? [];
  } catch {
    console.log("[openclaw] agents API unavailable, falling back to disk scan");
  }

  // Merge API agents with disk agents.
  // If both sources know about the same agent, enrich the API entry with the
  // disk workspaceDir so handleAgents can find the markdown files directly,
  // even when the API's transcript path points to agents/ (no .md files there).
  const diskAgents = listAgentsFromDisk();
  const diskMap = new Map(diskAgents.map(a => [a.id, a]));
  const apiIds = new Set(apiAgents.map(a => a.id));

  const enriched = apiAgents.map(a => {
    const disk = diskMap.get(a.id);
    return disk?.workspaceDir ? { ...a, workspaceDir: disk.workspaceDir } : a;
  });
  const extra = diskAgents.filter(a => !apiIds.has(a.id));

  return enriched.length > 0 ? [...enriched, ...extra] : diskAgents;
}

export interface GatewayMessage {
  role: "user" | "assistant" | "toolResult";
  content?: Array<{ type: string; text?: string; name?: string; arguments?: unknown }>;
  model?: string;
  usage?: { totalTokens?: number; cost?: { total?: number } };
  stopReason?: string;
  timestamp?: number;
  toolName?: string;
  isError?: boolean;
}

export async function getSession(
  gatewayUrl: string,
  gatewayToken: string,
  key: string
): Promise<GatewayMessage[]> {
  const result = await gatewayRpc<{ messages: GatewayMessage[] }>(
    gatewayUrl, gatewayToken, "sessions.get", { key }
  );
  return result.messages ?? [];
}

export interface GatewayCronJob {
  id: string;
  name?: string;
  agentId?: string;
  scheduleExpression?: string;   // cron expression or human label
  intervalMs?: number;
  nextRunAt?: number;
  lastRunAt?: number;
  enabled?: boolean;
  description?: string;
  [key: string]: unknown;        // OpenClaw may add more fields
}

/**
 * Query OpenClaw's internal cron scheduler directly.
 * Falls back gracefully — returns [] if the gateway doesn't support the tool.
 */
export async function listCrons(
  gatewayUrl: string,
  gatewayToken: string
): Promise<GatewayCronJob[]> {
  // Try several tool names OpenClaw may use for its cron list
  const candidates = ["crons_list", "cron_list", "crons.list", "scheduler_list"];
  for (const tool of candidates) {
    try {
      const data = await httpInvoke<{ crons?: GatewayCronJob[]; jobs?: GatewayCronJob[]; schedules?: GatewayCronJob[] }>(
        gatewayUrl, gatewayToken, tool, {}
      );
      const jobs = data.crons ?? data.jobs ?? data.schedules ?? [];
      if (jobs.length > 0 || tool === candidates[candidates.length - 1]) return jobs;
    } catch {
      // Tool not supported — try next candidate
    }
  }
  return [];
}

export async function getAgentFile(
  gatewayUrl: string,
  gatewayToken: string,
  agentId: string,
  name: string
): Promise<string | null> {
  try {
    const result = await gatewayRpc<{ file: { content: string; missing: boolean } }>(
      gatewayUrl, gatewayToken, "agents.files.get", { agentId, name }
    );
    if (result.file.missing) return null;
    return result.file.content;
  } catch (err) {
    console.error("[router] getAgentFile failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
