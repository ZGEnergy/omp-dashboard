/**
 * Redaction for secret-bearing OMP settings exposed over `/api/omp-config`.
 *
 * Wire values never leave the server. Clients write a new secret or send the
 * unchanged sentinel so an empty password field does not wipe storage.
 */

import type { OmpConfigEntry } from "./omp-config-cli.js";

/** Client → server: keep the stored secret as-is. */
export const OMP_SECRET_UNCHANGED = "__omp_secret_unchanged__";

/**
 * Leaf-name heuristic: credential-like leaves only.
 * Excludes token *counts/limits* (`reserveTokens`, `*TokenLimit`, …).
 */
const SECRET_LEAF =
  /^(token|apiToken|apiKey|password|secret|credential|basicPassword|embeddingApiKey|llmApiKey)$/i;

export function isOmpSecretKey(key: string): boolean {
  const leaf = key.split(".").pop() ?? key;
  return SECRET_LEAF.test(leaf);
}

function hasStoredSecret(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

/** Strip secret payloads from a single entry for HTTP responses. */
export function redactOmpConfigEntry(entry: OmpConfigEntry): OmpConfigEntry {
  if (!isOmpSecretKey(entry.key)) return entry;
  const present = hasStoredSecret(entry.value);
  return {
    ...entry,
    value: present ? null : entry.value == null ? undefined : null,
    ...(present ? { redacted: true } : {}),
  };
}

export function redactOmpConfigMap(
  settings: Record<string, OmpConfigEntry>,
): Record<string, OmpConfigEntry> {
  const out: Record<string, OmpConfigEntry> = {};
  for (const [key, entry] of Object.entries(settings)) {
    out[key] = redactOmpConfigEntry(entry);
  }
  return out;
}

export function isSecretUnchangedSentinel(value: unknown): boolean {
  return value === OMP_SECRET_UNCHANGED;
}
