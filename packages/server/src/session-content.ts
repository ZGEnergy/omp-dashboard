/**
 * Fork preflight content predicate.
 *
 * The fork degrade branch (`fix-fork-empty-session-silent-timeout`) exists so
 * forking a freshly-spawned, never-used session does not hand `pi --fork` a
 * path that is not on disk yet and hang for 30 s on the spawn-register
 * watchdog. Its original predicate was `!existsSync(sessionFile)` alone, which
 * also swallowed content-rich sessions whose JSONL had been rotated or removed
 * by pi — those silently opened a blank chat (issue #107).
 *
 * This splits the two cases. Every input is O(1) and synchronous (safe inside a
 * preflight), and both the WS handler and the REST `/api/session/:id/resume`
 * path supply the same ones, so the two classify identically.
 *
 * Durability of each marker — the reason the event-store backstop exists:
 *
 *   - `firstMessage` — set from the bridge's `session_register` payload
 *     (`extractFirstMessage`), carried through re-register by
 *     `memory-session-manager.ts` and persisted by `sessionToMeta`. The only
 *     marker that genuinely survives reattach and restart. Requires a bridge
 *     new enough to send it (`npm run reload` after change:
 *     fork-content-predicate; older bridges send `undefined`).
 *   - `tokensIn` / `tokensOut` / `contextTokens` — RESET TO 0/null on EVERY
 *     bridge registration by `event-wiring.ts` and then written through to
 *     `.meta.json`. Nothing rebuilds them until the session completes a NEW
 *     turn (bridge replay emits no `turn_end`). They must never be relied on
 *     alone for a reattached session.
 *   - `hasConversationEvents` — the bridge-version-independent backstop. The
 *     event store is repopulated by the bridge's full replay on every reattach,
 *     so a session with real history reports true even when its `.jsonl` is
 *     gone and its counters were just zeroed. Narrowed to conversation event
 *     types so register-time plugin chatter (`flow:list-flows` at seq=1) does
 *     not certify a fresh session.
 *
 * A freshly-spawned session has all of them empty, so it still takes the
 * degrade branch and the watchdog fix is preserved.
 *
 * See change: fork-action-opens-an-empty-chat (issue #107),
 * fork-content-predicate.
 */
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

export type ForkableContentFields = Pick<
  DashboardSession,
  "tokensIn" | "tokensOut" | "contextTokens" | "firstMessage"
>;

/**
 * True when the session holds conversation worth forking. A missing on-disk
 * JSONL for such a session is a real failure, not an empty session.
 *
 * `hasConversationEvents` is the event-store backstop (see module doc); callers
 * without an event store pass `false` and fall back to the session fields.
 */
export function sessionHasForkableContent(
  s: ForkableContentFields,
  hasConversationEvents = false,
): boolean {
  return (
    (s.tokensIn ?? 0) > 0
    || (s.tokensOut ?? 0) > 0
    || (s.contextTokens ?? 0) > 0
    || !!s.firstMessage?.trim()
    || hasConversationEvents
  );
}
