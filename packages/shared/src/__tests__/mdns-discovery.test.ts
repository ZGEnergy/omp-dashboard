import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import { isLocalService, type DiscoveredServer } from "../mdns-discovery.js";

// Test isLocalService with mock Service objects
describe("isLocalService", () => {
  it("returns true for localhost host", () => {
    const service = { host: "localhost", port: 8000, addresses: [] } as any;
    expect(isLocalService(service)).toBe(true);
  });

  it("returns true for matching hostname", () => {
    const hostname = os.hostname();
    const service = { host: hostname, port: 8000, addresses: [] } as any;
    expect(isLocalService(service)).toBe(true);
  });

  it("returns true for hostname.local", () => {
    const hostname = os.hostname();
    const service = { host: `${hostname}.local`, port: 8000, addresses: [] } as any;
    expect(isLocalService(service)).toBe(true);
  });

  it("returns true when service address matches 127.0.0.1", () => {
    const service = { host: "some-host", port: 8000, addresses: ["127.0.0.1"] } as any;
    expect(isLocalService(service)).toBe(true);
  });

  it("returns true when service address matches ::1", () => {
    const service = { host: "some-host", port: 8000, addresses: ["::1"] } as any;
    expect(isLocalService(service)).toBe(true);
  });

  it("returns false for remote host with different addresses", () => {
    const service = { host: "other-machine.local", port: 8000, addresses: ["10.99.99.99"] } as any;
    expect(isLocalService(service)).toBe(false);
  });
});

describe("discoverFallback", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null when health check finds non-dashboard service", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "nginx" }),
    });

    const { discoverFallback } = await import("../mdns-discovery.js");
    const result = await discoverFallback(9999);
    expect(result).toBeNull();
  });

  it("returns server when health check succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, pid: 1234 }),
    });

    const { discoverFallback } = await import("../mdns-discovery.js");
    const result = await discoverFallback(8000);
    expect(result).not.toBeNull();
    expect(result!.host).toBe("localhost");
    expect(result!.port).toBe(8000);
    expect(result!.pid).toBe(1234);
    expect(result!.source).toBe("fallback");
  });

  it("returns null when nothing is running", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { discoverFallback } = await import("../mdns-discovery.js");
    const result = await discoverFallback(9999);
    expect(result).toBeNull();
  });
});
