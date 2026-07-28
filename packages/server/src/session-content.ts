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
 * This splits the two cases. Only four `DashboardSession` fields are consulted,
 * all of which are O(1), synchronous (safe inside a preflight), reachable from
 * BOTH the WS handler and the REST `/api/session/:id/resume` path (whose
 * `SessionApiDeps` has no `eventStore`), and restored across a dashboard
 * restart (`memory-session-manager.ts` carries the token counters through
 * re-register; `session-bootstrap.ts` restores `contextTokens` + `firstMessage`
 * from `extractSessionStats`):
 *
 *   - `tokensIn` / `tokensOut` — non-zero once any turn has completed.
 *   - `contextTokens`         — non-zero once the model has any context.
 *   - `firstMessage`          — set once the user has said anything at all.
 *
 * A freshly-spawned session with no turn yet has all four empty, so it still
 * takes the degrade branch and the watchdog fix is preserved.
 *
 * See change: fork-action-opens-an-empty-chat (issue #107).
 */
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

export type ForkableContentFields = Pick<
  DashboardSession,
  "tokensIn" | "tokensOut" | "contextTokens" | "firstMessage"
>;

/**
 * True when the session holds conversation worth forking. A missing on-disk
 * JSONL for such a session is a real failure, not an empty session.
 */
export function sessionHasForkableContent(s: ForkableContentFields): boolean {
  return (
    (s.tokensIn ?? 0) > 0
    || (s.tokensOut ?? 0) > 0
    || (s.contextTokens ?? 0) > 0
    || !!s.firstMessage?.trim()
  );
}
