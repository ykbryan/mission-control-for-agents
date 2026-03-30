import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSessionKey } from "@/lib/parse-session";

const GATEWAY_URL = "http://gateway.local:4000";
const GATEWAY_TOKEN = "test-token-abc";
const AGENT_ID = "angel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchMock(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok: true, // fetch response is always ok; data.ok controls business logic
    json: () => Promise.resolve(data),
  });
}

function makeSessionsResponse(
  sessions: Array<{ key: string; updatedAt?: number }>,
  dataOk = true
) {
  return {
    ok: dataOk,
    result: {
      content: [
        {
          text: JSON.stringify({ sessions }),
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchSessionKey", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the most recent matching session key", async () => {
    const sessions = [
      { key: `agent:${AGENT_ID}:main:old`, updatedAt: 1000 },
      { key: `agent:${AGENT_ID}:main:recent`, updatedAt: 3000 },
      { key: `agent:${AGENT_ID}:main:middle`, updatedAt: 2000 },
    ];
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse(sessions)));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBe(`agent:${AGENT_ID}:main:recent`);
  });

  it("returns null when data.ok is false", async () => {
    const sessions = [{ key: `agent:${AGENT_ID}:main:123`, updatedAt: 1000 }];
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse(sessions, false)));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("returns null when sessions array is empty", async () => {
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse([])));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("returns null when no session key matches the agentId", async () => {
    const sessions = [
      { key: "agent:other-agent:main:111", updatedAt: 9999 },
      { key: "agent:another:main:222", updatedAt: 8888 },
    ];
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse(sessions)));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("does not return a session whose key prefix is a superstring of agentId", async () => {
    // "angel-extra" should not match agentId "angel"
    const sessions = [
      { key: `agent:${AGENT_ID}-extra:main:999`, updatedAt: 9999 },
    ];
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse(sessions)));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("sorts by updatedAt descending and picks most recent", async () => {
    const sessions = [
      { key: `agent:${AGENT_ID}:session:z`, updatedAt: 100 },
      { key: `agent:${AGENT_ID}:session:a`, updatedAt: 999 },
      { key: `agent:${AGENT_ID}:session:m`, updatedAt: 500 },
    ];
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse(sessions)));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBe(`agent:${AGENT_ID}:session:a`);
  });

  it("returns null when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failure")));

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("returns null when response.json() throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError("unexpected token")),
      })
    );

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("returns null when the text content is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: { content: [{ text: "<<not json>>" }] },
          }),
      })
    );

    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBeNull();
  });

  it("sends a POST request to the correct URL", async () => {
    const mockFetch = makeFetchMock(makeSessionsResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${GATEWAY_URL}/tools/invoke`);
    expect(opts.method).toBe("POST");
  });

  it("sets the correct Authorization header", async () => {
    const mockFetch = makeFetchMock(makeSessionsResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe(`Bearer ${GATEWAY_TOKEN}`);
  });

  it("sends sessions_list tool invocation in the request body", async () => {
    const mockFetch = makeFetchMock(makeSessionsResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.tool).toBe("sessions_list");
    expect(body.args.limit).toBe(500);
  });

  it("handles sessions missing updatedAt by treating them as 0", async () => {
    const sessions = [
      { key: `agent:${AGENT_ID}:main:no-ts` },
      { key: `agent:${AGENT_ID}:main:with-ts`, updatedAt: 1 },
    ];
    vi.stubGlobal("fetch", makeFetchMock(makeSessionsResponse(sessions)));

    // Should still return a key (the one with updatedAt=1 wins over undefined→0)
    const result = await fetchSessionKey(GATEWAY_URL, GATEWAY_TOKEN, AGENT_ID);
    expect(result).toBe(`agent:${AGENT_ID}:main:with-ts`);
  });
});
