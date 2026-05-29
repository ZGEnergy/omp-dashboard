## 1. Spec — capture reality first (TDD anchor for everything below)

- [x] 1.1 Read `openspec/specs/mid-turn-prompt-queue/spec.md` end-to-end. Inventory every requirement and scenario.
- [x] 1.2 Apply this change's deltas in `specs/mid-turn-prompt-queue/spec.md` (REMOVED, MODIFIED, ADDED sections). Source of truth lives in the change directory; main `openspec/specs/...` gets rewritten at archive time.
- [x] 1.3 Run `openspec validate honest-mid-turn-queue-surface`. Passes.

## 2. Wire-protocol cleanup — delete dead message types

- [x] 2.1 In `packages/shared/src/browser-protocol.ts`, deleted: `ClearSteeringQueueFromBrowserMessage`, `ClearFollowupSlotFromBrowserMessage`, `EditFollowupSlotFromBrowserMessage`, `EditFollowupEntryFromBrowserMessage`, `RemoveFollowupEntryFromBrowserMessage`, `PromoteFollowupEntryFromBrowserMessage`. Removed each from the discriminated union.
- [x] 2.2 Grep `packages/shared/src` for any remaining references; zero hits.
- [x] 2.3 Deleted six `case` arms in `packages/server/src/browser-gateway.ts` + the import. Also deleted six `handle*` functions in `session-action-handler.ts`.
- [x] 2.4 No dedicated module; handlers inlined in `session-action-handler.ts` (deleted) and `browser-gateway.ts` cases (deleted). Test file `__tests__/session-action-handler-clear-queue.test.ts` deleted.
- [x] 2.5 `tsc -p packages/server --noEmit` and `tsc -p packages/shared --noEmit` clean (pre-existing rootDir/composite warnings unrelated).

## 3. Bridge cleanup — delete dead handlers

- [x] 3.1-3.6 Deleted all six `if (msg.type === "...")` queue-mutation handlers (clear_steering_queue, clear_followup_slot, edit_followup_slot, promote_followup_entry, remove_followup_entry, edit_followup_entry) as a single block.
- [x] 3.7 Deleted `rewriteFollowupQueue` function. Comment marker left in place explaining why.
- [x] 3.8 Deleted the "KNOWN LIMITATION" comment block; replaced with a one-line marker referencing this change + spec.
- [x] 3.9 `shutdown:` arm — deleted two `try { (pi as any).clear*Queue() } catch {}` blocks AND the shadow-reset block AND the `emitQueueUpdate` call. Kept `cachedCtx?.shutdown()` + safety-net `setTimeout`. New comment cites change + spec.
- [x] 3.10 `abort:` arm — deleted both `(pi as any).clear*Queue` try blocks AND the shadow-reset block AND the `emitQueueUpdate` call. Kept `cachedCtx?.abort()` + `retryTracker.noteAbort(sessionId)` + non-clear of usageLimitOrderer. New comment cites change.
- [x] 3.11 Shadow-reset blocks removed in both arms (covered by 3.9 / 3.10). The `handleSessionChange` reset at L1799-1804 stays — session change is a true reset (different pi session, different queue).
- [x] 3.12 `tsc -p packages/extension --noEmit` clean.

## 4. Client cleanup — delete dead action senders

- [x] 4.1-4.6 Deleted all six action creators in `useSessionActions.ts` as a single block; left a marker comment.
- [x] 4.7 Removed the six handlers from the hook's return tuple.
- [x] 4.8 App.tsx destructure updated; no other consumers (the `handleCancelPending` callback for legacy optimistic-prompt is a different surface, left untouched).
- [x] 4.9 `tsc -p packages/client --noEmit` clean.

## 5. Client cleanup — delete dead consumers, yank-to-draft UX, and ChatView plumbing

- [x] 5.1 ChatView.tsx — deleted `onCancelPending?: () => void` prop, deleted from `function ChatView({...})` destructure. Inline steering ghost-bubble rendering kept intact.
- [x] 5.2 App.tsx — removed `onCancelPending={handleCancelPending}` from ChatView call site (other `onCancelPending` reference at L1220 is on CommandInput, a different optimistic-prompt surface, left untouched).
- [x] 5.3 ChatView.tsx — replaced the 14-line "Cancel ✕ removed" comment block with a 6-line caveman-style note pointing to this change + the spec.
- [x] 5.4 QueuePanel.tsx — replaced the 28-line header comment with a 4-line note: "Read-only follow-up cycler. Pi's ExtensionAPI does not expose queue mutation (verified through pi 0.76.0). See spec: mid-turn-prompt-queue."
- [x] 5.5 QueuePanel.tsx — subtitle text updated to "Follow-up — delivered when the agent finishes the turn" (matches spec).
- [x] 5.6 QueuePanel.tsx audited — only two interactive elements: `↑` (queue-followup-prev) and `↓` (queue-followup-next). No mutation buttons.
- [x] 5.7 App.tsx — deleted `wrappedHandleAbort` useCallback (~L825-851) + the explanatory comment block. All three call sites (ChatView, SessionBanner, CommandInput) now pass `onAbort={handleAbort}`.
- [x] 5.8 Grep verified: only one remaining reference to `wrappedHandleAbort` is the explanatory comment that REPLACED the function definition. Zero callable references.

## 6. Tests — delete the dead drain test, rewrite the others as negative assertions

- [x] 6.1 Deleted `bridge-shadow-queue-drain.test.ts` entirely.
- [x] 6.2 Rewrote `bridge-shutdown-reset.test.ts` as negative-assertion model: bridge invokes only `cachedCtx.shutdown()` + safety-net; shadows preserved; `pi.clear*` never called even when present on the mock. 6 tests.
- [x] 6.3 Updated `bridge-abort-orderer.test.ts` header + inline comments to reference honest-mid-turn-queue-surface; existing assertions already correctly verify `orderer.noteRetryEnd` is NOT called (the deleted clear* mention in the comment was the only outdated bit).
- [x] 6.4 `command-handler.test.ts` — assertions were already negative (`.not.toHaveBeenCalled()`); updated stale header comment + reworded the v2-cap-1-dropped explanation to match the new policy.
- [x] 6.5 `QueuePanel.test.tsx` — already verified mutation buttons absent; updated header comment to cite this change + spec. Negative assertions intact for promote/remove/edit/editor/clear test-ids.
- [x] 6.6 `package-queue.integration.test.tsx` — tests the **package install queue** (`usePackageOperations` hook, `packageQueue` lib), unrelated to mid-turn prompt queue (naming collision). Left untouched.
- [x] 6.7 `package-queue.test.ts` — same naming collision; same lib. Left untouched.
- [x] 6.8 New `bridge-no-queue-mutation.test.ts` written. Iterates over all six deleted message types; asserts `pi.sendUserMessage`, `pi.clearSteeringQueue`, `pi.clearFollowUpQueue` not called, shadows unchanged, no `queue_update` emit. Includes a positive control via `send_prompt` to prove the negatives are not vacuous.
- [x] 6.9 Targeted vitest run: 95/95 passing on the touched test files.

## 7. (Reserved) — additional spec deltas captured in change

Spec deltas now cover 9 affected requirements (vs. 4 in the initial draft):

- REMOVED: `Queue panel renders above the chat input` (v1), `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`, `Client renders the PromptQueuePanel` (v2), `Send-while-occupied on follow-up replaces silently`, `Follow-up is a multi-entry queue with cycling navigation` (with mutation), `Session shutdown resets shadow queues and clears pi's native queues`, `User abort resets shadow queues and clears pi's native queues`, `Client restores aborted queue text into the command-input draft`.
- ADDED: `Read-only QueuePanel above CommandInput`, `Read-only follow-up cycling navigation`, `Session shutdown invokes cachedCtx.shutdown directly`, `User abort invokes cachedCtx.abort directly`, `Queue mutation is not exposed by pi`.
- MODIFIED: `Typed-during-streaming prompts are forwarded to pi's native queues`.

No additional task entries needed for the spec deltas themselves (Section 1 covers them). This section is a checkpoint placeholder so subsequent code-deletion tasks (Sections 2-6) reference the right set.

## 8. Documentation + file-index updates

- [x] 8.1-8.4 Delegated to Explore subagent. 8 file-index rows updated in caveman style across `docs/file-index-extension.md`, `docs/file-index-client.md`, `docs/file-index-shared.md`, `docs/file-index-server.md`. Two stale rows fully replaced (QueuePanel.tsx, useSessionActions.ts) since their existing purposes referenced removed surfaces (clear_queue, Clear all button, clearQueue action). The other 6 rows append-only.
- [x] 8.5 No AGENTS.md change (per-file detail, not architectural backbone).

## 9. Upstream pi feature request (non-blocking, tracked)

- [ ] 9.1 (Deferred — not blocking) Draft a GitHub issue for `@earendil-works/pi-coding-agent` requesting `clearSteeringQueue` / `clearFollowUpQueue` exposure on ExtensionAPI. Spec ADDED requirement "Future upstream support is tracked separately" already documents the contract for a future `restore-mid-turn-queue-mutation` change.
- [ ] 9.2 (Deferred) Capture the issue URL in proposal.md after filing.
- [x] 9.3 Change does not block on the upstream issue. Spec requirement captures the future-restore contract.

## 10. Verification

- [x] 10.1 `openspec validate honest-mid-turn-queue-surface` passes.
- [x] 10.2 `tsc -p packages/shared --noEmit` + `tsc -p packages/server --noEmit` + `tsc -p packages/extension --noEmit` + `tsc -p packages/client --noEmit` all clean.
- [x] 10.3 `npm test` — 6507/6509 tests pass. The 2 failures (`bare-import-exports-map.test.ts` for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` resolution) are pre-existing test-env issues unrelated to this change. Negative-assertion test `bridge-no-queue-mutation.test.ts` passes (7/7).
- [ ] 10.4 Manual smoke test (deferred; new change `bridge-owned-followup-queue` will exercise the same UI path).
- [x] 10.5 Grep clean. Only remaining hits to deleted symbols are: (a) explanatory comments in this change's spec/proposal/design files; (b) the negative-assertion test that iterates over deleted message-type strings to verify the bridge ignores them; (c) `dist/` build outputs (regenerated by next build).
- [ ] 10.6 Archive deferred until the follow-up change `bridge-owned-followup-queue` is also implemented (the two should ship together so the dashboard never has a window where mutation is gone with no replacement).
