/**
 * OpenClaw gateway connection helpers.
 * Handles both HTTP (sessions_list, agents_list) and WebSocket RPC
 * (sessions.get, agents.files.get) — WebSocket is localhost-only in OpenClaw.
 */

import WebSocket from "ws";
import { randomUUID } from "crypto";
import { subtle } from "crypto";
import type { webcrypto } from "crypto";

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
}

export async function listSessions(
  gatewayUrl: string,
  gatewayToken: string
): Promise<GatewaySession[]> {
  const data = await httpInvoke<{ sessions: GatewaySession[] }>(
    gatewayUrl, gatewayToken, "sessions_list", { limit: 500 }
  );
  return data.sessions ?? [];
}

export async function listAgents(
  gatewayUrl: string,
  gatewayToken: string
): Promise<GatewayAgent[]> {
  const data = await httpInvoke<{ agents: GatewayAgent[] }>(
    gatewayUrl, gatewayToken, "agents_list", {}
  );
  return data.agents ?? [];
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
