import { describe, it, expect } from "vitest";
import { gatewayColor } from "@/components/canvas/OrgNode";

/**
 * Tests for OrgNode utilities — specifically the gatewayColor() function.
 * gatewayColor() returns a CSS hex colour string selected from a fixed palette.
 */
describe("gatewayColor", () => {
  it("returns a non-empty string", () => {
    const color = gatewayColor("dave-ubuntu");
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });

  it("returns a hex colour string", () => {
    const color = gatewayColor("dave-ubuntu");
    expect(color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it("is deterministic — same label always returns same colour", () => {
    expect(gatewayColor("dave-ubuntu")).toBe(gatewayColor("dave-ubuntu"));
    expect(gatewayColor("clawbasehq")).toBe(gatewayColor("clawbasehq"));
  });

  it("returns a value from the known palette", () => {
    const PALETTE = ["#e85d27", "#4285f4", "#22c55e", "#9b59b6", "#f59e0b", "#ec4899", "#06b6d4"];
    const color = gatewayColor("dave-ubuntu");
    expect(PALETTE).toContain(color);
  });

  it("different labels may return different colours (hash-based)", () => {
    // Test across a range of labels — at least 2 distinct colours should appear
    const labels = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa"];
    const colors = new Set(labels.map(gatewayColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("handles an empty string without throwing", () => {
    expect(() => gatewayColor("")).not.toThrow();
    expect(typeof gatewayColor("")).toBe("string");
  });

  it("handles long labels", () => {
    expect(() => gatewayColor("a".repeat(200))).not.toThrow();
  });

  it("produces stable results across many calls", () => {
    const labels = ["dave-ubuntu", "clawbasehq", "home-server", "mac-mini", "pi-cluster"];
    const first = labels.map(gatewayColor);
    const second = labels.map(gatewayColor);
    expect(first).toEqual(second);
  });
});
