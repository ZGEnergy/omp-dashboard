import { describe, it, expect } from "vitest";
import {
  hashKey,
  verifyKey,
  generateKey,
  findApiKey,
  recordKeyUsage,
  keyHasScope,
  type FindResult,
} from "../api-key-store.js";
import type { ProxyApiKey, ModelProxyConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

function makeConfig(apiKeys: ProxyApiKey[]): ModelProxyConfig {
  return {
    enabled: true,
    maxConcurrentStreams: 16,
    perKeyConcurrentStreams: 4,
    logRequests: false,
    apiKeys,
  };
}

function makeKey(overrides: Partial<ProxyApiKey> & { cleartext: string }): { entry: ProxyApiKey; cleartext: string } {
  const { cleartext, ...rest } = overrides;
  return {
    cleartext,
    entry: {
      id: "k1",
      label: "test",
      hash: hashKey(cleartext),
      createdAt: 1000,
      ...rest,
    },
  };
}

describe("hashKey / verifyKey", () => {
  it("hashKey produces consistent sha256 hex", () => {
    const h = hashKey("pi-proxy-abc123");
    expect(h).toHaveLength(64); // sha256 hex
    expect(h).toBe(hashKey("pi-proxy-abc123"));
  });

  it("verifyKey returns true for matching key", () => {
    const key = "pi-proxy-test";
    expect(verifyKey(key, hashKey(key))).toBe(true);
  });

  it("verifyKey returns false for wrong key", () => {
    expect(verifyKey("wrong", hashKey("right"))).toBe(false);
  });
});

describe("generateKey", () => {
  it("returns pi-proxy- prefixed key", () => {
    const key = generateKey();
    expect(key).toMatch(/^pi-proxy-[A-Za-z0-9_-]{48}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, generateKey));
    expect(keys.size).toBe(10);
  });
});

describe("findApiKey", () => {
  it("returns valid entry on match", () => {
    const { entry, cleartext } = makeKey({ cleartext: generateKey() });
    const config = makeConfig([entry]);
    const result = findApiKey(cleartext, config);
    expect(result.kind).toBe("valid");
    expect((result as Extract<FindResult, { kind: "valid" }>).entry.id).toBe("k1");
  });

  it("returns miss on no match", () => {
    const config = makeConfig([]);
    expect(findApiKey("pi-proxy-unknown", config).kind).toBe("miss");
  });

  it("returns revoked for revoked key", () => {
    const { entry, cleartext } = makeKey({ cleartext: generateKey(), revokedAt: Date.now() });
    const config = makeConfig([entry]);
    expect(findApiKey(cleartext, config).kind).toBe("revoked");
  });

  it("returns expired for expired key", () => {
    const { entry, cleartext } = makeKey({ cleartext: generateKey(), expiresAt: Date.now() - 1000 });
    const config = makeConfig([entry]);
    expect(findApiKey(cleartext, config).kind).toBe("expired");
  });

  it("returns valid for non-expired key", () => {
    const { entry, cleartext } = makeKey({ cleartext: generateKey(), expiresAt: Date.now() + 60_000 });
    const config = makeConfig([entry]);
    expect(findApiKey(cleartext, config).kind).toBe("valid");
  });
});

describe("recordKeyUsage", () => {
  it("updates lastUsedAt on first use", () => {
    const { entry } = makeKey({ cleartext: generateKey() });
    const now = Date.now();
    const { updated, apiKeys } = recordKeyUsage(entry.id, [entry], now);
    expect(updated).toBe(true);
    expect(apiKeys[0].lastUsedAt).toBe(now);
  });

  it("debounces within 60s", () => {
    const { entry } = makeKey({ cleartext: generateKey(), lastUsedAt: 1000 });
    const { updated } = recordKeyUsage(entry.id, [entry], 1000 + 30_000);
    expect(updated).toBe(false);
  });

  it("updates after debounce window", () => {
    const { entry } = makeKey({ cleartext: generateKey(), lastUsedAt: 1000 });
    const now = 1000 + 61_000;
    const { updated, apiKeys } = recordKeyUsage(entry.id, [entry], now);
    expect(updated).toBe(true);
    expect(apiKeys[0].lastUsedAt).toBe(now);
  });
});

describe("keyHasScope", () => {
  it("\"all\" matches any scope", () => {
    const { entry } = makeKey({ cleartext: generateKey(), scopes: ["all"] });
    expect(keyHasScope(entry, "models:list")).toBe(true);
    expect(keyHasScope(entry, "chat")).toBe(true);
    expect(keyHasScope(entry, "messages")).toBe(true);
  });

  it("specific scope matches only that scope", () => {
    const { entry } = makeKey({ cleartext: generateKey(), scopes: ["models:list"] });
    expect(keyHasScope(entry, "models:list")).toBe(true);
    expect(keyHasScope(entry, "chat")).toBe(false);
  });

  it("default scopes (undefined) acts as [\"all\"]", () => {
    const { entry } = makeKey({ cleartext: generateKey() });
    delete (entry as any).scopes;
    expect(keyHasScope(entry, "chat")).toBe(true);
  });
});
