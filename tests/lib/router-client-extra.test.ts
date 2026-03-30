import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerGet, RouterError } from "@/lib/router-client";

// ---------------------------------------------------------------------------
// RouterError class
// ---------------------------------------------------------------------------
describe("RouterError", () => {
  it("is an instance of Error", () => {
    const err = new RouterError("something failed", 503);
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of RouterError", () => {
    const err = new RouterError("something failed", 503);
    expect(err).toBeInstanceOf(RouterError);
  });

  it("exposes the status code", () => {
    const err = new RouterError("bad gateway", 502);
    expect(err.status).toBe(502);
  });

  it("exposes the message via .message", () => {
    const err = new RouterError("custom error text", 500);
    expect(err.message).toBe("custom error text");
  });

  it("has the correct name property inherited from Error", () => {
    const err = new RouterError("test", 400);
    // RouterError does not override `name`, so it inherits "Error"
    expect(err.name).toBe("Error");
  });
});

// ---------------------------------------------------------------------------
// routerGet — res.text() throws edge case
// ---------------------------------------------------------------------------
describe("routerGet — res.text() throws", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("still throws RouterError when res.text() itself throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        // text() rejects — the .catch(() => "") in routerGet swallows it
        text: () => Promise.reject(new Error("stream destroyed")),
      })
    );

    await expect(
      routerGet("http://router.local", "tok", "/path")
    ).rejects.toBeInstanceOf(RouterError);
  });

  it("throws RouterError with empty body when res.text() throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.reject(new Error("stream destroyed")),
      })
    );

    let caught: RouterError | undefined;
    try {
      await routerGet("http://router.local", "tok", "/path");
    } catch (err) {
      caught = err as RouterError;
    }

    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(RouterError);
    expect(caught!.status).toBe(500);
    // When text() fails and body is empty, falls back to statusText in the message
    expect(caught!.message).toContain("500");
  });

  it("RouterError message uses statusText as fallback when body is empty string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: () => Promise.reject(new Error("read failed")),
      })
    );

    let caught: RouterError | undefined;
    try {
      await routerGet("http://router.local", "tok", "/health");
    } catch (err) {
      caught = err as RouterError;
    }

    expect(caught).toBeInstanceOf(RouterError);
    expect(caught!.status).toBe(503);
    // body is "" (from .catch(() => "")), so statusText is used
    expect(caught!.message).toContain("Service Unavailable");
  });
});
