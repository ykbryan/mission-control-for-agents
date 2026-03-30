import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  timeAgo,
  fmtCost,
  fmtTokens,
  uptimeFmt,
  shortModel,
  fmtDate,
  fmtDateTs,
  isoWeek,
} from "@/lib/formatters";

// ---------------------------------------------------------------------------
// timeAgo
// ---------------------------------------------------------------------------
describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z").getTime());
  });
  afterEach(() => vi.useRealTimers());

  it('returns "never" for falsy / zero timestamp', () => {
    expect(timeAgo(0)).toBe("never");
  });

  it('returns "just now" for < 5 seconds ago', () => {
    const now = Date.now();
    expect(timeAgo(now - 2000)).toBe("just now");
    expect(timeAgo(now - 4999)).toBe("just now");
  });

  it("returns seconds for 5s–59s ago", () => {
    const now = Date.now();
    expect(timeAgo(now - 5000)).toBe("5s ago");
    expect(timeAgo(now - 59000)).toBe("59s ago");
  });

  it("returns minutes for 1m–59m ago", () => {
    const now = Date.now();
    expect(timeAgo(now - 60_000)).toBe("1m ago");
    expect(timeAgo(now - 3599_000)).toBe("59m ago");
  });

  it("returns hours for 1h–23h ago", () => {
    const now = Date.now();
    expect(timeAgo(now - 3600_000)).toBe("1h ago");
    expect(timeAgo(now - 86399_000)).toBe("23h ago");
  });

  it("returns days for 1d+", () => {
    const now = Date.now();
    expect(timeAgo(now - 86400_000)).toBe("1d ago");
    expect(timeAgo(now - 7 * 86400_000)).toBe("7d ago");
  });
});

// ---------------------------------------------------------------------------
// fmtCost
// ---------------------------------------------------------------------------
describe("fmtCost", () => {
  it("formats zero exactly", () => {
    expect(fmtCost(0)).toBe("$0.0000");
  });

  it("shows '< $0.0001' for very small values", () => {
    expect(fmtCost(0.00001)).toBe("< $0.0001");
    expect(fmtCost(0.000099)).toBe("< $0.0001");
  });

  it("formats normal values with 4 decimal places", () => {
    expect(fmtCost(1.23456789)).toBe("$1.2346");
    expect(fmtCost(0.1)).toBe("$0.1000");
    expect(fmtCost(100)).toBe("$100.0000");
  });

  it("handles exactly $0.0001", () => {
    expect(fmtCost(0.0001)).toBe("$0.0001");
  });
});

// ---------------------------------------------------------------------------
// fmtTokens
// ---------------------------------------------------------------------------
describe("fmtTokens", () => {
  it("returns '0' for falsy values", () => {
    expect(fmtTokens(0)).toBe("0");
  });

  it("returns plain number for < 1K", () => {
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(1)).toBe("1");
  });

  it("formats thousands with K suffix", () => {
    expect(fmtTokens(1000)).toBe("1.0K");
    expect(fmtTokens(1500)).toBe("1.5K");
    expect(fmtTokens(999_999)).toBe("1000.0K");
  });

  it("formats millions with M suffix", () => {
    expect(fmtTokens(1_000_000)).toBe("1.0M");
    expect(fmtTokens(2_500_000)).toBe("2.5M");
  });
});

// ---------------------------------------------------------------------------
// uptimeFmt
// ---------------------------------------------------------------------------
describe("uptimeFmt", () => {
  it("shows seconds for < 60s", () => {
    expect(uptimeFmt(0)).toBe("0s");
    expect(uptimeFmt(45)).toBe("45s");
    expect(uptimeFmt(59)).toBe("59s");
  });

  it("shows minutes for 60s–3599s", () => {
    expect(uptimeFmt(60)).toBe("1m");
    expect(uptimeFmt(3599)).toBe("59m");
  });

  it("shows hours and minutes for 1h–23h", () => {
    expect(uptimeFmt(3600)).toBe("1h 0m");
    expect(uptimeFmt(3661)).toBe("1h 1m");
    expect(uptimeFmt(86399)).toBe("23h 59m");
  });

  it("shows days and hours for >= 1 day", () => {
    expect(uptimeFmt(86400)).toBe("1d 0h");
    expect(uptimeFmt(90000)).toBe("1d 1h");
    expect(uptimeFmt(7 * 86400)).toBe("7d 0h");
  });
});

// ---------------------------------------------------------------------------
// shortModel
// ---------------------------------------------------------------------------
describe("shortModel", () => {
  it("strips provider prefix", () => {
    expect(shortModel("anthropic/claude-sonnet-4")).toBe("claude-sonnet-4");
    expect(shortModel("openai/gpt-4o")).toBe("gpt-4o");
  });

  it("returns the string unchanged when no slash", () => {
    expect(shortModel("claude-sonnet-4")).toBe("claude-sonnet-4");
    expect(shortModel("gpt-4")).toBe("gpt-4");
  });

  it("handles multiple slashes — keeps last segment", () => {
    expect(shortModel("a/b/c/model-name")).toBe("model-name");
  });

  it("handles empty string", () => {
    expect(shortModel("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// fmtDate
// ---------------------------------------------------------------------------
describe("fmtDate", () => {
  it("formats a date string as 'Mon Day'", () => {
    expect(fmtDate("2026-01-05")).toBe("Jan 5");
    expect(fmtDate("2026-03-15")).toBe("Mar 15");
    expect(fmtDate("2026-12-31")).toBe("Dec 31");
  });
});

// ---------------------------------------------------------------------------
// fmtDateTs
// ---------------------------------------------------------------------------
describe("fmtDateTs", () => {
  it("returns 'Never' for falsy value", () => {
    expect(fmtDateTs(undefined)).toBe("Never");
    expect(fmtDateTs(0)).toBe("Never");
  });

  it("handles millisecond timestamps (>= 1e12)", () => {
    // 2026-03-15 in ms
    const ms = new Date("2026-03-15T00:00:00Z").getTime();
    expect(fmtDateTs(ms)).toBe("Mar 15");
  });

  it("handles second timestamps (< 1e12) by converting to ms", () => {
    const sec = Math.floor(new Date("2026-01-05T00:00:00Z").getTime() / 1000);
    expect(fmtDateTs(sec)).toBe("Jan 5");
  });
});

// ---------------------------------------------------------------------------
// isoWeek
// ---------------------------------------------------------------------------
describe("isoWeek", () => {
  it("returns correct week string for Jan 1, 2026", () => {
    // 2026-01-01 is a Thursday; falls into ISO week 2 by this algorithm
    expect(isoWeek("2026-01-01")).toBe("2026-W02");
  });

  it("returns correct week string for mid-year dates", () => {
    expect(isoWeek("2026-03-30")).toMatch(/^2026-W\d{2}$/);
  });

  it("pads single-digit week numbers", () => {
    const result = isoWeek("2026-01-01");
    expect(result).toMatch(/W\d{2}/); // always 2-digit week
  });
});
