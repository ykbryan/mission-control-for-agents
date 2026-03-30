import { describe, it, expect } from "vitest";
import { agents, skillDescriptions } from "@/lib/agents";

// ---------------------------------------------------------------------------
// agents array
// ---------------------------------------------------------------------------
describe("agents array", () => {
  it("has exactly 19 entries", () => {
    expect(agents).toHaveLength(19);
  });

  it("contains all expected agent IDs", () => {
    const expectedIds = [
      "brainy", "angel", "bob", "charles", "evelyn", "faith", "gorilla",
      "hex", "ivy", "kat", "looker", "mother", "norton", "omega", "pat",
      "queen", "roy", "jelly", "uma",
    ];
    const actualIds = agents.map((a) => a.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });

  it("every agent has a non-empty id", () => {
    for (const agent of agents) {
      expect(agent.id).toBeTruthy();
    }
  });

  it("every agent has a non-empty name", () => {
    for (const agent of agents) {
      expect(agent.name).toBeTruthy();
    }
  });

  it("every agent has a non-empty emoji", () => {
    for (const agent of agents) {
      expect(agent.emoji).toBeTruthy();
    }
  });

  it("every agent has a non-empty role", () => {
    for (const agent of agents) {
      expect(agent.role).toBeTruthy();
    }
  });

  it("every agent has a non-empty soul", () => {
    for (const agent of agents) {
      expect(agent.soul).toBeTruthy();
    }
  });

  it("all agent IDs are unique", () => {
    const ids = agents.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every agent has at least one skill", () => {
    for (const agent of agents) {
      expect(Array.isArray(agent.skills)).toBe(true);
      expect(agent.skills.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every agent has at least one file, including IDENTITY.md", () => {
    for (const agent of agents) {
      expect(Array.isArray(agent.files)).toBe(true);
      expect(agent.files.length).toBeGreaterThanOrEqual(1);
      expect(agent.files).toContain("IDENTITY.md");
    }
  });

  it("agents with `tier` set are either 'orchestrator' or 'specialist'", () => {
    const validTiers = new Set(["orchestrator", "specialist"]);
    for (const agent of agents) {
      if (agent.tier !== undefined) {
        expect(validTiers.has(agent.tier)).toBe(true);
      }
    }
  });

  it("uma has tier 'orchestrator'", () => {
    const uma = agents.find((a) => a.id === "uma");
    expect(uma?.tier).toBe("orchestrator");
  });

  it("gorilla has nodeHostname 'develop-ubuntu'", () => {
    const gorilla = agents.find((a) => a.id === "gorilla");
    expect(gorilla?.nodeHostname).toBe("develop-ubuntu");
  });

  it("ivy has nodeHostname 'mac.lan'", () => {
    const ivy = agents.find((a) => a.id === "ivy");
    expect(ivy?.nodeHostname).toBe("mac.lan");
  });

  it("jelly has nodeHostname 'ubuntu-personal'", () => {
    const jelly = agents.find((a) => a.id === "jelly");
    expect(jelly?.nodeHostname).toBe("ubuntu-personal");
  });
});

// ---------------------------------------------------------------------------
// skillDescriptions
// ---------------------------------------------------------------------------
describe("skillDescriptions", () => {
  it("has an entry for web_search", () => {
    expect(skillDescriptions.web_search).toBeTruthy();
  });

  it("has an entry for notion", () => {
    expect(skillDescriptions.notion).toBeTruthy();
  });

  it("has an entry for exec", () => {
    expect(skillDescriptions.exec).toBeTruthy();
  });

  it("has an entry for git", () => {
    expect(skillDescriptions.git).toBeTruthy();
  });

  it("has an entry for github", () => {
    expect(skillDescriptions.github).toBeTruthy();
  });

  it("has an entry for calendar", () => {
    expect(skillDescriptions.calendar).toBeTruthy();
  });

  it("all description values are non-empty strings", () => {
    for (const [key, value] of Object.entries(skillDescriptions)) {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("every skill that exists in skillDescriptions has a non-empty description", () => {
    const agentSkills = new Set(agents.flatMap((a) => a.skills));
    for (const skill of agentSkills) {
      if (skill in skillDescriptions) {
        expect(skillDescriptions[skill]).toBeTruthy();
      }
    }
  });
});
