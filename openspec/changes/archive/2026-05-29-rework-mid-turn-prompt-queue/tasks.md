## §1. Cleanup already in working copy (verified by grep 2026-05-28)

Every task below is `[x]` because the WC already reflects it. Verification commands are included so a reviewer can re-run and confirm. If any verification fails on a future run, flip back to `[ ]` and re-do.

### Wire protocol cleanup

- [x] 1.1 Six wire types deleted from `packages/shared/src/browser-protocol.ts`: `ClearSteeringQueueFromBrowserMessage`, `ClearFollowupSlotFromBrowserMessage`, `EditFollowupSlotFromBrowserMessage`, `EditFollowupEntryFromBrowserMessage`, `RemoveFollowupEntryFromBrowserMessage`, `PromoteFollowupEntryFromBrowserMessage`. Removed from `BrowserToServerMessage` union.
  - Verify: `grep -nE 'ClearSteeringQueue|ClearFollowupSlot|EditFollowupSlot|EditFollowupEntry|RemoveFollowupEntry|PromoteFollowupEntry' packages/shared/src/browser-protocol.ts` → zero hits.
- [x] 1.2 Matching extension wire types deleted from `packages/shared/src/protocol.ts`.
  - Verify: same grep on `protocol.ts` → zero hits.
- [x] 1.3 `tsc -p packages/shared --noEmit` clean.

### Server cleanup

- [x] 1.4 Six case arms deleted from `packages/server/src/browser-gateway.ts`. Matching `handle*` imports removed.
  - Verify: `grep -nE '"clear_steering_queue"|"clear_followup_slot"|"edit_followup_slot"|"edit_followup_entry"|"remove_followup_entry"|"promote_followup_entry"' packages/server/src/browser-gateway.ts` → zero hits.
- [x] 1.5 Six `handle*` functions deleted from `packages/server/src/browser-handlers/session-action-handler.ts`: `handleClearSteeringQueue`, `handleClearFollowupSlot`, `handleEditFollowupSlot`, `handleEditFollowupEntry`, `handleRemoveFollowupEntry`, `handlePromoteFollowupEntry`.
  - Verify: same grep on `session-action-handler.ts` → zero hits.
- [x] 1.6 Test file `packages/server/src/__tests__/session-action-handler-clear-queue.test.ts` deleted.
  - Verify: `ls packages/server/src/__tests__/session-action-handler-clear-queue.test.ts` → no such file.
- [x] 1.7 `tsc -p packages/server --noEmit` clean.

### Bridge cleanup

- [x] 1.8 Six mutation handlers deleted from `bridge.ts` message router: `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`, `edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry`.
  - Verify: `grep -nE '"clear_steering_queue"|"clear_followup_slot"|"edit_followup_slot"|"edit_followup_entry"|"remove_followup_entry"|"promote_followup_entry"' packages/extension/src/bridge.ts` → zero hits.
- [x] 1.9 `rewriteFollowupQueue` function deleted. Comment marker at bridge.ts:281 cites this change.
  - Verify: `grep -n 'rewriteFollowupQueue' packages/extension/src/bridge.ts` → single hit on the comment marker only.
- [x] 1.10 Defensive `(pi as any).clear*Queue?.()` calls in `abort:` and `shutdown:` arms deleted. Single comment marker near L659 explains why.
  - Verify: `grep -nE 'clearFollowUpQueue|clearSteeringQueue|clearAllQueues' packages/extension/src/bridge.ts` → only comment-marker hits, no actual call expressions.
- [x] 1.11 Shadow-reset blocks in `abort:` and `shutdown:` arms removed (pi's queues persist across abort by design; shadows mirror). `handleSessionChange` shadow-reset preserved (session change IS a true reset).
- [x] 1.12 `tsc -p packages/extension --noEmit` clean.

### Client cleanup

- [x] 1.13 Five action senders deleted from `packages/client/src/hooks/useSessionActions.ts`: `clearSteer`, `clearFollow`, `removeFollowUp`, `editFollowUp`, `promoteFollowUp`. Removed from hook return tuple. Comment marker at L96 explains.
  - Verify: `grep -nE 'clearSteer|clearFollow|removeFollowUp|editFollowUp|promoteFollowUp' packages/client/src/hooks/useSessionActions.ts` → only the L96 comment hit.
- [x] 1.14 `wrappedHandleAbort` useCallback + its callers in `App.tsx` deleted. All `onAbort=` sites now pass bare `handleAbort`. Single comment marker at App.tsx:819.
  - Verify: `grep -n 'wrappedHandleAbort' packages/client/src/App.tsx` → only the L819 comment hit.
- [x] 1.15 `onCancelPending` prop + plumbing deleted from `ChatView.tsx`. Steering inline ghost-bubble rendering preserved at L506-558.
  - Verify: `grep -n 'onCancelPending' packages/client/src/components/ChatView.tsx` → only comment hits (L32, L56).
- [x] 1.16 `QueuePanel.tsx` header comment replaced with 4-line note. Subtitle "Follow-up — delivered when the agent finishes the turn". Only `↑`/`↓` cycler controls remain.
- [x] 1.17 `tsc -p packages/client --noEmit` clean.

### Tests

- [x] 1.18 `packages/extension/src/__tests__/bridge-shadow-queue-drain.test.ts` deleted (asserted broken rewrite-via-clear-and-replay).
- [x] 1.19 `bridge-shutdown-reset.test.ts`, `bridge-abort-orderer.test.ts`, `command-handler.test.ts`, `QueuePanel.test.tsx` rewritten as negative assertions: bridge does NOT call `pi.clear*` during shutdown/abort; client does NOT send deleted mutation messages; QueuePanel does NOT render mutation buttons.
- [x] 1.20 New `packages/extension/src/__tests__/bridge-no-queue-mutation.test.ts` iterates the six deleted message-type strings; asserts the bridge ignores them; positive control via `send_prompt`.
  - Verify: `ls packages/extension/src/__tests__/bridge-no-queue-mutation.test.ts` exists.

### Orphan cleanup (added during consolidation research)

- [x] 1.21 Deleted `packages/extension/src/__tests__/bridge-followup-idle-guard.test.ts`. Verified header referenced `rewriteFollowupQueue` (deleted in 1.9) + cited `unify-status-banner-and-terminal-limit-stop`. File removed; subsequent `ls` returns no such file.

### Docs

- [x] 1.22 `docs/file-index-{client,extension,server,shared}.md` rows annotated with `See change: honest-mid-turn-queue-surface`. Two stale rows fully replaced (QueuePanel.tsx, useSessionActions.ts); six other rows append-only.
  - **Re-annotation at archive time**: when this consolidated change archives, the file-index rows currently citing `See change: honest-mid-turn-queue-surface` will need updating to `See change: rework-mid-turn-prompt-queue`. Delegate to a general-purpose subagent per Documentation Update Protocol. See task 5.4.

## §2. Bridge-owned follow-up queue — wire protocol (TODO)

- [x] 2.1 Added `ClearFollowupEntriesFromBrowserMessage` to `packages/shared/src/browser-protocol.ts` with JSDoc citing this change + `indices: number[] | "all"` discriminant.
- [x] 2.2 Added `EditFollowupEntryFromBrowserMessage` with JSDoc "Mutates `bridgeFollowUp` only — no pi call."
- [x] 2.3 Added `RemoveFollowupEntryFromBrowserMessage`. Header comment block flags the name-reuse-with-new-semantics caveat.
- [x] 2.4 Added `PromoteFollowupEntryFromBrowserMessage` with JSDoc "Silent no-op when `index <= 0`."
- [x] 2.5 Added `PullFollowupToEditorFromBrowserMessage` with JSDoc on the `followup_pulled` round-trip.
- [x] 2.6 Added all five to `BrowserToServerMessage` union (lines 1164-1168).
- [x] 2.7 Added `FollowupPulledMessage` server-to-browser + added to `ServerToBrowserMessage` union.
- [x] 2.8 Added five matching `*ToExtensionMessage` types in `packages/shared/src/protocol.ts` + extended `ServerToExtensionMessage` union.
- [x] 2.9 Added `FollowupPulledExtensionToServerMessage` extension-to-server + extended `ExtensionToServerMessage` union.
- [x] 2.10 Audited `bridge-no-queue-mutation.test.ts`: iteration list shrunk from 6 names to 3 (`clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`). The other three (`edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry`) are removed because §2-§3 reuse them with new bridge-buffer-only semantics. Header comment in test explains.
- [x] 2.11 `tsc -p packages/shared --noEmit` clean for our edits. One pre-existing error remains in `error-patterns.test.ts` (untracked, from `unify-status-banner-and-terminal-limit-stop` change — rootDir issue, not caused by this change).

## §3. Bridge-owned follow-up queue — bridge (TODO)

- [x] 3.1 Renamed `recordFollowupSent` → `bufferFollowupSend` in `bridge.ts` with full JSDoc explaining the semantic flip (pre-send buffer, not post-send mirror). `isAgentStreaming` gate kept as defense-in-depth. Image-attachment Known Limitation noted in JSDoc.
- [x] 3.2 Flipped followUp branch in `command-handler.ts` AND in `bridge.ts` `sessionPrompt` fallback. When `wasStreaming && delivery === "followUp"`, the path now ONLY calls `bufferFollowupSend` — `pi.sendUserMessage` is skipped. Steer + idle paths unchanged. `onFollowupSent: bufferFollowupSend` in the bridge → command-handler wiring. Also updated `sendUserMessageWithImages` comment to reflect helper is now steer/idle only. Atomic with 3.1.
- [x] 3.3 Defined `drainFollowupQueue(): void` in `bridge.ts` with all 8 invariants from D2: re-entrancy lock (`isDraining`), idle gate (via `ctxIsIdle()` helper wrapping `cachedCtx?.isIdle?.()`), TUI gate (typeof-guarded `pi.hasPendingMessages()`), empty-buffer gate, pop FIRST (`bridgeFollowUp.shift()`), emit BEFORE send (`emitQueueUpdate()`), single send with no `deliverAs`, catch + drop on pi exception with `console.warn`.
- [x] 3.4 Subscribed `drainFollowupQueue` to `agent_end` via `queueMicrotask(drainFollowupQueue)` at the end of the `agent_end` arm — placed AFTER retry-tracker / usage-limit-orderer synthesis blocks so they run first.
- [x] 3.5 Added all five bridge mutation handlers in the message router (before the fallthrough to `commandHandler.handle(msg)`). Each:
  - `edit_followup_entry`: range-check; replace; emit. Out-of-range → `command_feedback` error event.
  - `remove_followup_entry`: range-check; splice; emit.
  - `promote_followup_entry`: silent no-op for `index <= 0` (no emit); else splice + unshift + emit.
  - `clear_followup_entries`: `"all"` empties buffer (emit only if non-empty); `number[]` sorts descending and splices each, single emit if any actual mutation.
  - `pull_followup_to_editor`: range-check; splice; emit `queue_update`; sends `followup_pulled { sessionId, text }`.
  - NONE call any `pi.*` method. Replaced the prior "Queue-mutation handlers removed" comment block with a new explanation citing this change.
- [x] 3.6 Updated the `message_start` matcher inline comment (around bridge.ts:1265) to document the new no-op-for-buffered-entries behavior. Matcher stays as defense-in-depth for steer + TUI-queued follow-ups + any future direct `sendUserMessage(_, {deliverAs:"followUp"})` path.
- [x] 3.7 `npm run lint` (`tsc --noEmit` workspace-wide) clean. One pre-existing test type issue fixed (`bridge-no-queue-mutation.test.ts` Mock-not-callable error, present before this change). Targeted vitest run: 82/82 passing across bridge-no-queue-mutation, command-handler, bridge-shutdown-reset, bridge-abort-orderer.

## §4. Bridge-owned follow-up queue — server + client (TODO)

### Server forwarders

- [x] 4.1 Added five forwarders to `session-action-handler.ts`: `handleClearFollowupEntries`, `handleEditFollowupEntry`, `handleRemoveFollowupEntry`, `handlePromoteFollowupEntry`, `handlePullFollowupToEditor`. Each gates on `sessionManager.get(msg.sessionId)`; missing-session silently drops. Each forwards the full message shape (including `indices`, `index`, `text`, `images?`) via `piGateway.sendToSession`. Replaced the "Queue-mutation handlers removed" comment with the new explanation citing this change.
- [x] 4.2 Added five `case` arms in `browser-gateway.ts` routing to the new handlers. Imported all five `handle*` symbols. Replaced prior "Queue-mutation cases removed" comment.
- [x] 4.3 Added `followup_pulled` arm in `event-wiring.ts` immediately after the existing `queue_update` arm. Forwards verbatim `{type, sessionId, text}` to subscribers via `browserGateway.sendToSubscribers`. Caches no state — buffer mutation already reflected via `queue_update`.
- [x] 4.4 `npm run lint` clean for server.
- [x] 4.5 Added `packages/server/src/__tests__/session-action-handler-followup-queue.test.ts`. 14 tests across the five handlers: each forwards correctly when session exists; each drops silently when session is unknown. `clear_followup_entries` covered for both `"all"` and `number[]` discriminants. `edit_followup_entry` covered with + without `images`. All 14 passing.

### Client senders + UI + draft hydration

- [x] 4.6 Added five senders to `useSessionActions.ts`: `removeFollowUpEntry`, `editFollowUpEntry`, `promoteFollowUpEntry`, `clearFollowUpEntries`, `pullFollowUpToEditor`. Each gates on `selectedId` and sends the wire message. Added to hook return tuple.
- [x] 4.7 Destructured all five senders in `App.tsx` from `sessionActions` and threaded to `<QueuePanel>` via `onEdit`/`onRemove`/`onPromote`/`onPull`/`onClearAll` props.
- [x] 4.8 Added `case "followup_pulled"` arm in `useMessageHandler.ts`. Added `setDraftForSession` callback to `MessageHandlerDeps` interface; threaded through from `App.tsx`. The merge logic (empty-draft replace, non-empty-draft `\n\n` append) lives in `App.tsx`'s `setDraftForSession` useCallback so it captures the `setDrafts` setter directly. Updated existing test `use-message-handler-pending-prompt.test.ts` to include `setDraftForSession: () => {}` in the deps shape.
- [x] 4.9 Rewrote `QueuePanel.tsx`. Added per-entry chip controls: `[✎]` opens inline textarea editor (Cmd/Ctrl+Enter submits, Esc cancels), `[✕]` removes (with >50-char `window.confirm`), `[⇧]` promotes (disabled when `idx === 0`), `[→ editor]` pulls to draft. Five new `onEdit`/`onRemove`/`onPromote`/`onPull`/`onClearAll` props in the Props interface. Skip dispatch on unchanged edit text.
- [x] 4.10 Added header `[✖️]` clear-all button shown only when `total > 1`, dispatches `onClearAll`.
- [x] 4.11 Props wired from App.tsx → QueuePanel for all five callbacks.
- [x] 4.12 Replaced `QueuePanel.tsx` header docblock: "Follow-up queue panel — bridge-owned mutation surface restored." Lists the four entry buttons + clear-all. Cites this change. Reaffirms steer-permanent-pi-owned rule.
- [x] 4.13 `npm run lint` clean. (Note: existing `QueuePanel.test.tsx` from §1 now FAILS because it asserts mutation buttons ABSENT — those negative assertions will be replaced with positive assertions in §5.4.)

## §5. Tests + verification (TODO)

### Tests

- [x] 5.1 Created `bridge-followup-queue-drain.test.ts` with 14 tests across all 8 D2 invariants: pop-before-send (3 call-order assertions), one-per-agent_end (2), idle gate, TUI gate, hasPendingMessages-absent fallback, empty-buffer gate, pi-throws drop (2), re-entrancy lock. All passing.
- [x] 5.2 Created `bridge-followup-mutation.test.ts` with 11 tests across edit / remove / promote / clear-all / clear-specific-indices / pull + out-of-range → command_feedback. `assertNoPiCalls` helper verifies ZERO pi.sendUserMessage / pi.clearSteeringQueue / pi.clearFollowUpQueue calls across all handlers. All passing.
- [x] 5.3 Updated `command-handler.test.ts`: ADDED new test "passthrough followUp while STREAMING buffers in bridge and skips pi.sendUserMessage" (asserts pi.sendUserMessage NOT called + onFollowupSent IS called). Renamed existing test → "passthrough followUp on IDLE session forwards to pi (no buffer)". 71/71 passing.
- [x] 5.4 Rewrote `QueuePanel.test.tsx`: 23 positive-assertion tests across 7 describe blocks — basic rendering, cycler navigation, promote (with disabled-at-0), remove (with >50-char confirm: accept + cancel), edit (Cmd+Enter, Ctrl+Enter, Esc, Save button, unchanged-skip), pull-to-editor, clear-all (visibility gated on length > 1), index clamping. All passing.
- [x] 5.5 Created `followup-pulled-draft-merge.test.ts`. 6 tests: empty-replace, whitespace-only-replace, append-with-\n\n, multi-line draft preservation, empty-pulled-no-op, multi-pull accumulation.
- [x] 5.6 Verified `bridge-no-queue-mutation.test.ts` iteration list audited (task 2.10): three names reused with new semantics removed; test now iterates only the 3 permanently-deleted names. 9/9 passing.
- [x] 5.7 Targeted vitest run across 11 affected files: 152/152 passing.
- [x] 5.8 Full `npm test`: 6559/6582 passing (21 skipped, 2 failures). The 2 failures (`bare-import-exports-map.test.ts` resolving `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` against test node_modules) are PRE-EXISTING, unrelated to this change.

### Documentation + file-index

- [x] 5.9 Delegated to general-purpose subagent per Documentation Update Protocol. 11 rows updated across 4 file-index files in caveman style: `docs/file-index-shared.md` (browser-protocol.ts + protocol.ts), `docs/file-index-server.md` (session-action-handler.ts + browser-gateway.ts + event-wiring.ts), `docs/file-index-extension.md` (bridge.ts + command-handler.ts), `docs/file-index-client.md` (QueuePanel.tsx + useSessionActions.ts + useMessageHandler.ts + App.tsx). All prior `See change:` annotations preserved. Subagent flagged mixed-paths inconsistency in `docs/file-index-client.md` (QueuePanel.tsx keyed by `packages/client/...` vs other client rows using `src/client/...`) — out of scope; future cleanup.
- [x] 5.10 No `AGENTS.md` change (per-file detail; AGENTS.md Rule 0).

### Verification

- [x] 5.11 `openspec validate rework-mid-turn-prompt-queue` → "Change 'rework-mid-turn-prompt-queue' is valid".
- [x] 5.12 `npm run build` succeeded across all packages. Vite chunk-size warnings present but pre-existing.
- [x] 5.13 Manual smoke test PASSED against live pi session (claude-haiku-4-5):
  - Queued 3 follow-ups while agent ran `sleep 8 && echo done`. Panel showed "3 OF 3" indicator with cycler.
  - On agent_end, drain ran 3 times in FIFO order. Keeper log confirms:
    - `drainFollowupQueue v3: pi idle confirmed, calling sendUserMessage (no deliverAs, remaining=2)` → FU_1 delivered
    - `drainFollowupQueue v3: ...remaining=1` → FU_2 delivered
    - `drainFollowupQueue v3: ...remaining=0` → FU_3 delivered
  - Each follow-up emitted its own `agent_start → message_start (user) → assistant response → agent_end` cycle.
  - Cache prefix stayed hot across all 3 (cacheRead~15000 tokens each); cost-per-followup matches TUI-style continuation byte-for-byte.
  - TUI coexistence + `/reload` clears bridgeFollowUp not directly verified in this smoke (covered by D6/D7 unit tests).
- [x] 5.14 `ls packages/extension/src/__tests__/bridge-followup-idle-guard.test.ts` returns no such file (verified at task 1.21).

### Post-smoke implementation fix (drain semantics)

The drain function's design in `design.md` D2 went through three iterations after smoke testing exposed real pi-lifecycle behavior that the original design did not account for:

- [x] 5.16 Post-smoke fix #1 — isIdle gate removed initially. Smoke showed `ctx.isIdle()` returns `false` at microtask time even though `agent_end` already fired (pi's `finishRun()` runs in the lifecycle's `finally` block AFTER the executor returns; the microtask runs INSIDE the executor). Gating on it blocked drain entirely.
- [x] 5.17 Post-smoke fix #2 — tried `pi.sendUserMessage(entry, { deliverAs: "followUp" })`. Pi accepted the message (no "Agent is already processing" error) but the message went into `Agent.followUpQueue` which is read only inside the `runAgentLoop` via `getFollowUpMessages()` callback. Since the loop had already exited, the queued entry never drained.
- [x] 5.18 Post-smoke fix #3 — FINAL: `setTimeout(drainFollowupQueue, 0)` instead of `queueMicrotask` (escapes the executor, lets `finishRun()` flip `isStreaming=false`); inside drain, poll `ctx.isIdle()` with bounded retry (~100ms granularity, 2s cap); call `pi.sendUserMessage(entry)` with NO `deliverAs` so pi starts a fresh `prompt()` run. Verified end-to-end in browser smoke + keeper logs.
- [x] 5.19 Bridge code at `packages/extension/src/bridge.ts` `drainFollowupQueue` reflects v3 implementation. Tests at `packages/extension/src/__tests__/bridge-followup-queue-drain.test.ts` updated to assert v3 invariants (no `deliverAs`, isIdle retry semantics). All 12 drain tests + 11 mutation tests + full extension suite passing.

### Pull-to-editor removal (user direction)

- [x] 5.20 Pull-to-editor button removed per user direction during smoke testing ("we don't need the move to editor!"). Surgical rip-out:
  - `QueuePanel.tsx`: removed `[→ editor]` button + `onPull` prop + `mdiPencilBoxOutline` icon import
  - `useSessionActions.ts`: removed `pullFollowUpToEditor` sender
  - `App.tsx`: removed `setDraftForSession` useCallback + sender plumbing
  - `useMessageHandler.ts`: removed `case "followup_pulled"` arm + `setDraftForSession` from `MessageHandlerDeps`
  - `bridge.ts`: removed `pull_followup_to_editor` handler
  - `session-action-handler.ts`: removed `handlePullFollowupToEditor`
  - `browser-gateway.ts`: removed `case "pull_followup_to_editor"`
  - `event-wiring.ts`: removed `followup_pulled` forwarding arm
  - `browser-protocol.ts`: removed `PullFollowupToEditorFromBrowserMessage` + `FollowupPulledMessage`
  - `protocol.ts`: removed `PullFollowupToEditorToExtensionMessage` + `FollowupPulledExtensionToServerMessage`
  - Test files updated; deleted `followup-pulled-draft-merge.test.ts`.

- [x] 5.15 Archive `rework-mid-turn-prompt-queue` via `openspec archive`. The two SUPERSEDED dirs in `openspec/changes/archive/` stay as historical record.
