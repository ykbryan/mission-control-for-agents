import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway-rpc";

/**
 * Returns a rich activity log for an agent by calling sessions.get via WebSocket.
 * Falls back to empty array if WebSocket is unavailable (remote gateway).
 */

interface ContentItem {
  type: "text" | "thinking" | "toolCall";
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
}

interface GatewayMessage {
  role: "user" | "assistant" | "toolResult";
  content?: ContentItem[];
  api?: string;
  provider?: string;
  model?: string;
  usage?: { totalTokens?: number; cost?: { total?: number } };
  stopReason?: string;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

export interface ActivityEvent {
  id: string;
  type: "info" | "error" | "memory";
  message: string;
  timestamp: string;
  model?: string;
}

const MEMORY_TOOLS = ["memory_search", "memory_store", "memory_update", "memory_delete", "memory_list"];

function extractUserText(raw: string): string {
  // Strip the "Sender (untrusted metadata):\n```json\n...\n```\n\n[timestamp] " preamble
  const match = raw.match(/\]\s+(.+)$/ms);
  if (match) return match[1].trim();
  return raw.trim();
}

function shortModel(model: string): string {
  // e.g. "anthropic/claude-opus-4-6" → "claude-opus-4-6"
  //       "openai-codex/gpt-5.4"     → "gpt-5.4"
  return model.split("/").pop() ?? model;
}

function summariseArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const str = JSON.stringify(args);
  return str.length > 80 ? str.slice(0, 77) + "…" : str;
}

function parseMessages(messages: GatewayMessage[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let lastModel: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const ts = new Date(msg.timestamp ?? Date.now()).toISOString();
    const msgId = `${msg.timestamp ?? i}-${i}`;

    if (msg.role === "user") {
      const textItem = msg.content?.find((c) => c.type === "text");
      const raw = textItem?.text ?? "";
      const text = extractUserText(raw);
      if (text) {
        events.push({
          id: `${msgId}-user`,
          type: "info",
          message: `💬 ${text.slice(0, 140)}${text.length > 140 ? "…" : ""}`,
          timestamp: ts,
        });
      }
    } else if (msg.role === "assistant") {
      const model = msg.model;

      // Detect model change
      if (model && model !== lastModel) {
        if (lastModel !== null) {
          events.push({
            id: `${msgId}-model-change`,
            type: "info",
            message: `🔄 Model changed: ${shortModel(lastModel)} → ${shortModel(model)}`,
            timestamp: ts,
            model,
          });
        } else {
          events.push({
            id: `${msgId}-model-init`,
            type: "info",
            message: `🧠 Using model: ${shortModel(model)}`,
            timestamp: ts,
            model,
          });
        }
        lastModel = model;
      }

      for (let j = 0; j < (msg.content ?? []).length; j++) {
        const item = msg.content![j];

        if (item.type === "text" && item.text) {
          // Strip [[reply_to_current]] prefix if present
          const text = item.text.replace(/^\[\[reply_to_current\]\]\s*/, "").trim();
          if (text) {
            events.push({
              id: `${msgId}-text-${j}`,
              type: "info",
              message: `🤖 ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}`,
              timestamp: ts,
              model: model ?? undefined,
            });
          }
        } else if (item.type === "toolCall" && item.name) {
          const toolName = item.name;
          const isMemory = MEMORY_TOOLS.includes(toolName) || toolName.toLowerCase().includes("memory");
          events.push({
            id: `${msgId}-tool-${j}`,
            type: isMemory ? "memory" : "info",
            message: `🛠️ ${toolName}(${summariseArgs(item.arguments)})`,
            timestamp: ts,
            model: model ?? undefined,
          });
        }
        // Skip "thinking" — internal reasoning, not useful to display
      }
    } else if (msg.role === "toolResult") {
      const toolName = msg.toolName ?? "unknown";
      const isMemory = MEMORY_TOOLS.includes(toolName) || toolName.toLowerCase().includes("memory");
      // Only show errors — successful tool results are too noisy
      if (msg.isError) {
        events.push({
          id: `${msgId}-result-error`,
          type: "error",
          message: `❌ ${toolName} failed`,
          timestamp: ts,
        });
      } else if (isMemory) {
        // Always show memory results (they're meaningful)
        const resultText = (msg.content?.[0] as { text?: string } | undefined)?.text ?? "";
        events.push({
          id: `${msgId}-result-memory`,
          type: "memory",
          message: `🧠 ${toolName} → ${resultText.slice(0, 80)}${resultText.length > 80 ? "…" : ""}`,
          timestamp: ts,
        });
      }
    }
  }

  return events;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent");

  if (!agentId) return NextResponse.json({ error: "Missing agent" }, { status: 400 });

  const gatewayUrl = req.cookies.get("gatewayUrl")?.value;
  const gatewayToken = req.cookies.get("gatewayToken")?.value;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Step 1: Get the most recent session key for this agent via HTTP
  let sessionKeys: string[] = [];
  try {
    const res = await fetch(`${gatewayUrl}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({ tool: "sessions_list", args: { limit: 500 } }),
      cache: "no-store",
    });
    const data = await res.json();
    if (data.ok) {
      const text = data.result?.content?.[0]?.text ?? "{}";
      const parsed = JSON.parse(text) as {
        sessions: Array<{ key: string; updatedAt?: number }>;
      };
      sessionKeys = (parsed.sessions ?? [])
        .filter((s) => {
          const parts = s.key?.split(":");
          return parts?.[0] === "agent" && parts[1] === agentId;
        })
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 1) // most recent session only
        .map((s) => s.key);
    }
  } catch {
    // ignore
  }

  if (!sessionKeys.length) {
    return NextResponse.json([]);
  }

  // Step 2: Fetch full message history via WebSocket (localhost-only)
  try {
    const result = await gatewayRpc<{ messages: GatewayMessage[] }>(
      gatewayUrl,
      gatewayToken,
      "sessions.get",
      { key: sessionKeys[0] },
      10_000
    );

    const events = parseMessages(result.messages ?? []);
    // Return most recent 100 events (newest last for chronological display)
    return NextResponse.json(events.slice(-100));
  } catch {
    // WebSocket unavailable (remote gateway) — return empty
    return NextResponse.json([]);
  }
}
