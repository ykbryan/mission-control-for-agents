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

const PREVIEW_LEN = 160;

export interface ActivityEvent {
  id: string;
  type: "info" | "error" | "memory" | "chat";
  message: string;       // preview (truncated to PREVIEW_LEN chars)
  fullMessage?: string;  // full text, set only when message was truncated
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
  return match ? match[1].trim() : raw.trim();
}

function shortModel(model: string): string {
  return model.split("/").pop() ?? model;
}

function summariseArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  return JSON.stringify(args, null, 2);
}

function preview(text: string, maxLen = PREVIEW_LEN): { message: string; fullMessage?: string } {
  if (text.length <= maxLen) return { message: text };
  return { message: text.slice(0, maxLen) + "…", fullMessage: text };
}

export function parseMessages(messages: GatewayMessage[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let lastModel: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const ts = new Date(msg.timestamp ?? Date.now()).toISOString();
    const base = `${msg.timestamp ?? i}-${i}`;

    if (msg.role === "user") {
      const raw = msg.content?.find((c) => c.type === "text")?.text ?? "";
      const text = extractUserText(raw);
      if (text) {
        const p0 = preview(`💬 ${text}`);
        events.push({ id: `${base}-user`, type: "chat", timestamp: ts, ...p0 });
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
          const raw = item.text;

          // ── Extract clean reply text ─────────────────────────────────────
          // OpenClaw agents may wrap responses in <think>...</think> (internal
          // reasoning) and <final>...</final> (the actual reply sent to user).
          // Strip <think> blocks entirely; unwrap <final> if present.
          let replyText: string;
          const finalMatch = raw.match(/<final>([\s\S]*?)<\/final>/i);
          if (finalMatch) {
            // Use only the <final> content
            replyText = finalMatch[1];
          } else {
            // No <final> tag — strip <think>…</think> blocks and use remainder
            replyText = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
          }
          // Remove [[reply_to_current]] directive and trim
          replyText = replyText.replace(/\[\[reply_to_current\]\]/gi, "").trim();

          // ── Emit: thinking block (if present) as info, reply as chat ─────
          const hasThink = /<think>/i.test(raw);
          if (hasThink) {
            const thinkContent = (raw.match(/<think>([\s\S]*?)<\/think>/i)?.[1] ?? "").trim();
            if (thinkContent) {
              const p0 = preview(`💭 ${thinkContent}`);
              events.push({ id: `${base}-think-${j}`, type: "info", timestamp: ts, model: model ?? undefined, ...p0 });
            }
          }

          if (replyText) {
            const p1 = preview(`🤖 ${replyText}`);
            // Assistant replies that reach the user are chat events
            const isReply = !!finalMatch || (!hasThink && replyText.length > 0);
            events.push({ id: `${base}-text-${j}`, type: isReply ? "chat" : "info", timestamp: ts, model: model ?? undefined, ...p1 });
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
          ...preview(`🧠 ${toolName} → ${resultText}`),
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
      cache: "no-store",
    });
    const data = await res.json();
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
