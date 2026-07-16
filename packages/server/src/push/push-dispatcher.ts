/**
 * Push dispatcher — fans a notable session event out to registered devices.
 *
 * Contract (spec `Requirement: Fire-and-forget dispatch`):
 *   - `fanout(sessionId, event)` is `void`-returning and NEVER throws.
 *   - It must not be awaited at the call site; transport latency/failure must
 *     never block the WebSocket fan-out to connected browsers.
 *
 * Coalescing (spec `Requirement: Per-(session, device) coalescing`): at most
 * one delivery per (sessionId, deviceToken) per `coalesceWindowMs`. State is an
 * in-memory `Map<\`${sessionId}::${tokenId}\`, lastSentAt>` with lazy expiry
 * (entries older than `2 × coalesceWindowMs` dropped on read).
 *
 * Dead tokens (Web Push `410`, FCM `NOT_FOUND`) are pruned via the registry;
 * successful sends `touch` the token. Individual failures are swallowed +
 * logged with a `[push-dispatcher]` prefix.
 * See change: add-server-push-notifications.
 */
import type { DashboardEvent, DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { buildPushPayload } from "./build-push-payload.js";
import type { PushToken, PushTokenRegistry } from "./push-token-registry.js";
import type { PushTransport, PushTransportKind } from "./push-transports/types.js";

export interface PushDispatcher {
  fanout(sessionId: string, event: DashboardEvent): void;
  /** Enable/disable delivery without rebuilding event wiring or transports. */
  setEnabled(enabled: boolean): void;
  /** Replace coalescing window and discard state from the previous window. */
  setCoalesceWindowMs(coalesceWindowMs: number): void;
  shutdown(): void;
}

export interface PushDispatcherOptions {
  registry: PushTokenRegistry;
  /** Transports keyed by `PushTransportKind`. A missing kind is skipped + warned. */
  transports: Partial<Record<PushTransportKind, PushTransport>>;
  coalesceWindowMs: number;
  /** Master delivery gate. Defaults to `true` for backwards-compatible unit use. */
  enabled?: boolean;
  /** Resolve a session for payload composition. Returns undefined if gone. */
  getSession: (sessionId: string) => DashboardSession | undefined;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

export function createPushDispatcher(opts: PushDispatcherOptions): PushDispatcher {
  const { registry, transports, getSession } = opts;
  const now = opts.now ?? Date.now;
  let enabled = opts.enabled ?? true;
  let coalesceWindowMs = opts.coalesceWindowMs;

  // `${sessionId}::${tokenId}` → lastSentAt (ms).
  const lastSent = new Map<string, number>();
  let expiryMs = 2 * coalesceWindowMs;

  function pruneExpired(current: number): void {
    for (const [key, ts] of lastSent) {
      if (current - ts > expiryMs) lastSent.delete(key);
    }
  }

  function matchesSession(token: PushToken, sessionId: string): boolean {
    if (!token.sessionFilter || token.sessionFilter.length === 0) return true;
    return token.sessionFilter.includes(sessionId);
  }

  async function deliver(token: PushToken, sessionId: string, event: DashboardEvent): Promise<void> {
    const transport = transports[token.transport];
    if (!transport) {
      console.warn(`[push-dispatcher] no transport for kind "${token.transport}" (token ${token.id}) — skipping`);
      return;
    }
    const session = getSession(sessionId);
    if (!session) return;
    const payload = buildPushPayload(session, event);
    try {
      const result = await transport.send(token, payload);
      if (result.gone) {
        registry.remove(token.id);
      } else if (result.ok) {
        registry.touch(token.id);
      }
    } catch (err) {
      console.error(`[push-dispatcher] send threw for token ${token.id}:`, err);
    }
  }

  return {
    fanout(sessionId: string, event: DashboardEvent): void {
      try {
        if (!enabled) return;
        const current = now();
        pruneExpired(current);

        const targets: PushToken[] = [];
        for (const token of registry.list()) {
          if (!matchesSession(token, sessionId)) continue;
          const key = `${sessionId}::${token.id}`;
          const last = lastSent.get(key);
          if (last !== undefined && current - last < coalesceWindowMs) continue; // coalesced
          // Stamp on ATTEMPT (before the async `deliver` resolves), not on
          // success. A failed send therefore still suppresses the next trigger
          // for the whole coalesceWindowMs. Intentional: v1 has no retry, so a
          // missing post-failure push is expected — not a bug.
          lastSent.set(key, current);
          targets.push(token);
        }

        if (targets.length === 0) return;

        // Fire-and-forget: never awaited by the caller. Individual failures are
        // isolated by allSettled and additionally guarded inside `deliver`.
        void Promise.allSettled(targets.map((token) => deliver(token, sessionId, event)));
      } catch (err) {
        // Absolute backstop: fanout must never throw into the event pipeline.
        console.error("[push-dispatcher] fanout error:", err);
      }
    },

    setEnabled(nextEnabled: boolean): void {
      if (enabled === nextEnabled) return;
      enabled = nextEnabled;
      // A disabled period must not leave stale coalescing state that suppresses
      // the first notification after re-enable.
      lastSent.clear();
    },

    setCoalesceWindowMs(nextWindowMs: number): void {
      if (coalesceWindowMs === nextWindowMs) return;
      coalesceWindowMs = nextWindowMs;
      expiryMs = 2 * nextWindowMs;
      // Entries were stamped under a different window; drop them instead of
      // applying the old window to new settings.
      lastSent.clear();
    },

    shutdown(): void {
      enabled = false;
      lastSent.clear();
    },
  };
}
