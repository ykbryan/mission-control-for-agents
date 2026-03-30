import { describe, it, expect } from "vitest";

/**
 * Tests for router/src/pricing.ts (server-side pricing logic).
 * We import directly from the router source.
 */
import {
  estimateCost,
  DEFAULT_PRICE_PER_1M,
} from "../../router/src/pricing";

describe("router/pricing — estimateCost", () => {
  it("returns 0 for 0 tokens", () => {
    expect(estimateCost(0, "claude-sonnet-4")).toBe(0);
  });

  it("estimates Claude Sonnet 4 at $7.80/1M", () => {
    expect(estimateCost(1_000_000, "claude-sonnet-4")).toBeCloseTo(7.80, 2);
  });

  it("estimates Claude Opus 4 at $39/1M", () => {
    expect(estimateCost(1_000_000, "claude-opus-4")).toBeCloseTo(39, 2);
  });

  it("estimates GPT-4o at $5.50/1M", () => {
    expect(estimateCost(1_000_000, "gpt-4o")).toBeCloseTo(5.50, 2);
  });

  it("uses default rate for unknown models", () => {
    const expected = 500_000 * (DEFAULT_PRICE_PER_1M / 1_000_000);
    expect(estimateCost(500_000, "some-unknown-model")).toBeCloseTo(expected, 4);
  });

  it("is case-insensitive for model matching", () => {
    const a = estimateCost(1000, "Claude-Sonnet-4");
    const b = estimateCost(1000, "claude-sonnet-4");
    expect(a).toBeCloseTo(b, 8);
  });

  it("result has at most 6 decimal places", () => {
    const cost = estimateCost(12345, "gpt-4o");
    const decStr = cost.toString().split(".")[1] ?? "";
    expect(decStr.length).toBeLessThanOrEqual(6);
  });
});
