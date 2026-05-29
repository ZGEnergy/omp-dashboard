## Why

The dashboard renders two separate banners for closely-related session states — a yellow `RetryBanner` driven by `retryState`, and a red error banner driven by `lastError`. They can briefly overlap (yellow + red simultaneously) when ordering races slip past the reducer's defensive guard, and they obscure rather than clarify the failure category. Worse, the system silently swallows terminal billing/quota errors (`usage_limit_reached`, `quota_exceeded`, `monthly_spending_cap`) in two compounding ways: (1) the bridge's wrapper-abort calls `usageLimitOrderer.noteRetryEnd(sessionId)` BEFORE pi's terminal `agent_end` arrives, disqualifying the orderer's synth path; (2) the command-handler's hardcoded `finalError: "Aborted by user"` placeholder overwrites whatever `retryState.reason` was carrying. The user clicks Stop on a rate-limit retry, gets `"Aborted by user"`, never learns it was actually a billing cap.

Two adjacent abort-flow bugs share the same code surface and should be fixed together: (a) the persistent-abort scheduler re-invokes the **whole** bridge abort wrapper every 200 ms for 2 s — the spec wording in `provider-retry-state` says it should re-invoke `cachedCtx.abort()` only, but the impl calls `opts.abort()`, which re-clears pi's queues + bridge shadows on every tick and kills any user re-send that lands during the window; (b) `rewriteFollowupQueue` has no `isAgentStreaming` guard, so an edit/promote/remove on an idle pi causes the first `pi.sendUserMessage(_, {deliverAs:"followUp"})` to fire `agent_start` and refire the agent.

## What Changes

### Unified status banner

- **NEW**: single `SessionBanner` component with three variants — `retrying` (yellow), `error` (red), `limit-exceeded` (red, separate iconography + copy). Selector derives variant from `(retryState, lastError)` so only one banner can be visible at any time. **BREAKING** for any code referencing `RetryBanner` by name.
- **BREAKING**: delete `packages/client/src/components/RetryBanner.tsx`. Delete the inline `lastError` red-banner block in `ChatView.tsx`.
- **NEW**: banner mounts **sticky above the command input** (App-level, not scrolled with chat). Retains the existing `RetryBanner` Stop button for the `retrying` variant; `error` and `limit-exceeded` variants surface `Retry` and `Dismiss` (terminal limit also gets a "Session stopped automatically." hint).
- **MOVED**: `USAGE_LIMIT_PATTERN` regex from `packages/extension/src/usage-limit-orderer.ts` to a new `packages/shared/src/error-patterns.ts` so the client reducer/selector can import it. Existing extension reference re-exports for source compatibility.

### Auto-stop on terminal billing/quota (interpretation: scope 1c)

- **NEW**: bridge `message_end` handler additionally tests `errorMessage` against `USAGE_LIMIT_PATTERN`. On match the bridge SHALL invoke `cachedCtx.abort()` immediately (so pi does not start its retry sleep) AND forward a synthesized `auto_retry_end {success:false, finalError: errorMessage}`. Routes the banner directly to `limit-exceeded` variant.
- **MODIFIED**: bridge `agent_end` handler — when the orderer's `maybeSynthesize` returns null (no pending retry) but `errorMessage` still matches `USAGE_LIMIT_PATTERN`, forward the same synth so the reducer routes through `limit-exceeded` instead of generic `error`.
- Transient throttle (`RETRYABLE_PATTERN` minus `USAGE_LIMIT_PATTERN`) continues to retry as today. Terminal billing/quota hard-stops the turn (session stays alive — just abort, no shutdown).

### Fix usage-limit error swallow on user abort

- **MODIFIED**: bridge wrapper-abort in `packages/extension/src/bridge.ts` — REMOVE the `usageLimitOrderer.noteRetryEnd(sessionId)` call. The orderer must keep its pending flag through user-initiated abort so that pi's eventual terminal `agent_end` can still surface the real provider `errorMessage` via the orderer's synth path. `retryTracker.noteAbort(sessionId)` stays (cleans attempt counter; doesn't affect error surfacing).
- **MODIFIED**: command-handler `case "abort"` — drop the hardcoded `finalError: "Aborted by user"`. The synthesized `auto_retry_end` carries `finalError: undefined` (or omits the field) so the reducer's auto_retry_end arm sets `lastError` only when a real provider message is supplied. The banner disappears on user abort instead of misreporting the cause.

### Fix persistent-abort wrapper reentry

- **MODIFIED**: command-handler `schedulePersistentAbort` — re-invoke `cachedCtx.abort()` directly (via a new `rawAbort` option on `commandHandler` that maps to `cachedCtx.abort()` only) instead of the whole bridge wrapper. Spec wording in `provider-retry-state/spec.md` already says `cachedCtx.abort()`; this aligns the impl.
- **MODIFIED**: bridge `commandHandler` wiring exposes both `abort` (full wrapper, used by the initial user-abort path) and `rawAbort` (`cachedCtx.abort()` only, used by persistent scheduler).
- **MODIFIED**: scheduler additionally breaks when `isAgentStreaming` flips from `true` to `false` after the initial abort (existing `isIdle()` check stays as a secondary). Once pi reports the abort settled, the scheduler stops — no further `cachedCtx.abort()` calls can clobber a user re-send.

### Fix `rewriteFollowupQueue` idle-refire

- **MODIFIED**: `packages/extension/src/bridge.ts` `rewriteFollowupQueue` — early-return when `getBridgeState().isAgentStreaming === false`. An idle `pi.sendUserMessage(_, {deliverAs:"followUp"})` would fire `agent_start` and refire the agent for the first replayed entry. On idle, the function emits a `command_feedback` informing the client the edit was deferred; UI falls back to clearing the chip.

### Manual retry without UI duplication (interpretation: option β — client-side visual dedup)

- **MODIFIED**: `event-reducer.ts` — when an `agent_start` arrives for a user message whose text matches the immediately-preceding user message AND that preceding turn ended in `lastError` (i.e. the user clicked the Retry button), the reducer SHALL flag the new user `ChatMessage` with `retriedFrom: <prevEntryId>` and suppress rendering the duplicate bubble. The session JSONL still records both entries (pi-side persistence unchanged); only the visible chat collapses.
- Filing follow-up `pi.retryLastTurn()` upstream request is out of scope.

## Capabilities

### New Capabilities

- `session-status-banner`: unified single-banner rendering above the command input. Defines the three variants (retrying, error, limit-exceeded), the selector that derives variant from `(retryState, lastError)`, banner action contract (Stop / Retry / Dismiss), and the mount placement.

### Modified Capabilities

- `provider-retry-state`: bridge MUST NOT call `usageLimitOrderer.noteRetryEnd()` on user abort (closes swallow). Persistent-abort scheduler MUST call `cachedCtx.abort()` directly, not the wrapper (closes clobber). Scheduler MUST also break on `isAgentStreaming` false transition. New requirement: bridge synth `auto_retry_end {success:false, finalError:errorMessage}` for terminal limit matches even outside an active retry chain.
- `error-detection`: `lastError` may now also be set by the bridge's USAGE_LIMIT_PATTERN match on `message_end` (auto-stop path), routed through the auto_retry_end arm. New requirement: bridge invokes `cachedCtx.abort()` on terminal billing match. Existing `agent_end`-driven detection unchanged.
- `mid-turn-prompt-queue`: `rewriteFollowupQueue` MUST guard on `isAgentStreaming`. Wrapper-abort scenarios update to reflect that `usageLimitOrderer.noteRetryEnd` is NOT called.

## Impact

**Code**

- `packages/client/src/components/RetryBanner.tsx` — **DELETED**.
- `packages/client/src/components/SessionBanner.tsx` — **NEW**, ~120 lines.
- `packages/client/src/components/ChatView.tsx` — remove inline error-banner block, remove RetryBanner mount.
- `packages/client/src/App.tsx` — mount `SessionBanner` sticky above CommandInput; thread Retry / Dismiss / Stop callbacks.
- `packages/client/src/lib/event-reducer.ts` — banner-state selector helper; visual-dedup logic in `message_start` arm for user-role messages; drop the `auto_retry_end` "Aborted by user" placeholder special-case.
- `packages/shared/src/error-patterns.ts` — **NEW**, exports `USAGE_LIMIT_PATTERN`.
- `packages/extension/src/usage-limit-orderer.ts` — re-export `USAGE_LIMIT_PATTERN` from shared.
- `packages/extension/src/bridge.ts` — terminal-limit detection in `message_end` handler, terminal-limit synth in `agent_end` fallback, drop `usageLimitOrderer.noteRetryEnd` from wrapper-abort, add `isAgentStreaming` guard to `rewriteFollowupQueue`, expose `rawAbort` on commandHandler options.
- `packages/extension/src/command-handler.ts` — drop `finalError: "Aborted by user"` placeholder, swap persistent scheduler's `opts.abort()` → `opts.rawAbort()`, add `isAgentStreaming` transition break.
- Tests: new tests for `SessionBanner` variant selector, terminal-limit auto-stop, persistent-abort non-wrapper, rewriteFollowupQueue idle-guard, retry-button visual dedup.

**APIs / protocol**

- No new wire messages. Reducer change to `SessionState.messages[].retriedFrom` is local-only (not serialized to the server).

**Persistence**

- Unchanged. Pi's session JSONL still records both the failed and retried user messages on manual retry; the dashboard hides the duplicate in the chat view only.

**Risk**

- Removing `usageLimitOrderer.noteRetryEnd` from wrapper-abort means the orderer's `pending` flag now relies entirely on `agent_end` to clear (where `maybeSynthesize` deletes it unconditionally). No leak — pi always emits `agent_end` after abort.
- Persistent-abort scheduler swap to `rawAbort` is a no-op for the retry race fix (still calls `cachedCtx.abort()` repeatedly). Only side-effect removal is the queue-clearing storm. Low risk.
- Visual dedup is reducer-only — if the heuristic mis-fires (legitimate intentional duplicate user message), the user sees one bubble where there were two. Mitigation: dedup requires the previous turn to have `lastError` set; intentional repeats land in successful turns.

**Depends on**

- None. Compatible with current pi (≥ 0.71). No version bump required.
