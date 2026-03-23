/**
 * Per-model token pricing.
 *
 * All rates are USD per 1M tokens, blended input+output assuming a
 * typical ~60 % input / 40 % output ratio for conversational agents.
 *
 * Sources (public pricing pages as of 2026-03):
 *   Anthropic  — https://www.anthropic.com/pricing
 *   OpenAI     — https://openai.com/api/pricing
 *   Google     — https://ai.google.dev/pricing
 *   Mistral    — https://mistral.ai/technology/#pricing
 *   Meta       — via API providers (together.ai, fireworks.ai)
 *   DeepSeek   — https://platform.deepseek.com/api-docs/pricing
 *   Alibaba    — https://www.alibabacloud.com/product/dashscope
 *   MiniMax    — https://platform.minimaxi.com/document/Price
 *
 * Models marked (est.) have no confirmed public pricing — rates are
 * best-effort estimates based on model tier/capability.
 */

// USD per 1 million tokens (blended)
const PRICES: Array<[pattern: RegExp, usdPer1M: number]> = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
  // claude-opus-4 series  ($15 in / $75 out → blended ~$39 at 60/40)
  [/claude-opus-4/i,              39.00],
  [/claude-3-opus/i,              39.00],
  // claude-sonnet-4 series ($3 in / $15 out → blended ~$7.80)
  [/claude-sonnet-4/i,             7.80],
  [/claude-3[-.]5-sonnet/i,        7.80],
  [/claude-3-sonnet/i,             7.80],
  // claude-haiku
  [/claude-haiku-3[-.]5/i,         2.08],
  [/claude-3-haiku/i,              0.65],
  [/claude-2/i,                    8.00],
  [/claude-instant/i,              1.63],

  // ── OpenAI ────────────────────────────────────────────────────────────────
  // GPT-5 series (est. — premium flagship pricing)
  [/gpt-5/i,                      75.00],
  [/gpt-4o-mini/i,                 0.30],  // must come before gpt-4o
  [/gpt-4o/i,                      5.50],
  [/gpt-4-turbo/i,                18.00],
  [/gpt-4/i,                      42.00],
  [/\bo4-mini\b/i,                 4.40],
  [/\bo3-mini\b/i,                 3.30],
  [/\bo3\b/i,                     40.00],
  [/\bo1-mini\b/i,                 7.80],
  [/\bo1\b/i,                     33.00],
  [/gpt-3\.5-turbo/i,              1.50],

  // ── Google ────────────────────────────────────────────────────────────────
  // gemini-3.x (est. — next-gen Pro tier, extrapolated from 2.5 Pro trajectory)
  [/gemini-3\.\d+-pro/i,          10.00],
  [/gemini-3\.\d+/i,               0.50],  // flash/lite tier of gemini-3
  // gemini-2.5
  [/gemini-2\.5-pro/i,             7.00],  // $1.25/$10 per 1M (tiered, est. blended)
  [/gemini-2\.5-flash/i,           0.30],  // $0.075/$0.30
  // gemini-2.0
  [/gemini-2\.0-flash.*free/i,     0.00],  // free tier
  [/gemini-2\.0-flash/i,           0.17],
  // gemini-1.5
  [/gemini-1\.5-pro/i,             6.30],
  [/gemini-1\.5-flash/i,           0.17],
  [/gemini-ultra/i,               18.00],
  [/gemini-pro/i,                  1.25],  // generic fallback

  // ── Mistral ───────────────────────────────────────────────────────────────
  [/mistral-large/i,               8.00],
  [/mistral-small/i,               1.00],
  [/mistral-nemo/i,                0.30],
  [/mixtral-8x22b/i,               2.00],
  [/mixtral-8x7b/i,                0.70],
  [/mistral-7b/i,                  0.25],

  // ── Meta Llama ────────────────────────────────────────────────────────────
  [/llama-3.*405b/i,               5.00],
  [/llama-3.*70b/i,                0.90],
  [/llama-3.*8b/i,                 0.20],
  [/llama-3/i,                     0.90],

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  [/deepseek-r1/i,                 2.19],
  [/deepseek-v3/i,                 0.89],
  [/deepseek-chat/i,               0.27],
  [/deepseek-coder/i,              0.27],

  // ── Alibaba Qwen ──────────────────────────────────────────────────────────
  // qwen3.5:397b-cloud (est. — 400B+ param cloud model, premium tier)
  [/qwen3\.5.*397b/i,              4.00],
  [/qwen3\.5/i,                    1.50],
  [/qwen3/i,                       1.00],
  [/qwen2\.5.*72b/i,               0.40],
  [/qwen2\.5/i,                    0.30],
  [/qwen/i,                        0.50],  // generic fallback

  // ── MiniMax ───────────────────────────────────────────────────────────────
  // minimax-m2.7:cloud (est. — MiniMax Text-01/M-series cloud API)
  [/minimax-m[23]/i,               1.00],
  [/minimax/i,                     0.80],

  // ── xAI Grok ──────────────────────────────────────────────────────────────
  [/grok-3/i,                     15.00],
  [/grok-2/i,                     10.00],
  [/grok/i,                        5.00],
];

/** Default fallback when model is unknown ($/1M tokens). */
export const DEFAULT_PRICE_PER_1M = 3.00;

/**
 * Return the blended USD cost per 1 token for a given model name.
 * Matches by first pattern that fits; falls back to DEFAULT_PRICE_PER_1M.
 */
export function pricePerToken(model: string): number {
  for (const [pattern, price] of PRICES) {
    if (pattern.test(model)) return price / 1_000_000;
  }
  return DEFAULT_PRICE_PER_1M / 1_000_000;
}

/** Convenience: compute estimated cost for a token count + model. */
export function estimateCost(tokens: number, model: string): number {
  return parseFloat((tokens * pricePerToken(model)).toFixed(6));
}
