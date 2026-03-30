import { describe, it, expect } from "vitest";
import {
  pricePerToken,
  estimateCost,
  modelToProvider,
  DEFAULT_PRICE_PER_1M,
} from "@/lib/model-pricing";

// ---------------------------------------------------------------------------
// pricePerToken
// ---------------------------------------------------------------------------
describe("pricePerToken", () => {
  it("returns correct price for Claude Sonnet 4", () => {
    // $7.80 / 1M tokens
    expect(pricePerToken("claude-sonnet-4")).toBeCloseTo(7.80 / 1_000_000, 10);
  });

  it("returns correct price for Claude Opus 4", () => {
    expect(pricePerToken("claude-opus-4")).toBeCloseTo(39 / 1_000_000, 10);
  });

  it("returns correct price for GPT-4o", () => {
    expect(pricePerToken("gpt-4o")).toBeCloseTo(5.50 / 1_000_000, 10);
  });

  it("returns correct price for gpt-4o-mini (not confused with gpt-4o)", () => {
    expect(pricePerToken("gpt-4o-mini")).toBeCloseTo(0.30 / 1_000_000, 10);
  });

  it("returns correct price for Gemini 2.5 Pro", () => {
    expect(pricePerToken("gemini-2.5-pro")).toBeCloseTo(7.00 / 1_000_000, 10);
  });

  it("returns correct price for Gemini 2.0 Flash Free (0 cost)", () => {
    expect(pricePerToken("gemini-2.0-flash-free")).toBe(0);
  });

  it("returns DEFAULT_PRICE_PER_1M for unrecognised model", () => {
    const unknown = pricePerToken("some-future-model-xyz");
    expect(unknown).toBeCloseTo(DEFAULT_PRICE_PER_1M / 1_000_000, 10);
  });

  it("is case-insensitive", () => {
    expect(pricePerToken("Claude-Opus-4")).toBeCloseTo(pricePerToken("claude-opus-4"), 12);
    expect(pricePerToken("GPT-4O")).toBeCloseTo(pricePerToken("gpt-4o"), 12);
  });

  it("handles provider-prefixed model strings", () => {
    expect(pricePerToken("anthropic/claude-sonnet-4")).toBeCloseTo(pricePerToken("claude-sonnet-4"), 12);
  });

  it("returns correct price for DeepSeek R1", () => {
    expect(pricePerToken("deepseek-r1")).toBeCloseTo(2.19 / 1_000_000, 10);
  });
});

// ---------------------------------------------------------------------------
// estimateCost
// ---------------------------------------------------------------------------
describe("estimateCost", () => {
  it("returns 0 for 0 tokens", () => {
    expect(estimateCost(0, "claude-sonnet-4")).toBe(0);
  });

  it("correctly estimates cost for 1M claude-sonnet-4 tokens", () => {
    // $7.80 per 1M
    expect(estimateCost(1_000_000, "claude-sonnet-4")).toBeCloseTo(7.80, 2);
  });

  it("correctly estimates cost for 500K gpt-4o tokens", () => {
    // $5.50 per 1M → $2.75 for 500K
    expect(estimateCost(500_000, "gpt-4o")).toBeCloseTo(2.75, 2);
  });

  it("returns a number with at most 6 decimal places", () => {
    const cost = estimateCost(123, "gpt-4o");
    const decimals = cost.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });

  it("uses default price for unknown model", () => {
    const expected = 1000 * (DEFAULT_PRICE_PER_1M / 1_000_000);
    expect(estimateCost(1000, "unknown-model-xyz")).toBeCloseTo(expected, 8);
  });
});

// ---------------------------------------------------------------------------
// modelToProvider
// ---------------------------------------------------------------------------
describe("modelToProvider", () => {
  it("identifies Anthropic models", () => {
    expect(modelToProvider("claude-sonnet-4")).toBe("Anthropic");
    expect(modelToProvider("claude-opus-4")).toBe("Anthropic");
    expect(modelToProvider("Claude-3-haiku")).toBe("Anthropic");
  });

  it("identifies OpenAI models", () => {
    expect(modelToProvider("gpt-4o")).toBe("OpenAI");
    expect(modelToProvider("gpt-3.5-turbo")).toBe("OpenAI");
    expect(modelToProvider("o1")).toBe("OpenAI");
    expect(modelToProvider("o3-mini")).toBe("OpenAI");
  });

  it("identifies Google models", () => {
    expect(modelToProvider("gemini-2.5-pro")).toBe("Google");
    expect(modelToProvider("gemini-1.5-flash")).toBe("Google");
  });

  it("identifies Mistral models", () => {
    expect(modelToProvider("mistral-large")).toBe("Mistral");
    expect(modelToProvider("mixtral-8x7b")).toBe("Mistral");
  });

  it("identifies Meta models", () => {
    expect(modelToProvider("llama-3-70b")).toBe("Meta");
  });

  it("identifies DeepSeek models", () => {
    expect(modelToProvider("deepseek-r1")).toBe("DeepSeek");
    expect(modelToProvider("deepseek-v3")).toBe("DeepSeek");
  });

  it("identifies Alibaba Qwen models", () => {
    expect(modelToProvider("qwen2.5-72b")).toBe("Alibaba");
  });

  it("identifies MiniMax models", () => {
    expect(modelToProvider("minimax-m2")).toBe("MiniMax");
  });

  it("identifies xAI Grok models", () => {
    expect(modelToProvider("grok-3")).toBe("xAI");
  });

  it('returns "Other" for unknown models', () => {
    expect(modelToProvider("some-unknown-model")).toBe("Other");
    expect(modelToProvider("")).toBe("Other");
  });
});
