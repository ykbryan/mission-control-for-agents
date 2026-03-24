/**
 * Shared logic for parsing sessions.get message arrays into ActivityEvents.
 * Used by both /api/agent-session (one-shot) and /api/agent-session/stream (SSE).
 */

export interface ContentItem {
  type: "text" | "thinking" | "toolCall";
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
}

export interface GatewayMessage {
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
  fullMessage?: string;
  timestamp: string;
  model?: string;
}

const MEMORY_TOOLS = new Set([
  "memory_search",
  "memory_store",
  "memory_update",
  "memory_delete",
  "memory_list",
]);

function isMemoryTool(name: string) {
  return MEMORY_TOOLS.has(name) || name.toLowerCase().includes("memory");
}

function extractUserText(raw: string): string {
  // Strip the "Sender (untrusted metadata):\n```json\n...\n```\n\n[timestamp] " preamble
  const match = raw.match(/\]\s+([\s\S]+)$/);
  if (match) return match[1].trim();
  // Try to find actual message after closing JSON brace (e.g. Conversation info format)
  const afterJson = raw.replace(/^[\s\S]*\}\s*'?\s*\n?/, '').trim();
  if (afterJson && afterJson.length > 0 && afterJson.length < raw.length * 0.8) return afterJson;
  return raw.trim();
}

function shortModel(model: string): string {
  return model.split("/").pop() ?? model;
}

function summariseArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const str = JSON.stringify(args);
  return str.length > 80 ? str.slice(0, 77) + "…" : str;
}

export function parseMessages(messages: GatewayMessage[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let lastModel: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const ts = new Date(msg.timestamp ?? Date.now()).toISOString();
    const base = `${msg.timestamp ?? i}-${i}`;

    if (msg.role === "user") {
      // Try all text content blocks; prefer one that extracts cleanly over raw metadata
      const textBlocks = (msg.content ?? [])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!);
      const extracted = textBlocks.map(extractUserText);
      // Prefer the shortest extracted text (likely the real message, not metadata blob)
      const text = extracted.sort((a, b) => a.length - b.length)[0] ?? "";
      if (text) {
        events.push({
          id: `${base}-user`,
          type: "info",
          message: `💬 ${text.slice(0, 140)}${text.length > 140 ? "…" : ""}`,
          fullMessage: text,
          timestamp: ts,
        });
      }
    } else if (msg.role === "assistant") {
      const model = msg.model;

      // Detect model change
      if (model && model !== lastModel) {
        events.push({
          id: `${base}-model`,
          type: "info",
          message:
            lastModel !== null
              ? `🔄 Model: ${shortModel(lastModel)} → ${shortModel(model)}`
              : `🧠 Model: ${shortModel(model)}`,
          timestamp: ts,
          model,
        });
        lastModel = model;
      }

      for (let j = 0; j < (msg.content ?? []).length; j++) {
        const item = msg.content![j];

        if (item.type === "text" && item.text) {
          const text = item.text.replace(/^\[\[reply_to_current\]\]\s*/, "").trim();
          if (text) {
            events.push({
              id: `${base}-text-${j}`,
              type: "info",
              message: `🤖 ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}`,
              timestamp: ts,
              model: model ?? undefined,
            });
          }
        } else if (item.type === "toolCall" && item.name) {
          events.push({
            id: `${base}-tool-${j}`,
            type: isMemoryTool(item.name) ? "memory" : "info",
            message: `🛠️ ${item.name}(${summariseArgs(item.arguments)})`,
            timestamp: ts,
            model: model ?? undefined,
          });
        }
        // Skip "thinking" blocks — internal reasoning noise
      }
    } else if (msg.role === "toolResult") {
      const toolName = msg.toolName ?? "unknown";
      if (msg.isError) {
        events.push({
          id: `${base}-result-error`,
          type: "error",
          message: `❌ ${toolName} failed`,
          timestamp: ts,
        });
      } else if (isMemoryTool(toolName)) {
        const resultText = (msg.content?.[0] as { text?: string } | undefined)?.text ?? "";
        events.push({
          id: `${base}-result-memory`,
          type: "memory",
          message: `🧠 ${toolName} → ${resultText.slice(0, 80)}${resultText.length > 80 ? "…" : ""}`,
          timestamp: ts,
        });
      }
    }
  }

  return events;
}

/**
 * Fetches the most recent session key for an agent via HTTP sessions_list.
 */
export async function fetchSessionKey(
  gatewayUrl: string,
  gatewayToken: string,
  agentId: string
): Promise<string | null> {
  try {
    const res = await fetch(`${gatewayUrl}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({ tool: "sessions_list", args: { limit: 500 } }),
    });
    const data = await res.json() as { ok: boolean; result?: { content?: Array<{ text?: string }> } };
    if (!data.ok) return null;
    const text = data.result?.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as {
      sessions: Array<{ key: string; updatedAt?: number }>;
    };
    const match = (parsed.sessions ?? [])
      .filter((s) => {
        const p = s.key?.split(":");
        return p?.[0] === "agent" && p[1] === agentId;
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    return match?.key ?? null;
  } catch {
    return null;
  }
}
