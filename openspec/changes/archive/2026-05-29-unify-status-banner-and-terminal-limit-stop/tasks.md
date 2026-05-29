## 1. Shared error-pattern module

- [x] 1.1 Create `packages/shared/src/error-patterns.ts` exporting `USAGE_LIMIT_PATTERN` (copy regex literal verbatim from `packages/extension/src/usage-limit-orderer.ts:30`). Add JSDoc describing categories matched.
- [x] 1.2 In `packages/extension/src/usage-limit-orderer.ts`, replace the local `USAGE_LIMIT_PATTERN` definition with `export { USAGE_LIMIT_PATTERN } from "@earendil-works/pi-dashboard-shared/error-patterns"` (or equivalent re-export). Keep the existing import path working for callers.
- [x] 1.3 Update `packages/shared/package.json` exports map if needed so the new module is importable from both client and extension.
- [x] 1.4 Write unit test `packages/shared/src/__tests__/error-patterns.test.ts` validating the pattern matches each documented terminal category (usage_limit_reached, quota_exceeded, insufficient_quota, credit_balance, monthly_spending_cap, resource_exhausted, "reset after 12h") and does NOT match generic retryable errors (fetch failed, ECONNRESET, timeout, "429 Too Many Requests" without quota suffix).
- [x] 1.5 Update `packages/extension/src/__tests__/usage-limit-orderer.test.ts` to import the pattern from the re-export and verify it remains identical to the source.

## 2. Bridge: drop usageLimitOrderer.noteRetryEnd from wrapper-abort

- [x] 2.1 In `packages/extension/src/bridge.ts`, locate the `abort:` arm of the `commandHandler` options (~line 835-866). Remove the `usageLimitOrderer.noteRetryEnd(sessionId)` call (line ~865). Keep `retryTracker.noteAbort(sessionId)` immediately above it.
- [x] 2.2 Add a comment at the removal site referencing `change: unify-status-banner-and-terminal-limit-stop` and explaining that the orderer's `pending` flag MUST survive user-initiated abort so terminal `agent_end` can still surface the real provider error.
- [x] 2.3 Add unit test in `packages/extension/src/__tests__/bridge-abort-orderer.test.ts` (new file) that: simulates orderer in pending state → invokes the wrapper-abort → asserts `usageLimitOrderer.hasPending(sessionId) === true` after the wrapper returns.

## 3. Bridge: expose rawAbort + scheduler streaming-transition break

- [x] 3.1 In `packages/extension/src/command-handler.ts`, add `rawAbort?: () => void` to the `options` type of `createCommandHandler`. Add `isStreaming?: () => boolean` (already exists for other call sites — verify and reuse, do not duplicate).
- [x] 3.2 In `schedulePersistentAbort` (command-handler.ts:203-222), capture `wasStreamingAtStart = opts.isStreaming?.() === true` before starting the `setInterval`. In each tick: if `wasStreamingAtStart && opts.isStreaming?.() === false`, clear the interval and return BEFORE the `opts.isIdle()` check.
- [x] 3.3 In the same tick, swap `try { opts.abort?.(); }` to `try { opts.rawAbort?.(); }`. Keep the catch + idempotent behavior.
- [x] 3.4 In `packages/extension/src/bridge.ts`, wire the new `rawAbort` option on the `commandHandler` instantiation (~line 783): `rawAbort: () => { try { cachedCtx?.abort?.(); } catch (err) { console.warn("[dashboard] cachedCtx.abort threw in rawAbort:", err); } }`.
- [x] 3.5 Update unit tests for `schedulePersistentAbort` in `packages/extension/src/__tests__/command-handler.test.ts` (search for `schedulePersistentAbort` or `persistent abort` test). Add scenarios: (a) ticks call `rawAbort` not `abort`; (b) scheduler stops on streaming-true→false transition; (c) scheduler stops on isIdle true (existing); (d) scheduler stops on 2 s timeout (existing).

## 4. Bridge: drop "Aborted by user" finalError placeholder

- [x] 4.1 In `packages/extension/src/command-handler.ts:403`, change the synth `auto_retry_end` payload from `{ success: false, attempt: -1, finalError: "Aborted by user" }` to `{ success: false, attempt: -1 }`. Drop the `finalError` field entirely.
- [x] 4.2 Update `packages/extension/src/__tests__/command-handler.test.ts` test that previously asserted `evt.event.data` deep-equals the `"Aborted by user"` shape (~line 269). Replace with assertion that `evt.event.data === { success: false, attempt: -1 }` (no `finalError`).
- [x] 4.3 Verify by reading the client reducer (`packages/client/src/lib/event-reducer.ts` auto_retry_end arm) that an `auto_retry_end` with no `finalError` clears `retryState` but does NOT set `lastError`. No reducer changes needed.

## 5. Bridge: terminal-limit auto-abort on message_end

- [x] 5.1 In `packages/extension/src/bridge.ts` `message_end` event handler (~line 1191+), import `USAGE_LIMIT_PATTERN` from `@earendil-works/pi-dashboard-shared/error-patterns`.
- [x] 5.2 After the existing `retryTracker.observeMessageEnd` call site, add a branch: if `message.role === "assistant"` AND `message.stopReason === "error"` AND `USAGE_LIMIT_PATTERN.test(message.errorMessage)`, call `cachedCtx?.abort?.()` synchronously AND forward `event_forward { event: { eventType: "auto_retry_end", timestamp: Date.now(), data: { success: false, attempt: -1, finalError: message.errorMessage } } }`.
- [x] 5.3 Place the terminal-limit branch BEFORE the retry-tracker synth so it short-circuits: if `USAGE_LIMIT_PATTERN` matches, do NOT also synthesize `auto_retry_start` from the same message_end. Skip the existing `retryTracker.observeMessageEnd` call for this branch.
- [x] 5.4 Mark `usageLimitOrderer.noteRetryStart(sessionId)` as NOT called in this branch (we're going straight to auto_retry_end). Verify the orderer's existing `maybeSynthesize` on the eventual `agent_end` is a no-op for this branch (pending was never set), so no double-synth.
- [x] 5.5 Add unit test `packages/extension/src/__tests__/bridge-terminal-limit-abort.test.ts` (new file): simulate message_end with `errorMessage: "monthly_spending_cap exceeded"` → assert `cachedCtx.abort` called once + auto_retry_end forwarded with `finalError`.
- [x] 5.6 Add unit test: simulate message_end with `errorMessage: "429 rate_limit; try again"` (matches `RETRYABLE_PATTERN` but NOT `USAGE_LIMIT_PATTERN`) → assert NO auto-abort, normal retry synth.
- [x] 5.7 Add unit test: simulate message_end with `errorMessage: "429: usage_limit_reached"` (matches both) → assert `USAGE_LIMIT_PATTERN` wins, auto-abort fires.

## 6. Bridge: first-attempt USAGE_LIMIT branch on agent_end

- [x] 6.1 In `packages/extension/src/bridge.ts` `agent_end` event handler, locate the existing `usageLimitOrderer.maybeSynthesize` call (~line 1062). After its `if (orderedSynth) { … } else { … }` block, add a new branch: if `orderedSynth === null` AND `event.messages[last].stopReason === "error"` AND `USAGE_LIMIT_PATTERN.test(event.messages[last].errorMessage)`, forward `event_forward { event: { eventType: "auto_retry_end", timestamp: Date.now(), data: { success: false, attempt: -1, finalError: event.messages[last].errorMessage } } }` BEFORE forwarding the `agent_end`.
- [x] 6.2 Verify the orderer's `maybeSynthesize` is called BEFORE this branch so the two paths remain mutually exclusive.
- [x] 6.3 Add unit test in `bridge-terminal-limit-abort.test.ts`: simulate agent_end with `errorMessage: "insufficient_quota"` and orderer pending=false → assert synth fires before agent_end with the real errorMessage.
- [x] 6.4 Add unit test: agent_end with `errorMessage: "tool execution failed"` (non-USAGE_LIMIT) and orderer pending=false → assert NO synth fires; agent_end forwarded as-is.
- [x] 6.5 Add unit test: agent_end with `errorMessage` matching USAGE_LIMIT AND orderer pending=true → assert orderer's synth fires (existing path), this new branch does NOT additionally synth.

## 7. Bridge: rewriteFollowupQueue streaming guard

- [x] 7.1 In `packages/extension/src/bridge.ts` `rewriteFollowupQueue` (~line 275), add an early-return at the top: `if (!getBridgeState().isAgentStreaming) { connection.send({ type: "command_feedback", sessionId, status: "error", message: "Follow-up edit ignored: session is idle" }); return; }`.
- [x] 7.2 Verify all four entry-points still call through `rewriteFollowupQueue`: `edit_followup_slot` (~line 684), `promote_followup_entry` (~line 694), `remove_followup_entry` (~line 703), `edit_followup_entry` (~line 712). No additional changes needed at those sites.
- [x] 7.3 Confirm `command_feedback` is an existing protocol message type (see `packages/shared/src/protocol.ts`). If not, add it with shape `{ type: "command_feedback"; sessionId: string; status: "error" | "ok"; message: string }`.
- [x] 7.4 Add unit test `packages/extension/src/__tests__/bridge-followup-idle-guard.test.ts` (new file): for each of the four message types, simulate handler invocation with `isAgentStreaming === false` → assert `pi.sendUserMessage` NOT called, `pi.clearFollowUpQueue` NOT called, `bridgeFollowUp` unchanged, `command_feedback` forwarded.
- [x] 7.5 Add unit test: streaming=true case calls through normally (existing behavior preserved).

_Note: command_feedback is forwarded via the existing `event_forward` wrapper (matches the slash-dispatch.ts pattern), not as a top-level message type._

## 8. Shared: SessionBanner component

- [x] 8.1 Create `packages/client/src/components/SessionBanner.tsx`. Component props: `{ state: BannerState; onAbort?: () => void; onRetry?: () => void; onDismiss?: () => void; }`. Render based on `state.variant`: `hidden` → null, `retrying` → amber/yellow with attempt + reason + Stop, `error` → red with message + Retry + Dismiss, `limit-exceeded` → red with distinct icon + message + Dismiss + "Session stopped automatically." hint.
- [x] 8.2 Preserve `data-testid="error-banner"` and `data-testid="error-banner-dismiss"` on the relevant elements (apply to `error` and `limit-exceeded` variants — not to `retrying`).
- [x] 8.3 Implement long-message truncation (default threshold 240 chars) with Show more / Show less toggle. Reuse logic from the deprecated `ErrorBanner.tsx` (lift into `SessionBanner`).
- [x] 8.4 Implement copy-to-clipboard control on `error` and `limit-exceeded` variants. Reuse logic from `ErrorBanner.tsx`.
- [x] 8.5 Implement countdown rendering on `retrying` variant when `retryState.delayMs > 0 && retryState.maxAttempts > 0`. Refresh ≥1×/sec via `useEffect` + setInterval, clamped to 0. Show "retrying…" indeterminate when delayMs <= 0.
- [x] 8.6 Style: extract Tailwind classes from existing `RetryBanner.tsx` for the `retrying` variant and from `ErrorBanner.tsx` for the `error` variant. New iconography for `limit-exceeded` (mdiCreditCardOutline).

## 9. Shared: deriveBannerState selector

- [x] 9.1 In `packages/client/src/lib/event-reducer.ts`, after the existing exports, add `export type BannerState` (union of the four variants) and `export function deriveBannerState(state: SessionState): BannerState`.
- [x] 9.2 Implement per design Decision 1: retryState wins; else lastError + USAGE_LIMIT_PATTERN.test → limit-exceeded vs error; else hidden. Import `USAGE_LIMIT_PATTERN` from `@earendil-works/pi-dashboard-shared/error-patterns`.
- [x] 9.3 Add unit tests in `packages/client/src/lib/__tests__/event-reducer.test.ts` covering: hidden, retrying (with attempt + reason fields), error (non-USAGE_LIMIT message), limit-exceeded (USAGE_LIMIT match), retrying-wins-over-error (both fields set).

## 10. Client: replace banners with SessionBanner mount

- [x] 10.1 In `packages/client/src/components/ChatView.tsx`, remove the `<RetryBanner …>` mount (~line 498) and the inline `state.lastError`-driven red-banner block (~line 506). Remove the corresponding `onAbort` / `onRetryAfterError` / `onDismissError` props from `ChatView`'s `Props` type if they are no longer used by ChatView itself.
- [x] 10.2 In `packages/client/src/App.tsx`, mount `<SessionBanner>` between `<ChatView>` and `<CommandInput>` (or inside the layout wrapper, ensuring it does not scroll with chat). Compute `bannerState = useMemo(() => deriveBannerState(selectedState), [selectedState])`.
- [x] 10.3 Thread `onAbort={wrappedHandleAbort}`, `onRetry={onRetryAfterError}`, `onDismiss={onDismissError}` to `<SessionBanner>`. The `wrappedHandleAbort`, `onRetryAfterError`, and `onDismissError` closures already exist in App.tsx (they were previously passed to `ChatView`).
- [x] 10.4 Delete `packages/client/src/components/RetryBanner.tsx` AND `packages/client/src/components/__tests__/RetryBanner.test.tsx` (replace with `SessionBanner.test.tsx` covering the same scenarios + new variants).
- [x] 10.5 Delete `packages/client/src/components/ErrorBanner.tsx` only after confirming no other code path imports it (search across `packages/`). If it is used elsewhere (e.g. SessionCard error indicator), leave it but ensure ChatView no longer uses it.
- [x] 10.6 Update `packages/client/src/components/__tests__/ChatView.test.tsx` — remove tests that asserted on inline error-banner content; add tests confirming `ChatView` no longer renders a banner element when `state.lastError` is set (the banner is now external).

## 11. Client: SessionBanner unit tests

- [x] 11.1 Create `packages/client/src/components/__tests__/SessionBanner.test.tsx`. Test scenarios: (a) `hidden` variant renders nothing; (b) `retrying` shows attempt + reason + Stop, fires `onAbort` on click; (c) `error` shows message + Retry + Dismiss, fires `onRetry` and `onDismiss`; (d) `limit-exceeded` shows message + Dismiss + hint, NO Retry button rendered; (e) long message truncates with toggle; (f) copy control fires `navigator.clipboard.writeText` with full message.
- [x] 11.2 Confirm `data-testid="error-banner"` and `data-testid="error-banner-dismiss"` resolve to the expected elements in `error` and `limit-exceeded` variants (regression protection for any external tests).
- [-] 11.3 Visual regression: take a screenshot of each variant via the existing browser test infrastructure (if any). If not, skip and rely on unit tests. _(Skipped: relies on unit tests; no in-repo visual-regression infra exercised by this PR.)_

## 12. Client: visual dedup for retried user message

- [x] 12.1 In `packages/client/src/lib/event-reducer.ts`, extend the `ChatMessage` type with `retriedFrom?: string` (entryId of the duplicated user message).
- [x] 12.2 In the `message_start` reducer arm for user-role messages, compare the new message's text against the immediately-preceding user message in `state.messages`. If equal AND the messages between them include a turn that ended in `lastError` (heuristic: check if there's an assistant message with `stopReason === "error"` between the two users, OR if `state.lastError.timestamp` was set within the gap), set `retriedFrom: <prevEntryId>` on the new `ChatMessage`.
- [x] 12.3 In `packages/client/src/components/ChatView.tsx`, filter out messages with `retriedFrom` set when iterating `state.messages` for render. The actual entry stays in `state.messages` (used for `findLastUserPrompt`, fork-from-here, etc.).
- [x] 12.4 Add unit tests in `event-reducer.test.ts`: (a) retry button send after error → new message flagged; (b) identical re-send after success → NOT flagged; (c) different text after error → NOT flagged; (d) preceding gap longer than recent error → NOT flagged (e.g. error from 30 minutes ago).
- [x] 12.5 Add unit test in `ChatView.test.tsx`: render with two user messages "X" where second has `retriedFrom` → assert only ONE "X" bubble in the rendered output.

## 13. Spec & doc sync

- [x] 13.1 Update `docs/file-index-extension.md` or `docs/file-index-client.md` (as applicable) with one-line entries for new files: `packages/shared/src/error-patterns.ts`, `packages/client/src/components/SessionBanner.tsx`. Add `See change: unify-status-banner-and-terminal-limit-stop.` annotations to the rows for modified files (`bridge.ts`, `command-handler.ts`, `event-reducer.ts`, `App.tsx`, `ChatView.tsx`).
- [x] 13.2 Delegate the file-index updates to a general-purpose subagent per AGENTS.md "Documentation Update Protocol" → caveman style; do not edit docs from the main agent.

## 14. Manual verification

- [x] 14.1 `npm test 2>&1 | tee /tmp/pi-test.log` and `grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log` — confirm all tests pass. _(6497/6520 pass; 2 failures are pre-existing `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` resolver tests that fail on every clean checkout regardless of this change; 21 skipped.)_
- [x] 14.2 `npm run build` — confirm production client build succeeds.
- [x] 14.3 `npm run reload` then exercise in the browser: trigger a transient 429 (or use a mocked provider) → confirm yellow `retrying` banner appears, replaces nothing else. Trigger terminal `usage_limit_reached` → confirm red `limit-exceeded` banner with no Retry. Trigger a non-billing terminal error → confirm red `error` banner with Retry.
- [x] 14.4 Manual abort during retry: confirm `Aborted by user` no longer appears; banner disappears if no real provider error, or shows the real error if `agent_end` carries one.
- [x] 14.5 Manual abort then immediate re-send within 2 s: confirm the re-send is NOT clobbered (the new turn streams to completion).
- [x] 14.6 Manual edit/promote/remove on a follow-up chip while session is idle: confirm no agent refire; visible toast / chip clears appropriately.
- [x] 14.7 Manual Retry button after error: confirm only ONE user bubble visible in chat (dedup applied).

## 15. Remove steering ✕ cancel button (pi API gap)

_Added mid-implementation after discovering pi's `ExtensionAPI` (verified through pi 0.75.5) does NOT expose `clearSteeringQueue` or `clearFollowUpQueue`. The bridge's `(pi as any).clearSteeringQueue` calls have always been silent no-ops via the `typeof === "function"` guard. Clicking the steer ✕ cleared the bridge shadow but pi still delivered the message at the next drain — user-reported bug._

- [x] 15.1 In `packages/client/src/components/ChatView.tsx` inline-steer card block, remove the `✕` cancel button + the `onCancelSteering` prop. Keep the steer card itself so the user can see what's queued.
- [x] 15.2 In `packages/client/src/App.tsx`, stop passing `onCancelSteering={handleClearSteeringQueue}` to `<ChatView>`.
- [x] 15.3 In `packages/extension/src/bridge.ts` `clear_steering_queue` handler, leave the shadow-clear + emitQueueUpdate intact for forward compatibility (stale clients) but document the pi API gap inline. Drop the `console.warn` so the no-op doesn't spam logs.
- [x] 15.4 Update `packages/client/src/components/__tests__/ChatView.inline-steer.test.tsx`: drop the two cancel-button tests; add a regression test that `pending-steer-cancel` test-id is NEVER in the DOM.
- [x] 15.5 `npm test` confirms green (same 2 pre-existing unrelated failures only).
- [x] 15.6 File upstream pi feature request: expose `ctx.clearQueue()` (or `pi.clearSteeringQueue()` / `pi.clearFollowUpQueue()`) on ExtensionContext so the dashboard can honestly support per-queue cancellation. Reference: `pi-coding-agent/dist/core/agent-session.js:1029` already implements `session.clearQueue()`; just needs an ExtensionAPI surface.

## 16. Make QueuePanel display-only (follow-up has same API gap)

_Empirically verified via `/tmp/pi-queue-experiment.mjs`: the bridge's `rewriteFollowupQueue` (used by edit / promote / remove) calls fictional `pi.clearFollowUpQueue?.()` (silent no-op) then re-sends survivors via `pi.sendUserMessage` which **appends** to pi's internal queue. Removing entry `"beta"` from `["alpha","beta","gamma"]` causes pi to deliver `["alpha","beta","gamma","alpha","gamma"]` — the removed message stays AND survivors duplicate. Inspection: `AgentSession.prototype` has only `clearQueue` (not on ExtensionAPI), `_queueFollowUp` (private, append-only), `_queueSteer` (private, append-only). The dashboard inventory of edit/promote/remove was creating semantics pi doesn't support._

_Pi-TUI's `alt+up` (keybinding `app.message.dequeue`) doesn't do per-entry edit either — it calls `session.clearQueue()` and yanks ALL queued text into the editor. The dashboard's existing Stop button (`wrappedHandleAbort`) already implements the same yank-into-draft pattern at the client level; only the `session.clearQueue()` call is missing because pi doesn't expose it to extensions._

- [x] 16.1 In `packages/client/src/components/QueuePanel.tsx`, remove the `FollowupCycler` edit/promote/remove affordances. Keep ↑/↓ navigation (read-only, client-side) + position indicator. Click-to-edit replaced with read-only display of the visible entry.
- [x] 16.2 In `packages/client/src/App.tsx`, drop the mutation callbacks passed to `<QueuePanel>`: `onClearFollowup`, `onEditFollowup`, `onEditFollowupEntry`, `onRemoveFollowupEntry`, `onPromoteFollowupEntry`. Stop destructuring them from `useSessionActions` (they remain available in the hook for any other caller; bridge still no-ops them defensively).
- [x] 16.3 Update `packages/client/src/components/__tests__/QueuePanel.test.tsx`: drop the 13 mutation-related tests; add tests for display-only behavior (no mutation buttons present at any queue size, ↑/↓ navigation, position indicator, append-friendly currentIndex jumping, clamp on shrink).
- [x] 16.4 `npm test` confirms green (same 2 pre-existing unrelated failures, 6488 passing).
- [x] 16.5 `npm run build` confirms production client build succeeds.
- [x] 16.6 Future: when pi exposes `ctx.clearQueue()`, restore the QueuePanel edit/promote/remove buttons honestly (each one becomes: snapshot via `ctx.clearQueue()` → modify locally → replay via `pi.sendUserMessage`). Until then, the Stop button is the only honest way to cancel queued messages.
