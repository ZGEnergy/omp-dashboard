/**
 * In-memory cache of provider catalogues pushed by bridges.
 *
 * Each pi process pushes a `providers_list` over WS, derived from its
 * `ModelRegistry`. The server caches per-session and tracks the most-recent
 * snapshot. `GET /api/provider-auth/status` reads `getLatestCatalogue()`.
 *
 * See change: replace-hardcoded-provider-lists.
 */
import type { ProviderInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";

const bySession = new Map<string, ProviderInfo[]>();
let latest: ProviderInfo[] | null = null;

export function setCatalogueForSession(sessionId: string, providers: ProviderInfo[]): void {
  bySession.set(sessionId, providers);
  latest = providers;
}

export function getCatalogueForSession(sessionId: string): ProviderInfo[] | undefined {
  return bySession.get(sessionId);
}

/**
 * Most recent catalogue across any session. Returns [] when no bridge
 * has pushed yet — callers should treat that as "waiting for pi".
 */
export function getLatestCatalogue(): ProviderInfo[] {
  return latest ?? [];
}

export function clearForSession(sessionId: string): void {
  bySession.delete(sessionId);
  if (bySession.size === 0) latest = null;
}

/** Test-only: reset all cached state. */
export function _resetForTests(): void {
  bySession.clear();
  latest = null;
}
