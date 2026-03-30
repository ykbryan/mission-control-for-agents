import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerGet, RouterError } from "@/lib/router-client";

// ---------------------------------------------------------------------------
// routerGet
// ---------------------------------------------------------------------------
describe("routerGet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the correct URL and sets Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await routerGet("http://router.local:3010", "my-token", "/agents");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://router.local:3010/agents");
    expect(opts.headers.Authorization).toBe("Bearer my-token");
  });

  it("appends query params when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    await routerGet("http://router.local:3010", "tok", "/session", {
      agentId: "jasmine",
      key: "agent:jasmine:main:123",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("agentId=jasmine");
    expect(url).toContain("key=agent%3Ajasmine%3Amain%3A123");
  });

  it("skips empty-string params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    await routerGet("http://router.local:3010", "tok", "/session", {
      agentId: "angel",
      key: "",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("agentId=angel");
    expect(url).not.toContain("key=");
  });

  it("returns parsed JSON on success", async () => {
    const payload = { agents: [{ id: "angel" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    }));

    const result = await routerGet<typeof payload>("http://router.local", "tok", "/agents");
    expect(result).toEqual(payload);
  });

  it("throws RouterError with status for non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("invalid token"),
    }));

    await expect(routerGet("http://router.local", "bad-token", "/agents"))
      .rejects.toThrow(RouterError);

    try {
      await routerGet("http://router.local", "bad-token", "/agents");
    } catch (err) {
      expect(err).toBeInstanceOf(RouterError);
      expect((err as RouterError).status).toBe(401);
    }
  });

  it("throws RouterError with 404 status for missing routes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve(""),
    }));

    await expect(routerGet("http://router.local", "tok", "/nonexistent"))
      .rejects.toThrow(RouterError);
  });

  it("propagates network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(routerGet("http://unreachable.local", "tok", "/agents"))
      .rejects.toThrow("Failed to fetch");
  });

  it("handles router URL with trailing slash correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    await routerGet("http://router.local:3010/", "tok", "/agents");
    const [url] = mockFetch.mock.calls[0];
    // Should not double-slash
    expect(url).not.toContain("//agents");
    expect(url).toContain("/agents");
  });
});
