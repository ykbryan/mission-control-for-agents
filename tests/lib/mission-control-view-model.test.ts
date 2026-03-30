import { describe, it, expect } from "vitest";
import {
  filterAgents,
  getSelectedAgent,
  getSystemStatusSummary,
  getInspectorMode,
} from "@/lib/mission-control-view-model";
import { agents as realAgents } from "@/lib/agents";
import type { Agent } from "@/lib/agents";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<Agent> & Pick<Agent, "id" | "name" | "role" | "skills">): Agent {
  return {
    emoji: "🤖",
    soul: "test soul",
    files: ["IDENTITY.md"],
    ...overrides,
  };
}

const alice = makeAgent({ id: "alice", name: "Alice", role: "Developer", skills: ["exec", "git"] });
const bob = makeAgent({ id: "bob", name: "Bob", role: "Designer", skills: ["notion", "image"] });
const charlie = makeAgent({
  id: "charlie",
  name: "Charlie",
  role: "QA Engineer",
  skills: ["browser", "exec"],
  routerId: "router1",
});
const AGENTS: Agent[] = [alice, bob, charlie];

// ---------------------------------------------------------------------------
// filterAgents
// ---------------------------------------------------------------------------
describe("filterAgents", () => {
  it("returns all agents for an empty query", () => {
    expect(filterAgents(AGENTS, "")).toHaveLength(AGENTS.length);
  });

  it("returns all agents for a whitespace-only query", () => {
    expect(filterAgents(AGENTS, "   ")).toHaveLength(AGENTS.length);
  });

  it("filters by agent name (case-insensitive)", () => {
    expect(filterAgents(AGENTS, "alice")).toEqual([alice]);
    expect(filterAgents(AGENTS, "ALICE")).toEqual([alice]);
    expect(filterAgents(AGENTS, "Ali")).toEqual([alice]);
  });

  it("filters by role (case-insensitive)", () => {
    expect(filterAgents(AGENTS, "designer")).toEqual([bob]);
    expect(filterAgents(AGENTS, "DESIGNER")).toEqual([bob]);
    expect(filterAgents(AGENTS, "qa eng")).toEqual([charlie]);
  });

  it("filters by skill (case-insensitive)", () => {
    const result = filterAgents(AGENTS, "notion");
    expect(result).toEqual([bob]);
  });

  it("returns multiple agents that share a matching skill", () => {
    const result = filterAgents(AGENTS, "exec");
    expect(result).toContain(alice);
    expect(result).toContain(charlie);
    expect(result).not.toContain(bob);
  });

  it("returns [] when no agent matches", () => {
    expect(filterAgents(AGENTS, "zyxwv")).toEqual([]);
  });

  it("matches partial skill names", () => {
    const result = filterAgents(AGENTS, "brow");
    expect(result).toContain(charlie);
  });

  it("works on an empty agents array", () => {
    expect(filterAgents([], "alice")).toEqual([]);
  });

  it("works correctly against real agents data", () => {
    const result = filterAgents(realAgents, "web_search");
    expect(result.length).toBeGreaterThan(0);
    for (const agent of result) {
      expect(agent.skills).toContain("web_search");
    }
  });
});

// ---------------------------------------------------------------------------
// getSelectedAgent
// ---------------------------------------------------------------------------
describe("getSelectedAgent", () => {
  it("resolves a compound 'routerId--agentId' key to the correct agent", () => {
    const result = getSelectedAgent(AGENTS, "router1--charlie");
    expect(result).toBe(charlie);
  });

  it("returns undefined (falls to agents[0]) when compound key matches agentId but wrong routerId", () => {
    const result = getSelectedAgent(AGENTS, "wrongRouter--charlie");
    expect(result).toBe(AGENTS[0]);
  });

  it("returns agent by plain id when no '--' separator is present", () => {
    expect(getSelectedAgent(AGENTS, "bob")).toBe(bob);
  });

  it("returns agents[0] when plain id does not match any agent", () => {
    expect(getSelectedAgent(AGENTS, "nonexistent")).toBe(AGENTS[0]);
  });

  it("returns agents[0] for an empty nodeId string", () => {
    expect(getSelectedAgent(AGENTS, "")).toBe(AGENTS[0]);
  });

  it("returns undefined when agents array is empty and nodeId does not match", () => {
    // agents.find returns undefined; agents[0] is also undefined on an empty array
    expect(getSelectedAgent([], "alice")).toBeUndefined();
  });

  it("returns undefined when agents array is empty and compound key is given", () => {
    expect(getSelectedAgent([], "router1--charlie")).toBeUndefined();
  });

  it("handles an agentId that contains '--' inside the id portion correctly", () => {
    const weirdAgent = makeAgent({
      id: "my--agent",
      name: "Weird",
      role: "Strange",
      skills: ["exec"],
      routerId: "my",
    });
    const result = getSelectedAgent([weirdAgent], "my--my--agent");
    // routerId = "my", agentId = "my--agent"; should match weirdAgent
    expect(result).toBe(weirdAgent);
  });
});

// ---------------------------------------------------------------------------
// getSystemStatusSummary
// ---------------------------------------------------------------------------
describe("getSystemStatusSummary", () => {
  it("returns '0 online' when no agents have status online", () => {
    const summary = getSystemStatusSummary(AGENTS, "graph");
    expect(summary).toContain("0 online");
  });

  it("returns correct count when agents are online", () => {
    const withStatus: Agent[] = [
      { ...alice, status: "online" },
      { ...bob, status: "online" },
      { ...charlie, status: "offline" },
    ];
    const summary = getSystemStatusSummary(withStatus, "graph");
    expect(summary).toContain("2 online");
  });

  it("returns '1 online' for exactly one online agent", () => {
    const withOne: Agent[] = [
      { ...alice, status: "online" },
      { ...bob, status: "idle" },
    ];
    const summary = getSystemStatusSummary(withOne, "graph");
    expect(summary).toContain("1 online");
  });

  it("includes '<Name> focused' when selectedAgent is provided", () => {
    const summary = getSystemStatusSummary(AGENTS, "graph", alice);
    expect(summary).toContain("Alice focused");
  });

  it("does NOT include a focused entry when selectedAgent is omitted", () => {
    const summary = getSystemStatusSummary(AGENTS, "graph");
    expect(summary.some((s) => s.includes("focused"))).toBe(false);
  });

  it("returns only non-null strings (no null entries in the array)", () => {
    const summary = getSystemStatusSummary(AGENTS, "workflow");
    for (const entry of summary) {
      expect(entry).not.toBeNull();
      expect(typeof entry).toBe("string");
    }
  });

  it("works with an empty agents array", () => {
    const summary = getSystemStatusSummary([], "graph");
    expect(summary).toContain("0 online");
  });
});

// ---------------------------------------------------------------------------
// getInspectorMode
// ---------------------------------------------------------------------------
describe("getInspectorMode", () => {
  it("returns 'agent' when activeFile is null", () => {
    expect(getInspectorMode(null)).toBe("agent");
  });

  it("returns 'file' when activeFile is a non-empty string", () => {
    expect(getInspectorMode("IDENTITY.md")).toBe("file");
  });

  it("returns 'file' for any non-null activeFile value", () => {
    expect(getInspectorMode("SOUL.md")).toBe("file");
    expect(getInspectorMode("TOOLS.md")).toBe("file");
    expect(getInspectorMode("some/path/to/file.md")).toBe("file");
  });
});
