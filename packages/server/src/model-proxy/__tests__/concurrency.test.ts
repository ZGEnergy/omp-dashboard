import { describe, it, expect } from "vitest";
import { ConcurrencyTracker, ConcurrencyError } from "../concurrency.js";
import type { ModelProxyConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

function makeConfig(overrides?: Partial<ModelProxyConfig>): ModelProxyConfig {
  return {
    enabled: true,
    maxConcurrentStreams: 2,
    perKeyConcurrentStreams: 1,
    logRequests: false,
    apiKeys: [],
    ...overrides,
  };
}

describe("ConcurrencyTracker", () => {
  it("acquires and releases normally", () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig();
    const release = t.acquire({ apiKeyId: "k1", provider: "openai" }, config);
    expect(typeof release).toBe("function");
    release();
  });

  it("server cap exhausts → SERVER_FULL", () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig({ maxConcurrentStreams: 2, perKeyConcurrentStreams: 10 });
    t.acquire({ apiKeyId: "k1", provider: "a" }, config);
    t.acquire({ apiKeyId: "k2", provider: "b" }, config);
    expect(() => t.acquire({ apiKeyId: "k3", provider: "c" }, config)).toThrow(ConcurrencyError);
    try {
      t.acquire({ apiKeyId: "k3", provider: "c" }, config);
    } catch (e) {
      expect((e as ConcurrencyError).code).toBe("SERVER_FULL");
    }
  });

  it("per-key cap exhausts → KEY_FULL", () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig({ maxConcurrentStreams: 10, perKeyConcurrentStreams: 1 });
    t.acquire({ apiKeyId: "k1", provider: "a" }, config);
    expect(() => t.acquire({ apiKeyId: "k1", provider: "b" }, config)).toThrow(ConcurrencyError);
    try {
      t.acquire({ apiKeyId: "k1", provider: "b" }, config);
    } catch (e) {
      expect((e as ConcurrencyError).code).toBe("KEY_FULL");
    }
  });

  it("per-provider cap exhausts → PROVIDER_FULL", () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig({
      maxConcurrentStreams: 10,
      perKeyConcurrentStreams: 10,
      perProviderCaps: { openai: 1 },
    });
    t.acquire({ apiKeyId: "k1", provider: "openai" }, config);
    expect(() => t.acquire({ apiKeyId: "k2", provider: "openai" }, config)).toThrow(ConcurrencyError);
    try {
      t.acquire({ apiKeyId: "k2", provider: "openai" }, config);
    } catch (e) {
      expect((e as ConcurrencyError).code).toBe("PROVIDER_FULL");
    }
  });

  it("release decrements all counters", () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig({ maxConcurrentStreams: 1, perKeyConcurrentStreams: 1 });
    const release = t.acquire({ apiKeyId: "k1", provider: "a" }, config);
    release();
    // Should be able to acquire again
    const release2 = t.acquire({ apiKeyId: "k1", provider: "a" }, config);
    release2();
  });

  it("double release is safe", () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig();
    const release = t.acquire({ apiKeyId: "k1", provider: "a" }, config);
    release();
    release(); // no-op
  });

  it("concurrent acquire/release under Promise.all", async () => {
    const t = new ConcurrencyTracker();
    const config = makeConfig({ maxConcurrentStreams: 100, perKeyConcurrentStreams: 100, perProviderCaps: { a: 100 } });
    const releases: (() => void)[] = [];

    // Acquire many concurrently
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => {
        return new Promise<void>((resolve) => {
          const release = t.acquire({ apiKeyId: `k${i}`, provider: "a" }, config);
          releases.push(release);
          resolve();
        });
      }),
    );

    // Release all
    releases.forEach((r) => r());

    // Should be able to acquire again
    const release = t.acquire({ apiKeyId: "k0", provider: "a" }, config);
    release();
  });
});
