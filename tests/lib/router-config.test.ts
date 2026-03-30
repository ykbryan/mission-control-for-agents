import { describe, it, expect } from "vitest";
import {
  parseRouters,
  stringifyRouters,
  resolveRouter,
  type RouterConfig,
} from "@/lib/router-config";

const ROUTER_A: RouterConfig = { id: "aaa-111", url: "http://router-a.local:3010", token: "tok-a", label: "Router A" };
const ROUTER_B: RouterConfig = { id: "bbb-222", url: "http://router-b.local:3010", token: "tok-b", label: "Router B" };

// ---------------------------------------------------------------------------
// parseRouters
// ---------------------------------------------------------------------------
describe("parseRouters", () => {
  it("returns [] for undefined", () => {
    expect(parseRouters(undefined)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseRouters("")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseRouters("not-json")).toEqual([]);
    expect(parseRouters("%ZZinvalid")).toEqual([]);
  });

  it("parses a valid encoded routers array", () => {
    const cookie = stringifyRouters([ROUTER_A, ROUTER_B]);
    const result = parseRouters(cookie);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("aaa-111");
    expect(result[1].label).toBe("Router B");
  });

  it("filters out entries missing required fields", () => {
    const incomplete = [
      { id: "x", url: "http://x.com" },          // missing token
      { url: "http://y.com", token: "t" },         // missing id
      { id: "z", token: "t" },                     // missing url
      ROUTER_A,                                    // valid
    ];
    const cookie = encodeURIComponent(JSON.stringify(incomplete));
    const result = parseRouters(cookie);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("aaa-111");
  });

  it("returns [] for a non-array JSON value", () => {
    const cookie = encodeURIComponent(JSON.stringify({ foo: "bar" }));
    expect(parseRouters(cookie)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// stringifyRouters
// ---------------------------------------------------------------------------
describe("stringifyRouters", () => {
  it("produces a string that parseRouters can round-trip", () => {
    const routers = [ROUTER_A, ROUTER_B];
    const encoded = stringifyRouters(routers);
    expect(typeof encoded).toBe("string");
    expect(parseRouters(encoded)).toEqual(routers);
  });

  it("handles an empty array", () => {
    const encoded = stringifyRouters([]);
    expect(parseRouters(encoded)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveRouter
// ---------------------------------------------------------------------------
describe("resolveRouter", () => {
  const routers = [ROUTER_A, ROUTER_B];

  it('returns the first router for routerId "legacy"', () => {
    const result = resolveRouter(routers, "legacy");
    expect(result).toEqual({ url: ROUTER_A.url, token: ROUTER_A.token });
  });

  it("returns the matched router by exact UUID", () => {
    const result = resolveRouter(routers, "bbb-222");
    expect(result).toEqual({ url: ROUTER_B.url, token: ROUTER_B.token });
  });

  it("returns null for an unknown UUID (no silent cross-router fallback)", () => {
    expect(resolveRouter(routers, "unknown-uuid")).toBeNull();
  });

  it("falls back to legacy cookie when routers array is empty", () => {
    const result = resolveRouter([], "anything", "http://legacy.local", "legacy-tok");
    expect(result).toEqual({ url: "http://legacy.local", token: "legacy-tok" });
  });

  it("returns null when routers empty and no legacy cookie", () => {
    expect(resolveRouter([], "anything")).toBeNull();
  });

  it('returns first router for "legacy" even with many routers', () => {
    const many = [ROUTER_A, ROUTER_B, { id: "ccc-333", url: "http://c.local", token: "t-c", label: "C" }];
    const result = resolveRouter(many, "legacy");
    expect(result!.url).toBe(ROUTER_A.url);
  });
});
