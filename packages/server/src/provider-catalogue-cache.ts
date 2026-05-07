/**
 * In-memory cache of provider catalogues pushed by bridges.
 *
 * Each pi process pushes a `providers_list` over WS, derived from its
 * `ModelRegistry`. The server caches per-session and tracks the most-recent
 * snapshot. `GET /api/provider-auth/status` reads `getLatestCatalogue()`.
 *
 * See changes: replace-hardcoded-provider-lists,
 *              fix-providers-list-spurious-models-refreshed.
 */
import type { ProviderInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";

const bySession = new Map<string, ProviderInfo[]>();
let latest: ProviderInfo[] | null = null;

/**
 * Pure deep-equality check for two ProviderInfo arrays. Order-sensitive
 * (matches the bridge's deterministic catalogue construction). Avoids
 * JSON.stringify pitfalls (different key orderings on objects with the
 * same content would give false negatives) by walking the structure.
 */
function catalogueEqual(a: ProviderInfo[] | undefined, b: ProviderInfo[]): boolean {
  if (!a) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id) return false;
    if (x.displayName !== y.displayName) return false;
    if (x.hasOAuth !== y.hasOAuth) return false;
    if (x.configured !== y.configured) return false;
    if (x.source !== y.source) return false;
    if (x.envVar !== y.envVar) return false;
    if (x.ambient !== y.ambient) return false;
    if (x.expires !== y.expires) return false;
    if (x.custom !== y.custom) return false;
  }
  return true;
}

/**
 * Replace the cached catalogue for `sessionId`. Returns `{ changed: true }`
 * iff the new payload differs from what was previously cached for this
 * session — the only signal callers (event-wiring.ts) should use to decide
 * whether to broadcast `models_refreshed` to browsers. A routine bridge
 * state-sync re-sends identical content; broadcasting on identical content
 * causes a global `modelsMap` wipe at every browser, which interacts badly
 * with the auto-subscribe gate in App.tsx (subscribedRef short-circuits
 * re-requests after the first visit), leaving previously-visited sessions
 * with an empty model selector. See change:
 * fix-providers-list-spurious-models-refreshed.
 */
export function setCatalogueForSession(
  sessionId: string,
  providers: ProviderInfo[],
): { changed: boolean } {
  const prev = bySession.get(sessionId);
  const changed = !catalogueEqual(prev, providers);
  bySession.set(sessionId, providers);
  if (changed) latest = providers;
  return { changed };
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
