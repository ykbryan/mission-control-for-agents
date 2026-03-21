/**
 * OpenClaw Gateway WebSocket RPC client.
 *
 * The gateway WebSocket (/__openclaw__/ws) only works when the Next.js server
 * is on the SAME machine as the gateway (localhost). Remote connections are
 * accepted at the TCP level but the gateway silently ignores all messages.
 *
 * Protocol flow:
 *  1. Open WebSocket with Authorization: Bearer <token> header
 *  2. Wait for { type: "event", event: "connect.challenge", payload: { nonce } }
 *  3. Send connect request with nonce + scopes
 *  4. Wait for connect response (ok: true)
 *  5. Send RPC method call
 *  6. Return payload from response
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
  seq?: number;
}

export async function gatewayRpc<T = unknown>(
  gatewayUrl: string,
  gatewayToken: string,
  method: string,
  params?: unknown,
  timeoutMs = 10_000
): Promise<T> {
  const wsUrl = `${gatewayUrl.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://")}/__openclaw__/ws`;

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finish = (value?: T, err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value as T);
    };

    const ws = new WebSocket(wsUrl, [], {
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        Origin: gatewayUrl, // match the gateway's own origin for allowedOrigins check
      },
    });

    const timer = setTimeout(() => {
      finish(undefined, new Error(`Gateway RPC timeout (${method}) — WebSocket is localhost-only`));
    }, timeoutMs);

    const send = (msg: RpcMessage) => ws.send(JSON.stringify(msg));

    let nonce: string | null = null;
    let connectId: string | null = null;
    let methodId: string | null = null;

    ws.on("open", () => {
      // Wait for connect.challenge event before sending anything
    });

    ws.on("message", (data) => {
      let msg: RpcMessage;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      // Step 1: gateway sends connect.challenge — respond with connect request
      if (msg.type === "event" && msg.event === "connect.challenge") {
        const challengePayload = msg.payload as { nonce?: string } | null;
        nonce = challengePayload?.nonce ?? null;
        connectId = randomUUID();
        send({
          type: "req",
          id: connectId,
          method: "connect",
          params: {
            client: { id: "mission-control", mode: "web", instanceId: "mc-1" },
            role: "operator",
            scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
            caps: ["tool-events"],
            auth: { token: gatewayToken },
            ...(nonce ? { nonce } : {}),
          },
        });
        return;
      }

      // Step 2: connect response — send the actual RPC method
      if (msg.type === "res" && msg.id === connectId) {
        if (!msg.ok) {
          finish(undefined, new Error(`Gateway connect failed: ${msg.error?.message ?? "unknown"}`));
          return;
        }
        methodId = randomUUID();
        send({ type: "req", id: methodId, method, params });
        return;
      }

      // Step 3: method response
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
        finish(undefined, new Error(`WebSocket closed before response (code=${code}) — gateway WebSocket is localhost-only`));
      }
    });
  });
}
