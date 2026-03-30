import { describe, it, expect } from "vitest";
import { parseMessages } from "../../../../../router/src/parse-session";
import type { GatewayMessage } from "../../../../../router/src/parse-session";

/**
 * Tests for router/src/parse-session.ts (server-side parsing).
 * The router's version differs slightly from lib/parse-session (no "chat" type,
 * different preview length) — we test it independently.
 */

const TS = 1_700_000_000_000;

function makeUser(text: string): GatewayMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: TS };
}

function makeAssistant(text: string, model = "claude-sonnet-4"): GatewayMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model,
    timestamp: TS,
  };
}

function makeToolCall(name: string, args: unknown = {}): GatewayMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", name, arguments: args }],
    model: "claude-sonnet-4",
    timestamp: TS,
  };
}

function makeToolResult(toolName: string, isError = false): GatewayMessage {
  return { role: "toolResult", toolName, isError, timestamp: TS };
}

describe("router/parseMessages — basic", () => {
  it("returns [] for empty input", () => {
    expect(parseMessages([])).toEqual([]);
  });

  it("emits event for user message", () => {
    const events = parseMessages([makeUser("hello")]);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].message).toContain("hello");
  });

  it("emits initial model event for first assistant", () => {
    const events = parseMessages([makeAssistant("hi", "gpt-4o")]);
    const modelEvent = events.find((e) => e.message.includes("🧠 Model:"));
    expect(modelEvent).toBeDefined();
  });

  it("emits model-switch event when model changes", () => {
    const events = parseMessages([
      makeAssistant("first", "claude-sonnet-4"),
      makeAssistant("second", "claude-haiku-3.5"),
    ]);
    const switchEvent = events.find((e) => e.message.includes("→"));
    expect(switchEvent).toBeDefined();
    expect(switchEvent!.message).toContain("claude-haiku-3.5");
  });

  it("does not emit switch event when model unchanged", () => {
    const events = parseMessages([
      makeAssistant("a", "gpt-4o"),
      makeAssistant("b", "gpt-4o"),
    ]);
    const switchEvents = events.filter((e) => e.message.includes("→"));
    expect(switchEvents).toHaveLength(0);
  });
});

describe("router/parseMessages — tool events", () => {
  it("emits info event for regular tools", () => {
    const events = parseMessages([makeToolCall("web_search", { query: "test" })]);
    const toolEvt = events.find((e) => e.message.includes("web_search"));
    expect(toolEvt?.type).toBe("info");
  });

  it("emits memory event for memory tools", () => {
    const events = parseMessages([makeToolCall("memory_store", {})]);
    const memEvt = events.find((e) => e.message.includes("memory_store"));
    expect(memEvt?.type).toBe("memory");
  });

  it("emits error event for failed tool results", () => {
    const events = parseMessages([makeToolResult("exec", true)]);
    const errEvt = events.find((e) => e.type === "error");
    expect(errEvt).toBeDefined();
    expect(errEvt!.message).toContain("exec");
  });
});

describe("router/parseMessages — edge cases", () => {
  it("all emitted events have unique IDs", () => {
    const msgs: GatewayMessage[] = [
      makeUser("hello"),
      makeAssistant("hi", "gpt-4o"),
      makeToolCall("web_search"),
      makeToolResult("web_search", true),
    ];
    const events = parseMessages(msgs);
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not throw on assistant with empty content array", () => {
    const msg: GatewayMessage = { role: "assistant", model: "gpt-4o", content: [], timestamp: TS };
    expect(() => parseMessages([msg])).not.toThrow();
  });

  it("handles missing timestamp gracefully", () => {
    const msg: GatewayMessage = { role: "user", content: [{ type: "text", text: "hi" }] };
    const events = parseMessages([msg]);
    // Should still produce an ISO string timestamp (uses Date.now() fallback)
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
