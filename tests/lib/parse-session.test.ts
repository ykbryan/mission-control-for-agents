import { describe, it, expect } from "vitest";
import { parseMessages, type GatewayMessage } from "@/lib/parse-session";

const TS = 1_700_000_000_000; // fixed timestamp for deterministic tests

function makeUser(text: string, ts = TS): GatewayMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: ts,
  };
}

function makeAssistant(
  text: string,
  model = "claude-sonnet-4",
  ts = TS
): GatewayMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model,
    timestamp: ts,
  };
}

function makeTool(
  name: string,
  args: unknown = {},
  ts = TS
): GatewayMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", name, arguments: args }],
    model: "claude-sonnet-4",
    timestamp: ts,
  };
}

function makeToolResult(
  toolName: string,
  isError = false,
  resultText = "ok",
  ts = TS
): GatewayMessage {
  return {
    role: "toolResult",
    toolName,
    isError,
    content: [{ type: "text", text: resultText }],
    timestamp: ts,
  };
}

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------
describe("parseMessages — basic", () => {
  it("returns [] for an empty message list", () => {
    expect(parseMessages([])).toEqual([]);
  });

  it("emits a chat event for a user message", () => {
    const events = parseMessages([makeUser("Hello!")]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("chat");
    expect(events[0].message).toContain("Hello!");
  });

  it("emits initial model event for first assistant message", () => {
    const events = parseMessages([makeAssistant("Hi there", "claude-sonnet-4")]);
    const modelEvent = events.find((e) => e.message.startsWith("🧠 Model:"));
    expect(modelEvent).toBeDefined();
    expect(modelEvent!.message).toBe("🧠 Model: claude-sonnet-4");
  });

  it("emits a chat event for a plain assistant reply", () => {
    const events = parseMessages([makeAssistant("Here is the answer.")]);
    const chatEvent = events.find((e) => e.type === "chat");
    expect(chatEvent).toBeDefined();
    expect(chatEvent!.message).toContain("Here is the answer.");
  });
});

// ---------------------------------------------------------------------------
// Model change detection
// ---------------------------------------------------------------------------
describe("parseMessages — model switching", () => {
  it("emits a switch event when model changes between messages", () => {
    const messages: GatewayMessage[] = [
      makeAssistant("First", "claude-sonnet-4", TS),
      makeAssistant("Second", "claude-opus-4", TS + 1000),
    ];
    const events = parseMessages(messages);
    const switchEvent = events.find((e) =>
      e.message.includes("→")
    );
    expect(switchEvent).toBeDefined();
    expect(switchEvent!.message).toBe("🔄 Model: claude-sonnet-4 → claude-opus-4");
  });

  it("does NOT emit a switch event when model stays the same", () => {
    const messages: GatewayMessage[] = [
      makeAssistant("First", "gpt-4o"),
      makeAssistant("Second", "gpt-4o"),
    ];
    const events = parseMessages(messages);
    const switchEvents = events.filter((e) => e.message.includes("→"));
    expect(switchEvents).toHaveLength(0);
  });

  it("strips provider prefix in model names shown in events", () => {
    const messages: GatewayMessage[] = [
      makeAssistant("A", "anthropic/claude-sonnet-4", TS),
      makeAssistant("B", "openai/gpt-4o", TS + 1000),
    ];
    const events = parseMessages(messages);
    const switchEvent = events.find((e) => e.message.includes("→"));
    expect(switchEvent!.message).toBe("🔄 Model: claude-sonnet-4 → gpt-4o");
  });

  it("records model on emitted events", () => {
    const events = parseMessages([makeAssistant("reply", "gemini-2.5-pro")]);
    const chatEvent = events.find((e) => e.type === "chat");
    expect(chatEvent?.model).toBe("gemini-2.5-pro");
  });
});

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------
describe("parseMessages — tool calls", () => {
  it("emits an info event for regular tool calls", () => {
    const events = parseMessages([makeTool("web_search", { query: "next.js" })]);
    const toolEvent = events.find((e) => e.message.includes("web_search"));
    expect(toolEvent).toBeDefined();
    expect(toolEvent!.type).toBe("info");
    expect(toolEvent!.message).toContain("🛠️ web_search");
  });

  it("emits a memory event for memory tools", () => {
    const memoryTools = [
      "memory_search",
      "memory_store",
      "memory_update",
      "memory_delete",
      "memory_list",
    ];
    for (const tool of memoryTools) {
      const events = parseMessages([makeTool(tool)]);
      const toolEvent = events.find((e) => e.message.includes(tool));
      expect(toolEvent?.type).toBe("memory");
    }
  });

  it("emits a memory event for custom tool names containing 'memory'", () => {
    const events = parseMessages([makeTool("my_memory_helper")]);
    const toolEvent = events.find((e) => e.type === "memory");
    expect(toolEvent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tool results
// ---------------------------------------------------------------------------
describe("parseMessages — tool results", () => {
  it("emits an error event when tool result has isError=true", () => {
    const events = parseMessages([makeToolResult("exec", true)]);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain("❌ exec failed");
  });

  it("does NOT emit an event for successful non-memory tool results", () => {
    const events = parseMessages([makeToolResult("web_search", false, "results")]);
    expect(events).toHaveLength(0);
  });

  it("emits a memory event for successful memory tool result", () => {
    const events = parseMessages([
      makeToolResult("memory_store", false, "stored successfully"),
    ]);
    const memEvent = events.find((e) => e.type === "memory");
    expect(memEvent).toBeDefined();
    expect(memEvent!.message).toContain("memory_store");
  });
});

// ---------------------------------------------------------------------------
// <think> and <final> tag handling
// ---------------------------------------------------------------------------
describe("parseMessages — think/final tags", () => {
  it("strips <think> blocks and emits the remainder as an info event (no <final>)", () => {
    // Without a <final> tag, the text after stripping <think> is emitted as type "info"
    // (isReply = false when hasThink=true and no finalMatch)
    const msg = makeAssistant("<think>Internal reasoning here</think>Final reply to user");
    const events = parseMessages([msg]);
    const textEvent = events.find((e) => e.message.includes("Final reply to user"));
    expect(textEvent).toBeDefined();
    expect(textEvent!.message).not.toContain("Internal reasoning");
    expect(textEvent!.message).toContain("Final reply to user");
  });

  it("extracts content from <final> tag", () => {
    const msg = makeAssistant("<think>thinking...</think><final>Real answer</final>");
    const events = parseMessages([msg]);
    const chatEvent = events.find((e) => e.type === "chat");
    expect(chatEvent?.message).toContain("Real answer");
    expect(chatEvent?.message).not.toContain("thinking");
  });

  it("emits a thinking info event when <think> is present", () => {
    const msg = makeAssistant("<think>Some deep thought</think>Reply");
    const events = parseMessages([msg]);
    const thinkEvent = events.find((e) => e.message.startsWith("💭"));
    expect(thinkEvent).toBeDefined();
    expect(thinkEvent!.type).toBe("info");
  });

  it("strips [[reply_to_current]] directive", () => {
    const msg = makeAssistant("Answer here [[reply_to_current]]");
    const events = parseMessages([msg]);
    const chatEvent = events.find((e) => e.type === "chat");
    expect(chatEvent?.message).not.toContain("reply_to_current");
    expect(chatEvent?.message).toContain("Answer here");
  });
});

// ---------------------------------------------------------------------------
// Text truncation / preview
// ---------------------------------------------------------------------------
describe("parseMessages — preview/truncation", () => {
  it("truncates very long messages and sets fullMessage", () => {
    const longText = "A".repeat(300);
    const msg = makeUser(longText);
    const events = parseMessages([msg]);
    const evt = events[0];
    expect(evt.message.endsWith("…")).toBe(true);
    expect(evt.fullMessage).toBeDefined();
    expect(evt.fullMessage!.length).toBeGreaterThan(evt.message.length);
  });

  it("does NOT set fullMessage for short messages", () => {
    const msg = makeUser("Short message");
    const events = parseMessages([msg]);
    expect(events[0].fullMessage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// User message preamble stripping
// ---------------------------------------------------------------------------
describe("parseMessages — user preamble stripping", () => {
  it("strips OpenClaw metadata preamble from user messages", () => {
    const raw =
      'Sender (untrusted metadata):\n```json\n{"role":"user"}\n```\n\n[2024-01-01 12:00] Hello from user';
    const events = parseMessages([makeUser(raw)]);
    const chatEvent = events.find((e) => e.type === "chat");
    expect(chatEvent?.message).toContain("Hello from user");
    expect(chatEvent?.message).not.toContain("untrusted metadata");
  });

  it("handles plain user messages without preamble", () => {
    const events = parseMessages([makeUser("Simple message")]);
    expect(events[0].message).toContain("Simple message");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("parseMessages — edge cases", () => {
  it("handles assistant with no content gracefully", () => {
    const msg: GatewayMessage = { role: "assistant", model: "gpt-4o", timestamp: TS };
    expect(() => parseMessages([msg])).not.toThrow();
  });

  it("handles user message with no text content", () => {
    const msg: GatewayMessage = {
      role: "user",
      content: [{ type: "thinking", thinking: "some thinking" }],
      timestamp: TS,
    };
    // Should not crash; no chat event emitted since no text content
    const events = parseMessages([msg]);
    expect(events.filter((e) => e.type === "chat")).toHaveLength(0);
  });

  it("assigns unique IDs to all events", () => {
    const messages: GatewayMessage[] = [
      makeUser("hello", TS),
      makeAssistant("hi", "gpt-4o", TS + 1),
      makeTool("web_search", {}, TS + 2),
    ];
    const events = parseMessages(messages);
    const ids = events.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("produces ISO timestamp strings", () => {
    const events = parseMessages([makeUser("test")]);
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
