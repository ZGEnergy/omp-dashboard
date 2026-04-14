import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isDashboardRunning } from "../lib/health-check.js";

describe("isDashboardRunning", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns running when server responds with ok: true and pid", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, pid: 12345, uptime: 100 }),
    });
    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: true, pid: 12345, version: undefined });
  });

  it("returns version when server includes it in health response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, pid: 12345, version: "0.2.0" }),
    });
    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: true, pid: 12345, version: "0.2.0" });
  });

  it("returns undefined version when server does not include it", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, pid: 99 }),
    });
    const result = await isDashboardRunning(8000);
    expect(result.running).toBe(true);
    expect(result.version).toBeUndefined();
  });

  it("returns portConflict when server responds with non-dashboard format", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }), // not our format
    });
    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false, portConflict: true });
  });

  it("returns portConflict when server responds with non-ok status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
    });
    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false, portConflict: true });
  });

  it("returns not running on ECONNREFUSED", async () => {
    const err = new Error("fetch failed");
    (err as any).cause = { code: "ECONNREFUSED" };
    globalThis.fetch = vi.fn().mockRejectedValue(err);
    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false });
  });

  it("returns not running on timeout/network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("aborted"));
    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false });
  });
});
