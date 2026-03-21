/**
 * OpenClaw Gateway WebSocket RPC client.
 *
 * The gateway WebSocket only works when the Next.js server is on the SAME
 * machine as the gateway (localhost). Remote connections are accepted at
 * the TCP level but the gateway silently ignores all messages.
 *
 * Protocol (discovered from OpenClaw control UI JS bundle):
 *  1. Open WebSocket at ws://host:port (root path, NOT /__openclaw__/ws)
 *     with Authorization: Bearer <token> + Origin header matching the gateway URL
 *  2. Gateway may send { type:"event", event:"connect.challenge", payload:{nonce} }
 *     If no challenge arrives within 750ms, send connect without nonce
 *  3. Connect requires Ed25519 device identity (same as the browser control UI).
 *     Without device signing, operator.read scope is not granted and read methods fail.
 *     Payload to sign: "v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce"
 *  4. On successful connect, send the RPC method call
 *  5. Return payload from the method response
 */

import WebSocket from "ws";
import { randomUUID } from "crypto";

interface RpcMessage {
  type: "req" | "res" | "event";
  id?: string;
  method?: string;
  params?: unknown;
  ok?: boolean;
  payload?: unknown;
  error?: { type: string; message: string };
  event?: string;
}

interface DeviceIdentity {
  deviceId: string;
  publicKeyB64: string;
  privateKey: CryptoKey;
}

// Cache device identity for the lifetime of the server process
let cachedDevice: DeviceIdentity | null = null;

async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cachedDevice) return cachedDevice;

  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const hashBuf = await crypto.subtle.digest("SHA-256", pubRaw);
  const deviceId = Buffer.from(hashBuf).toString("hex");
  const publicKeyB64 = Buffer.from(pubRaw).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  cachedDevice = { deviceId, publicKeyB64, privateKey: kp.privateKey };
  return cachedDevice;
}

async function signPayload(privateKey: CryptoKey, payload: string): Promise<string> {
  const sigBuf = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(payload));
  return Buffer.from(sigBuf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function gatewayRpc<T = unknown>(
  gatewayUrl: string,
  gatewayToken: string,
  method: string,
  params?: unknown,
  timeoutMs = 10_000
): Promise<T> {
  // Root path (ws://host:port) — gateway WS endpoint is at / not /__openclaw__/ws
  const wsUrl = gatewayUrl.replace(/^http(s?):\/\//, "ws$1://").replace(/\/$/, "");
  const origin = gatewayUrl.replace(/\/$/, "");

  const device = await getDeviceIdentity();

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finish = (value?: T, err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(connectFallbackTimer);
      try { ws.terminate(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value as T);
    };

    const ws = new WebSocket(wsUrl, [], {
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        Origin: origin,
      },
    });

    const timer = setTimeout(() => {
      finish(undefined, new Error(`Gateway RPC timeout (${method}) — WebSocket is localhost-only`));
    }, timeoutMs);

    const send = (msg: RpcMessage) => ws.send(JSON.stringify(msg));

    let nonce: string | null = null;
    let connectId: string | null = null;
    let methodId: string | null = null;
    let connectSent = false;
    let connectFallbackTimer: ReturnType<typeof setTimeout>;

    const sendConnect = async () => {
      if (connectSent) return;
      connectSent = true;
      connectId = randomUUID();
      clearTimeout(connectFallbackTimer);

      const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
      const signedAtMs = Date.now();
      const connectNonce = nonce ?? "";

      // Sign payload for device identity (required to get operator.read access)
      const sigPayload = [
        "v2", device.deviceId, "openclaw-control-ui", "webchat",
        "operator", scopes.join(","), String(signedAtMs), gatewayToken, connectNonce,
      ].join("|");

      let signature: string;
      try {
        signature = await signPayload(device.privateKey, sigPayload);
      } catch {
        finish(undefined, new Error("Failed to sign device payload"));
        return;
      }

      send({
        type: "req",
        id: connectId,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "openclaw-control-ui",
            version: "2026.3.13",
            platform: "web",
            mode: "webchat",
            instanceId: device.deviceId,
          },
          role: "operator",
          scopes,
          device: {
            id: device.deviceId,
            publicKey: device.publicKeyB64,
            signature,
            signedAt: signedAtMs,
            nonce: connectNonce,
          },
          caps: ["tool-events"],
          auth: { token: gatewayToken },
          userAgent: "Mozilla/5.0 mission-control",
          locale: "en-US",
        },
      });
    };

    ws.on("open", () => {
      // Mirror browser client: send connect after 750ms if no challenge arrives first
      connectFallbackTimer = setTimeout(sendConnect, 750);
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as RpcMessage;

      // Gateway may send connect.challenge — cancel fallback and send connect with nonce
      if (msg.type === "event" && msg.event === "connect.challenge") {
        const challengePayload = msg.payload as { nonce?: string } | null;
        nonce = challengePayload?.nonce ?? null;
        clearTimeout(connectFallbackTimer);
        sendConnect();
        return;
      }

      // Connect response — send the actual RPC method
      if (msg.type === "res" && msg.id === connectId) {
        if (!msg.ok) {
          finish(undefined, new Error(`Gateway connect failed: ${msg.error?.message ?? "unknown"}`));
          return;
        }
        methodId = randomUUID();
        send({ type: "req", id: methodId, method, params });
        return;
      }

      // Method response
      if (msg.type === "res" && msg.id === methodId) {
        if (!msg.ok) {
          finish(undefined, new Error(`Gateway RPC error (${method}): ${msg.error?.message ?? "unknown"}`));
        } else {
          finish(msg.payload as T);
        }
      }
    });

    ws.on("error", (err) => {
      finish(undefined, new Error(`WebSocket error: ${err.message}`));
    });

    ws.on("close", (code) => {
      if (!settled) {
        finish(undefined, new Error(`WebSocket closed (code=${code}) — gateway WebSocket is localhost-only`));
      }
    });
  });
}
