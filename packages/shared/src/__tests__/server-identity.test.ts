import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isDashboardRunning } from "../server-identity.js";

describe("isDashboardRunning", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns running: true with pid when health endpoint responds correctly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, pid: 12345, uptime: 60 }),
    });

    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: true, pid: 12345 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns portConflict when port returns non-ok HTTP status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false, portConflict: true });
  });

  it("returns portConflict when response is HTTP 200 but not dashboard format", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", service: "nginx" }),
    });

    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false, portConflict: true });
  });

  it("returns running: false when connection refused (nothing running)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false });
  });

  it("returns running: false when request times out", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await isDashboardRunning(8000);
    expect(result).toEqual({ running: false });
  });

  it("uses custom host when provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, pid: 999 }),
    });

    await isDashboardRunning(8000, "192.168.1.10");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://192.168.1.10:8000/api/health",
      expect.any(Object),
    );
  });
});
