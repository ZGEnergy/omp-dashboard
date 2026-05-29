## Context

Today the dashboard has two parallel banner systems for closely-related session states:

- `packages/client/src/components/RetryBanner.tsx` — yellow, driven by `SessionState.retryState`, rendered inside `ChatView.tsx` at line ~498.
- Inline `lastError` error block inside `ChatView.tsx` (~line 506) — red, driven by `SessionState.lastError`.

They are independent React mounts, both visible at the same time when the underlying reducer state has both `retryState` AND `lastError` set. The reducer has a defensive guard (`FRESH_ERROR_WINDOW_MS = 1500` in `event-reducer.ts:763-768`) to drop late-arriving `auto_retry_start` events when a fresh `lastError` was just set, but the guard fires asymmetrically — it does not cover the reverse race (auto_retry_end → lastError set → next auto_retry_start arrives stale → guard fires correctly) and it does nothing about double-rendering when both fields are legitimately set during a normal transition.

Three independent bugs piggyback on the same code surface:

1. **Usage-limit swallow on user abort**. The bridge's wrapper-abort at `bridge.ts:855-866` calls `usageLimitOrderer.noteRetryEnd(sessionId)`, which clears the orderer's `pending` set. When pi's eventual terminal `agent_end` arrives carrying `errorMessage: "usage_limit_reached..."`, the orderer's `maybeSynthesize` returns null (no pending) — so the dashboard never gets the synthesized `auto_retry_end{finalError:errorMessage}` and `lastError` is set only by the reducer's `agent_end` extractor, which requires `stopReason === "error"`. On user abort pi often emits `stopReason: "aborted"`, so the extractor returns undefined and `lastError` keeps the command-handler's placeholder `"Aborted by user"` forever.

2. **Persistent-abort wrapper reentry**. `command-handler.ts:203-222` schedules `setInterval(opts.abort, 200ms)` for up to 2s after the initial abort. `opts.abort` is the **whole bridge wrapper** (`bridge.ts:835-866`), which re-clears pi's queues + bridge shadows AND re-calls `cachedCtx.abort()` on every tick. If the user sends a new prompt within the window, pi is briefly mid-turn for that new prompt → `isIdle()` returns false → next tick calls `cachedCtx.abort()` and kills the user's brand-new send. The spec text at `provider-retry-state/spec.md:154` says the scheduler should re-invoke `cachedCtx.abort()` directly, not the wrapper — silent spec/impl drift.

3. **`rewriteFollowupQueue` idle-refire**. `bridge.ts:275-285` runs `pi.clearFollowUpQueue()` + a loop of `pi.sendUserMessage(t, {deliverAs:"followUp"})` with no `isAgentStreaming` guard. Pi's contract (verified by the comment at `bridge.ts:927-933`) says idle `sendUserMessage` fires `agent_start` synchronously and starts a new turn. So an edit/promote/remove on the follow-up queue against an idle session causes the first replayed entry to be processed as a turn instead of queued. UI shows a chip; agent is actually running it.

These three bugs would each warrant their own change, but they share the abort/retry surface so closely that fixing them in isolation creates spec drift across `provider-retry-state`, `error-detection`, and `mid-turn-prompt-queue`. Bundling them into the same change keeps the spec deltas coherent.

Stakeholders: dashboard end users (who currently see misleading red banners on terminal billing errors and lose follow-up entries after abort), and the dashboard developers maintaining the bridge ↔ server ↔ client banner pipeline.

## Goals / Non-Goals

**Goals:**

- One banner component, one mount point, one variant selector. Race-overlap impossible by construction.
- Terminal billing/quota errors (USAGE_LIMIT_PATTERN match) hard-stop the turn via `cachedCtx.abort()` and route to the `limit-exceeded` banner variant with the real provider `errorMessage`.
- User-initiated abort surfaces the **actual** provider error when one exists (close the swallow); the banner disappears when no real error is available (no more `"Aborted by user"` placeholder).
- Persistent-abort scheduler stops clobbering user re-sends — uses `cachedCtx.abort()` only, breaks on `isAgentStreaming` false transition.
- `rewriteFollowupQueue` no longer refires the agent on an idle session.
- Manual "Retry after error" stops duplicating the user bubble in the visible chat.

**Non-Goals:**

- Changing pi-coding-agent's internal retry decisions (`RETRYABLE_PATTERN`, `maxAttempts`, sleep schedule). Transient `rate_limit`/429/503 still retries as today.
- Adding `pi.retryLastTurn()` API upstream. Manual-retry dedup is client-side visual only — the JSONL still has both user entries.
- New protocol messages or wire-format changes. All changes are localized to bridge + client; the server only forwards existing message types.
- Mobile/responsive banner redesign. Reuse Tailwind classes from the current `RetryBanner` and inline error block.
- Telemetry / analytics for banner variant counts.

## Decisions

### Decision 1: Single derived selector for banner state

The client reducer keeps `retryState` and `lastError` as separate fields (no schema change). A new helper `deriveBannerState(state: SessionState): BannerState` lives in `event-reducer.ts` and is called once per render in `App.tsx`:

```ts
type BannerState =
  | { variant: "hidden" }
  | { variant: "retrying"; attempt: number; reason: string }
  | { variant: "error"; message: string }
  | { variant: "limit-exceeded"; message: string };

function deriveBannerState(state: SessionState): BannerState {
  if (state.retryState) {
    return {
      variant: "retrying",
      attempt: state.retryState.attempt,
      reason: state.retryState.reason,
    };
  }
  if (state.lastError) {
    const limit = USAGE_LIMIT_PATTERN.test(state.lastError.message);
    return {
      variant: limit ? "limit-exceeded" : "error",
      message: state.lastError.message,
    };
  }
  return { variant: "hidden" };
}
```

**Alternatives considered:**

- Add a single `banner: { variant; ... } | null` field on `SessionState`, updated by every reducer arm. Rejected — duplicates the existing `retryState`/`lastError` info; every event arm would need to update three fields instead of two; broader blast radius on event-reducer.test.ts.
- Render two components and have them coordinate visibility via a shared boolean. Rejected — still leaves the race-overlap risk if the coordination is wrong; doesn't simplify code.

**Why the selector wins:** read-only derivation, no new state. Existing reducer logic for `retryState`/`lastError` unchanged. The unified mount point ensures only one banner is visible. If reducer logic ever permits both fields to be set simultaneously, the precedence is encoded once in the selector (retryState wins; correct because retry is "in progress" while lastError is "settled").

### Decision 2: Banner placement — sticky above CommandInput

Mount `<SessionBanner>` in `App.tsx` between `<ChatView>` and `<CommandInput>` (or inside the layout wrapper that holds both). It is **not** part of the scrollable chat area.

**Alternatives considered:**

- Keep banner inside `ChatView` (current location for `RetryBanner`). Rejected — scrolls out of view; users miss it on long retry sleeps.
- Pin to the top of the viewport via fixed positioning. Rejected — covers chat content; mobile-hostile.
- Floating toast. Rejected — dismissible by accident; non-actionable for the Stop / Retry case.

Sticky-above-input keeps it next to the user's next action surface (the input). Existing `CommandInput` layout already reserves vertical space above itself for the steering chips, so the structural cost is one extra slot.

### Decision 3: `USAGE_LIMIT_PATTERN` moves to `packages/shared/`

Today the regex lives in `packages/extension/src/usage-limit-orderer.ts`. The client needs it for the banner-variant selector. Options:

- (a) Move to `packages/shared/src/error-patterns.ts`. Extension re-exports for source compatibility.
- (b) Duplicate the regex in the client. Rejected — drift risk; the patterns must match.
- (c) Send the variant hint from the bridge inside the synth event. Rejected — protocol coupling; bridge would have to know about the client's banner taxonomy.

(a) wins. New shared module exports `USAGE_LIMIT_PATTERN` and `RETRYABLE_PATTERN` (the latter for future client-side variant decisions, optional). Bridge imports from shared; client reducer imports from shared; existing extension code path stays the same via re-export.

### Decision 4: Drop `"Aborted by user"` placeholder, don't keep an "aborted" variant

`command-handler.ts:403` hardcodes `finalError: "Aborted by user"` on every abort. This is the second half of the usage-limit swallow.

The synth `auto_retry_end` from abort still fires (its purpose is to clear `retryState` immediately so the yellow banner disappears), but the payload becomes `{success: false, attempt: -1}` — no `finalError`. The reducer's auto_retry_end arm at `event-reducer.ts:785-787` only sets `lastError` when `typeof data.finalError === "string"`, so dropping the field makes the synth a no-op against `lastError`. When pi's eventual `agent_end` arrives with a real provider `errorMessage`, the orderer's synth path (now no longer disqualified — see Decision 5) sets `lastError` to the truth.

**Alternative considered:** keep an "aborted" fourth variant (grey/blue, brief). Rejected — extra UI surface, extra spec scenarios, and the user already gets feedback from the chat (their message goes through; the assistant response gets cut off). The banner's purpose is error/retry, not abort acknowledgment.

### Decision 5: Bridge wrapper-abort no longer calls `usageLimitOrderer.noteRetryEnd`

Today `bridge.ts:865` clears the orderer's pending set on user abort. Drop that line. `retryTracker.noteAbort(sessionId)` stays (different purpose — clears the in-flight attempt counter so a subsequent `agent_end` doesn't double-emit `auto_retry_end{success:true}`).

The orderer is only ever cleared from one place: `usageLimitOrderer.maybeSynthesize` already deletes the pending flag at the start of every call (`usage-limit-orderer.ts:71`). So pi's terminal `agent_end` after a user abort triggers `maybeSynthesize`, which checks `errorMessage` against `USAGE_LIMIT_PATTERN`, synthesizes `auto_retry_end{finalError:errorMessage}`, and clears pending. Lifecycle complete.

**Risk:** if pi never emits `agent_end` after a user abort during retry sleep (some pi versions / edge cases), the orderer's pending stays true forever. Mitigation: the orderer's pending set is bounded by sessionId; on session shutdown the bridge runs the existing teardown that doesn't reference the orderer. A stale entry leaks at most one boolean per session. Acceptable.

### Decision 6: Persistent-abort scheduler calls `cachedCtx.abort()` directly

`command-handler.ts:217` `try { opts.abort?.(); }` becomes `try { opts.rawAbort?.(); }` where `rawAbort` is a new option on `commandHandler` that maps to `cachedCtx.abort()` only.

In `bridge.ts` the wiring becomes:

```ts
const commandHandler = createCommandHandler(pi, () => sessionId, {
  // … existing options …
  abort: () => { /* full wrapper — clears queues, emits queue_update, etc. */ },
  rawAbort: () => { cachedCtx?.abort?.(); },
});
```

The full `abort` wrapper still runs once on the initial `case "abort"` path. Persistent ticks use `rawAbort` so they don't re-clear queues or duplicate `retryTracker.noteAbort` calls.

**Alternative considered:** add an `alreadyResetThisAbort` guard inside the wrapper and skip the reset on subsequent calls. Rejected — introduces hidden state; harder to spec; the explicit `rawAbort` matches the spec literal.

### Decision 7: Persistent-abort scheduler breaks on `isAgentStreaming` false transition

The existing `isIdle()` check stays. Adding: a second break condition that fires when `isAgentStreaming` was `true` at scheduler start and has since flipped to `false` (i.e. `agent_end` for the aborted turn was processed).

```ts
function schedulePersistentAbort(opts: NonNullable<typeof options>): void {
  if (!opts.rawAbort) return;
  const startedAt = Date.now();
  const wasStreamingAtStart = opts.isStreaming?.() === true;
  const interval = setInterval(() => {
    if (Date.now() - startedAt >= PERSISTENT_ABORT_MAX_MS) { clearInterval(interval); return; }
    // Break when the abort settles (agent_end flipped streaming off).
    if (wasStreamingAtStart && opts.isStreaming?.() === false) { clearInterval(interval); return; }
    try { if (opts.isIdle?.()) { clearInterval(interval); return; } } catch { /* keep trying */ }
    try { opts.rawAbort?.(); } catch { /* idempotent */ }
  }, PERSISTENT_ABORT_INTERVAL_MS);
}
```

This closes the user-re-send-gets-clobbered hole: once the originally-aborted turn ends, the scheduler stops. A new turn from the user's re-send cannot be killed by a leftover persistent tick.

**Why not just rely on `isIdle()`?** `isIdle()` is a snapshot. Between two snapshots the user can send → pi starts a new turn → `isIdle()` returns false → scheduler abort kills the new turn. The streaming-transition check ties the scheduler to the **original** aborted turn's lifecycle, not whatever pi happens to be doing at tick time.

### Decision 8: `rewriteFollowupQueue` early-returns when not streaming

```ts
function rewriteFollowupQueue(newEntries: string[]): void {
  if (!getBridgeState().isAgentStreaming) {
    connection.send({
      type: "command_feedback",
      sessionId,
      status: "error",
      message: "Follow-up edit ignored: session is idle",
    });
    return;
  }
  // … existing body …
}
```

The client's `QueuePanel` listens for the feedback and clears the affected chip. No refire possible because no `sendUserMessage` runs.

**Alternative considered:** route the entries through `recordFollowupSent` and let pi process the first one as a turn (treat it as a "send now" gesture). Rejected — implicit; surprising; the user clicked Edit, not Send.

### Decision 9: Auto-stop on USAGE_LIMIT_PATTERN — two trigger points

Bridge inserts the auto-stop logic in two handlers:

- `message_end` handler: after `retryTracker.observeMessageEnd` (existing) returns, additionally test `message.errorMessage` against `USAGE_LIMIT_PATTERN`. If matched, call `cachedCtx.abort()` immediately AND synth+forward `auto_retry_end{success:false, finalError:errorMessage}`. This catches the case BEFORE pi enters its retry sleep — saves the user from a pointless yellow-banner-then-red sequence.

- `agent_end` handler: the existing orderer.maybeSynthesize path already handles "terminal limit during retry chain". Add an explicit second branch: if `maybeSynthesize` returned null AND `errorMessage` (extracted via `extractAgentEndError`-like logic) matches `USAGE_LIMIT_PATTERN`, forward the same synth. This catches the case where there was no retry chain (first-attempt terminal billing error — `RETRYABLE_PATTERN` doesn't match `usage_limit_reached` so no auto_retry_start fires, but the orderer was never primed).

Both paths converge on the same `event_forward {eventType: "auto_retry_end", data: {success:false, finalError:errorMessage}}`, so the client reducer + selector handles them identically.

**Alternative considered:** put the auto-stop logic entirely client-side (reducer detects USAGE_LIMIT_PATTERN, dispatches a `send {type:"abort"}`). Rejected — round-trip delay; pi keeps streaming/retrying meanwhile; the abort happens "from the client" which confuses session ownership; impossible in headless mode where there's no client.

### Decision 10: Manual retry visual dedup — reducer-only

In `event-reducer.ts`, the `message_start` arm for user-role messages compares the new message's text against the immediately-preceding user message in `state.messages`. If they match AND the message between them has `lastError`-like markers (terminal `agent_end` error or `stopReason: "error"`), the new user `ChatMessage` is flagged `retriedFrom: <prevEntryId>` and the chat view's render skips it.

```ts
interface ChatMessage {
  // … existing fields …
  retriedFrom?: string; // entryId of the duplicated user message; skip from render
}
```

The pi session JSONL still records both. Fork-from-here / resume show both. Only the **live chat view** in this session collapses them.

**Risk:** false positive when the user genuinely wants to send the same message twice after a failure that wasn't a "retry" in their head (e.g. they retried then realized they wanted to send anyway). Mitigation: the dedup requires the preceding assistant turn to have ended in error AND the user clicked the Retry button (which uses `findLastUserPrompt` so the text matches exactly). Manual typing identical text is more likely to differ in whitespace; the equality check is strict.

**Alternative considered:** mark the duplicate at send-time on the client (`handleRetryAfterError` attaches a flag to the outgoing send_prompt). Rejected — flag would need to round-trip through bridge → pi → back as event, and the bridge can't legitimately add fields to pi's user-message metadata.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Removing `usageLimitOrderer.noteRetryEnd` from wrapper-abort leaves a stale `pending` entry if pi never emits `agent_end` after abort. | The orderer's set entries are one-bool-per-session; bounded. `maybeSynthesize` deletes on first call. Worst case: leak ends at session shutdown. |
| Persistent-abort streaming-transition break might fire too early if pi briefly flips streaming false→true→false (e.g. mid-retry sleep). | `isStreaming` is bridge-owned (`getBridgeState().isAgentStreaming`), set by `agent_start`/`agent_end` events. Pi does not emit those during retry sleep, so no false transitions. |
| Visual dedup mis-fires on legitimate identical re-sends. | Strict text equality + previous turn error requirement. Worst case: user sees one chat bubble where they sent two; the second turn's assistant response is still visible. No data loss. |
| `USAGE_LIMIT_PATTERN` move to shared changes the import graph; bridge re-export must stay so headless / RPC code that imports from extension keeps working. | Re-export is a one-liner; existing test `usage-limit-orderer.test.ts` validates pattern correctness; new test for the re-export wiring. |
| Sticky-above-input banner adds vertical space on small viewports. | Banner is single-line collapsible; existing `RetryBanner` is already compact; reuse same height budget. |
| Auto-stop on `USAGE_LIMIT_PATTERN` change could break existing behaviour for users who DID want pi to keep retrying (e.g. waiting for hourly reset). | `USAGE_LIMIT_PATTERN` matches terminal categories that won't resolve within pi's retry budget (max ~5 attempts, ~60s total). "Reset in N minutes" matches the pattern — the user benefits from the hard-stop. Edge case: `monthly_limit` user wanting to wait 30 days — they'd need to manually re-send anyway. |
| Dropping `"Aborted by user"` finalError means some edge paths (pi never emits `agent_end` after abort, no provider message available) leave no banner at all. | Acceptable: the chat already shows the user's message + cut-off assistant response. The banner exists for cause-of-failure, and "user clicked Stop" is self-evident. |

## Migration Plan

No database migration. No protocol migration. No persistence format changes.

Deploy steps:
1. Land changes to bridge + shared simultaneously (single commit), then bump.
2. Land client changes (single commit).
3. Existing connected pi sessions continue to use the old `RetryBanner` until reloaded via `npm run reload`. Bridge changes take effect on session reload; client changes take effect on browser refresh / dashboard restart.
4. No rollback drama — the spec changes are subtractive (drop a placeholder, drop a clear-call) plus additive (auto-stop branch); revert is a clean git revert.

## Open Questions

None blocking. Two follow-ups noted for future changes:

- `pi.retryLastTurn()` upstream feature request — would let the dashboard skip the visual-dedup workaround and rerun the same user message without appending. Out of scope here.
- `RETRYABLE_PATTERN` drift from pi-coding-agent internal regex — both currently copied verbatim; a future change could expose pi's regex via the ExtensionAPI to remove drift risk. Out of scope.
