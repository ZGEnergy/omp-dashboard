/**
 * Pure helpers for proxy API key management: hash, verify, generate, lookup.
 *
 * Keys use the format `pi-proxy-<48 base64url chars>` (288 bits of entropy).
 * Storage uses sha256 hex hashes — cleartext is never persisted.
 *
 * See change: add-dashboard-model-proxy.
 */
import crypto from "node:crypto";
import type { ProxyApiKey, ModelProxyConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

// ── Core helpers ────────────────────────────────────────────────────────────

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function verifyKey(key: string, hash: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(hashKey(key), "hex"),
    Buffer.from(hash, "hex"),
  );
}

export function generateKey(): string {
  const bytes = crypto.randomBytes(36); // 36 bytes → 48 base64url chars
  return `pi-proxy-${bytes.toString("base64url")}`;
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

export type FindResult =
  | { kind: "valid"; entry: ProxyApiKey }
  | { kind: "revoked" }
  | { kind: "expired" }
  | { kind: "miss" };

/**
 * Look up an API key in the config. Returns discriminated result.
 * Checks revoked/expired status before returning valid.
 */
export function findApiKey(token: string, config: ModelProxyConfig): FindResult {
  const tokenHash = hashKey(token);
  for (const entry of config.apiKeys) {
    if (entry.hash !== tokenHash) continue;
    // Constant-time verify to prevent timing attacks
    if (!verifyKey(token, entry.hash)) continue;
    if (entry.revokedAt != null) return { kind: "revoked" };
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) return { kind: "expired" };
    return { kind: "valid", entry };
  }
  return { kind: "miss" };
}

/** Debounce window for lastUsedAt updates (60s). */
const LAST_USED_DEBOUNCE_MS = 60_000;

/**
 * Update lastUsedAt on a key entry. Returns mutated apiKeys array (caller persists).
 * Debounces: skips update if last use was within 60s.
 */
export function recordKeyUsage(
  id: string,
  apiKeys: ProxyApiKey[],
  now = Date.now(),
): { updated: boolean; apiKeys: ProxyApiKey[] } {
  const result = apiKeys.map((k) => {
    if (k.id !== id) return k;
    if (k.lastUsedAt && now - k.lastUsedAt < LAST_USED_DEBOUNCE_MS) return k;
    return { ...k, lastUsedAt: now };
  });
  const changed = result.some((k, i) => k !== apiKeys[i]);
  return { updated: changed, apiKeys: result };
}

// ── Scope helpers ───────────────────────────────────────────────────────────

export type ProxyScope = "models:list" | "chat" | "messages";

/**
 * Check if a key entry has the required scope.
 * `"all"` in scopes matches any required scope.
 */
export function keyHasScope(entry: ProxyApiKey, requiredScope: ProxyScope): boolean {
  const scopes = entry.scopes ?? ["all"];
  return scopes.includes("all") || scopes.includes(requiredScope);
}
