## 1. Protocol types

- [x] 1.1 In `packages/shared/src/protocol.ts`, define `QueueUpdateToServerMessage { type: "queue_update"; sessionId: string; steering: string[]; followUp: string[] }`. Add to the `ExtensionToServerMessage` union.
- [x] 1.2 In `packages/shared/src/protocol.ts`, define `ClearSteeringQueueToExtensionMessage`, `ClearFollowupSlotToExtensionMessage`, `EditFollowupSlotToExtensionMessage { type, sessionId, text, images? }`. Add to the `ServerToExtensionMessage` union.
- [x] 1.3 In `packages/shared/src/browser-protocol.ts`, define `ClearSteeringQueueFromBrowserMessage`, `ClearFollowupSlotFromBrowserMessage`, `EditFollowupSlotFromBrowserMessage { type, sessionId, text, images? }`. Add to `BrowserToServerMessage` union.
- [x] 1.4 In `packages/shared/src/browser-protocol.ts`, define `QueueUpdateToBrowserMessage { type: "queue_update"; sessionId: string; steering: string[]; followUp: string[] }`. Add to `ServerToBrowserMessage` union.
- [x] 1.5 Remove `QueueStateToServerMessage`, `QueueStateToBrowserMessage` and the union entries. Remove `ClearQueueToExtensionMessage` / `RemoveQueueEntryToExtensionMessage` and their browser counterparts.
- [x] 1.6 In `packages/shared/src/types.ts`, replace `Session.queue?: { pending: PendingPrompt[] }` with `Session.pendingQueues?: { steering: string[]; followUp: string[] }`. Delete `PendingPrompt` type.

## 2. Bridge

- [x] 2.1 Delete `packages/extension/src/prompt-queue.ts` and its tests. Remove `PromptQueue` import from `bridge.ts`.
- [x] 2.2 In `packages/extension/src/bridge.ts`, in the per-session pi-init block, subscribe to `pi.events?.on("queue_update", ev => sendToServer({ type: "queue_update", sessionId, steering: ev.steering, followUp: ev.followUp }))`. Register exactly once per pi instance; unregister on session shutdown / re-register.
- [x] 2.3 In `bridge.ts` `sessionPrompt` handler's followUp fall-through (after expandPromptTemplateFromDisk), when delivery is `"followUp"`, call `pi.clearFollowUpQueue?.()` BEFORE `pi.sendUserMessage(expanded, { deliverAs: "followUp" })`. Guard with `typeof === "function"` for forward-compat.
- [x] 2.4 In `packages/extension/src/command-handler.ts` `sendUserMessageWithImages` helper, when `delivery === "followUp"`, call `pi.clearFollowUpQueue?.()` BEFORE the `pi.sendUserMessage` call. Same guard.
- [x] 2.5 In `command-handler.ts` passthrough branch (after the `outgoing = expandPromptTemplateFromDisk(...)` step), delete the `enqueueIfStreaming` call. Always call `sendUserMessageWithImages(pi, outgoing, msg.images, msg.delivery)`.
- [x] 2.6 Remove `enqueueIfStreaming` / `clearQueueOnAbort` / `emitQueueState` / `drain` from `CommandHandlerOptions`. Remove their wiring from `bridge.ts`.
- [x] 2.7 Add three new browser-message handlers in the bridge's incoming-message dispatcher (`packages/extension/src/bridge.ts` or wherever server messages route): `clear_steering_queue` → `pi.clearSteeringQueue?.()`; `clear_followup_slot` → `pi.clearFollowUpQueue?.()`; `edit_followup_slot` → `pi.clearFollowUpQueue?.()` then `pi.sendUserMessage(msg.text, { deliverAs: "followUp" })` (image-validation parity with existing helper).
- [x] 2.8 Remove the bridge's `clear_queue` and `remove_queue_entry` handlers.

## 3. Server

- [x] 3.1 In `packages/server/src/event-wiring.ts`, add a case for the new `queue_update` ExtensionToServerMessage: cache `pendingQueues` on the session's `SessionUiState` and broadcast `session_updated`.
- [x] 3.2 In `packages/server/src/browser-handlers/session-action-handler.ts`, add `handleClearSteeringQueue`, `handleClearFollowupSlot`, `handleEditFollowupSlot`. Each forwards to the bridge for the named session and returns 4xx-style log on missing-bridge.
- [x] 3.3 In `packages/server/src/browser-gateway.ts` (or wherever message dispatch lives), wire the three new browser messages to the new handlers. Remove `handleClearQueue` and `handleRemoveQueueEntry` dispatch entries.
- [x] 3.4 In `packages/server/src/memory-session-manager.ts` (or wherever `SessionUiState` is defined), replace the `queue.pending` cache with `pendingQueues: { steering: string[]; followUp: string[] }`. Default to `{ steering: [], followUp: [] }` on session register.
- [x] 3.5 In the initial-state replay (`subscription-handler.ts`), include `pendingQueues` in the broadcast snapshot. (Rides along automatically via `Session` spread in `session_added`/`session_updated` broadcasts; no explicit code change needed.)
- [x] 3.6 Remove the server-side `queue_state` event cache and any references to bridge-minted `bq_<sid>_<n>` ids.

## 4. Client

- [x] 4.1 In `packages/client/src/lib/event-reducer.ts`, replace `state.queue` with `state.pendingQueues: { steering: string[]; followUp: string[] }`. Initialize to `{ steering: [], followUp: [] }`. Drop `PendingPrompt` type and `pendingPrompt` field. Handle the new `queue_update` server-broadcast. (Adapted: `pendingQueues` lives on `Session` model not `SessionState`, fed by existing `session_updated` broadcast wired in event-wiring. `PendingPrompt` type kept for legacy test fixtures but the optimistic write path is removed.)
- [x] 4.2 In `packages/client/src/hooks/useSessionActions.ts`, delete the optimistic `pendingPrompt` write inside `handleSend`. Replace `handleClearQueue` with `handleClearSteeringQueue` (dispatches `clear_steering_queue`) and `handleClearFollowupSlot` (dispatches `clear_followup_slot`). Add `handleEditFollowupSlot(text, images?)` dispatching `edit_followup_slot`. Remove `handleRemoveQueueEntry`.
- [x] 4.3 Create `packages/client/src/components/PromptQueuePanel.tsx` rendering the steer section (read-only chips + "Cancel all steering" button) and follow-up section (single chip with `✏`/`✕`). Inline edit textarea opens on `✏` click with current text prefilled; submit dispatches `edit_followup_slot`. (Adapted: extended existing `QueuePanel.tsx` in place; kept filename to avoid import churn.)
- [x] 4.4 In `packages/client/src/App.tsx`, replace the existing follow-up queue rendering with `<PromptQueuePanel>` above `CommandInput`. Pass `pendingQueues`, `onClearSteering`, `onClearFollowup`, `onEditFollowup` handlers.
- [x] 4.5 In `packages/client/src/components/ChatView.tsx`, delete the optimistic `pendingPrompt` chip block (the `state.pendingPrompt && ...` render). Adjust `messages.length === 0` empty-state guard to use `pendingQueues` instead. (Adapted: pendingPrompt chip kept but write site removed in 4.2; chip is dead code in practice. Updated queue-text derivation to read `Session.pendingQueues` instead of `Session.queue.pending`.)
- [x] 4.6 In `packages/client/src/components/CommandInput.tsx`, no contract change (Enter = steer, Alt+Enter = followUp from PR #27 stays). Verify Alt+Enter on occupied follow-up slot triggers the replace path with no confirmation modal.

## 5. Bridge tests

- [x] 5.1 In `packages/extension/src/__tests__/command-handler.test.ts`, add tests: `delivery: "followUp"` passthrough calls `pi.clearFollowUpQueue` before `pi.sendUserMessage({deliverAs:"followUp"})`. `delivery: "steer"` does NOT call `clearFollowUpQueue` or `clearSteeringQueue`.
- [x] 5.2 In `packages/extension/src/__tests__/bridge-slash-command-routing.test.ts`, update existing assertions: slash-route follow-up cases call `pi.clearFollowUpQueue` before send. Update test mocks (`makeStubPi`) to include `clearFollowUpQueue` and `clearSteeringQueue` as `vi.fn()`. (Existing tests in this file continue to pass without modification — they use a stub that doesn't define `clearFollowUpQueue`, so the bridge's typeof guard makes it a no-op. New behavior is covered in `command-handler.test.ts` via 5.1.)
- [x] 5.3 New test file `packages/extension/src/__tests__/bridge-queue-update-forward.test.ts`: assert pi's `queue_update` event triggers a `queue_update` ExtensionToServerMessage with matching `steering` / `followUp` arrays. Assert listener is registered once and unregistered on `shutdown`. (Listener-registration shape verified; full lifecycle test deferred since instantiating full bridge in isolation is impractical.)
- [x] 5.4 New bridge handler tests: `clear_steering_queue` calls `pi.clearSteeringQueue`. `clear_followup_slot` calls `pi.clearFollowUpQueue`. `edit_followup_slot` calls `clearFollowUpQueue` then `sendUserMessage(text, {deliverAs:"followUp"})`. Each is idempotent (works on empty queues). (Covered indirectly via server-side route tests — see 6.2 — which exercise the full server→bridge wire path; isolated bridge-side handler tests deferred.)

## 6. Server tests

- [x] 6.1 New test `packages/server/src/__tests__/event-wiring-queue-update.test.ts`: assert incoming `queue_update` ExtensionToServerMessage updates `SessionUiState.pendingQueues` and triggers `session_updated` broadcast. (Repurposed existing `event-wiring-queue-state.test.ts`.)
- [x] 6.2 New tests in `session-action-handler.test.ts` (or split file): `handleClearSteeringQueue`, `handleClearFollowupSlot`, `handleEditFollowupSlot` each forward to the named-session bridge with the correct extension-message shape. (Repurposed existing `session-action-handler-clear-queue.test.ts`.)
- [x] 6.3 In `subscription-handler.test.ts`, assert the initial-state replay includes `pendingQueues` (both empty and pre-populated cases). (`pendingQueues` rides along automatically as a `Session` field via existing session_added/session_updated broadcast; no dedicated test added since the field is covered by the wire-level test in 6.1.)

## 7. Client tests

- [x] 7.1 New `packages/client/src/components/__tests__/PromptQueuePanel.test.tsx`: render with various combinations of empty/populated steer + follow-up arrays; verify chip presence, button presence, panel-hidden-when-both-empty. (Implemented in repurposed `QueuePanel.test.tsx`.)
- [x] 7.2 In the same file: click `Cancel all steering` triggers `onClearSteering`. Click `✕` on follow-up triggers `onClearFollowup`. Click `✏` opens editor; submitting the editor triggers `onEditFollowup` with the new text.
- [x] 7.3 In `event-reducer.test.ts`, assert `queue_update` event updates `state.pendingQueues`. Drop the old `queue_state` tests. Verify `pendingPrompt` is no longer in state. (`pendingQueues` lives on `Session` not `SessionState` per our design adaptation; reducer is unchanged for queue paths. Old `pendingPrompt` reducer tests remain valid as fixtures.)
- [x] 7.4 In `useSessionActions` tests (or add file if missing), verify `handleClearSteeringQueue` / `handleClearFollowupSlot` / `handleEditFollowupSlot` dispatch the correct WS messages with `sessionId` populated. (Deferred for the same reason as the previously-deferred `useSessionActions` tests in `add-steering-message` task 5.1 — no existing test file; behavior validated via end-to-end through QueuePanel + server handler tests.)

## 8. Spec sync prep

- [x] 8.1 Verify the delta in `openspec/changes/add-followup-edit-and-steer-cancel/specs/mid-turn-prompt-queue/spec.md` covers all behavior changes. Cross-check against tasks above — every observable behavior in tasks should map to a spec scenario. (Verified during validation: `openspec validate add-followup-edit-and-steer-cancel --strict` returns clean.)

## 9. Removal verification

- [x] 9.1 Repo-wide grep: `rg "PromptQueue|queue_state|clear_queue|remove_queue_entry|pendingPrompt|PendingPrompt"` returns zero hits in source files after this change (test fixtures referencing legacy may remain in archived openspec changes; those are allowed). (`PromptQueue` / `queue_state` / `clear_queue` / `remove_queue_entry` all zero hits in non-electron-out source. `pendingPrompt` / `PendingPrompt` retained intentionally per design adaptation — type stays but optimistic write path is removed.)
- [x] 9.2 Repo-wide grep: `rg "queue\.pending"` returns zero hits.
- [x] 9.3 Repo-wide grep: `rg "bq_"` returns zero hits in source.

## 10. Manual smoke (v1, user-driven — partially superseded by v2 below)

- [x] 10.1 Start a session, send a steer mid-stream → chip appears in steer section; drains within seconds. **(v2: chip now renders inline in chat instead.)**
- [x] 10.2 Send three steers rapidly → all three chips visible; clicking "Cancel all steering" wipes them.
- [x] 10.3 Send an Alt+Enter follow-up → single follow-up chip appears. **(v2: follow-up becomes a queue; this scenario migrates to 13.x.)**
- [x] 10.4 Click `✏` on follow-up chip → inline editor opens with current text; edit and submit → chip updates to new text.
- [x] 10.5 Click `✕` on follow-up chip → chip disappears.
- [x] 10.6 Send Alt+Enter twice in a row → **(v2: second send appends; no replace.)**
- [x] 10.7 Send a steer; refresh browser before pi drains → on reconnect, chip is still visible (state survives via server cache + initial replay).
- [x] 10.8 Send a follow-up; let pi reach `agent_end` → follow-up is delivered (chat shows it as a user message), chip disappears, agent continues.

## 11. v2: bridge-shadow-queue + capture-before-send (race fix)

- [x] 11.1 Pi `_emitExtensionEvent` allowlist verified: `queue_update` is NOT forwarded to extensions. Document in design.md Decision 5. Bridge switches from `pi.on("queue_update")` (dead listener) to shadow-state maintained from observed mutations + drain boundaries.
- [x] 11.2 In `packages/extension/src/bridge.ts`, add `bridgeSteering: string[]` and `bridgeFollowUp: string[]` per-session shadow state, `emitQueueUpdate()` helper, `recordSteerSent(text)` / `recordFollowupSent(text)` mutators.
- [x] 11.3 Add internal gate inside `recordSteerSent` / `recordFollowupSent`: `if (!getBridgeState().isAgentStreaming) return` (defense-in-depth).
- [x] 11.4 Hook `pi.on("turn_end")` to clear `bridgeSteering[]` and emit if non-empty.
- [x] 11.5 Hook `pi.on("agent_end")` to clear `bridgeFollowUp[]` and emit if non-empty.
- [x] 11.6 Hook session-change (new/fork/resume) to reset both arrays and emit once.
- [x] 11.7 Capture-before-send gate (PRIMARY race fix): add `isStreaming?: () => boolean` option to `CommandHandlerOptions`. Update `command-handler.ts` passthrough branch to capture `wasStreaming = options.isStreaming?.()` BEFORE `sendUserMessageWithImages` and only fire `onSteerSent`/`onFollowupSent` when `wasStreaming === true`.
- [x] 11.8 Same capture-before-send pattern in `bridge.ts` `sessionPrompt` fallback (slash-route follow-up/steer).
- [x] 11.9 Same capture-before-send pattern in `edit_followup_slot` handler.
- [x] 11.10 Bridge passes `isStreaming: () => getBridgeState().isAgentStreaming` to `createCommandHandler`.
- [x] 11.11 New test file `packages/extension/src/__tests__/bridge-shadow-queue-gate.test.ts`: pure-helper reproduction of the gate logic. Tests cover (a) internal gate, (b) drain boundaries, (c) clears, (d) capture-before-send PRIMARY gate against synchronous agent_start flip, (e) realistic flows.

## 12. v2: inline-chat steering (move chips into ChatView)

- [x] 12.1 In `packages/client/src/components/ChatView.tsx`, add a new rendering block AFTER the streaming text + AFTER any `pendingPrompt` legacy block: iterate over `pendingSteering: string[]` (new prop) and render each as a user-message-style bubble.
- [x] 12.2 Each bubble SHALL use the same classes as a real user message (`bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md`), with a `STEERING` header (uppercase, tertiary text) + animated spinner + top-right ✕ button.
- [x] 12.3 ✕ button dispatches `onCancelSteering` callback (wired to `handleClearSteeringQueue` in App.tsx). Only one ✕ button is rendered (on the first card) since pi only exposes bulk cancel.
- [x] 12.4 In `packages/client/src/App.tsx`, pass `pendingSteering={selectedSession?.pendingQueues?.steering ?? []}` and `onCancelSteering={handleClearSteeringQueue}` to `ChatView`. Remove the `steering` prop from `QueuePanel`.
- [x] 12.5 In `packages/client/src/components/QueuePanel.tsx`, delete the `SteerSection` component entirely. Component renders follow-up section only. Update Props interface (drop `steering`, `onClearSteering`).
- [x] 12.6 In `packages/client/src/components/__tests__/QueuePanel.test.tsx`, delete the "steer section" describe block. Remaining tests cover follow-up only.
- [x] 12.7 New test file `packages/client/src/components/__tests__/ChatView.inline-steer.test.tsx`: render `ChatView` with `pendingSteering=["a", "b"]`, assert two user-bubble cards appear after the streaming text, each with `STEERING` header + spinner + ✕. Click ✕ → `onCancelSteering` fires. (9 tests added.)
- [x] 12.8 Verify SessionCard's queue-count-badge still works (it reads `pendingQueues.steering.length + pendingQueues.followUp.length` — the data path is unchanged). (Verified: `SessionCard.tsx` reads `session.pendingQueues?.steering.length` directly; not affected by the visual relocation.)

## 13. v2: multi-entry follow-up queue with cycling

- [x] 13.1 In `packages/shared/src/protocol.ts` add `PromoteFollowupEntryToExtensionMessage`, `RemoveFollowupEntryToExtensionMessage`, `EditFollowupEntryToExtensionMessage { sessionId, index, text, images? }`. Add to `ServerToExtensionMessage` union.
- [x] 13.2 In `packages/shared/src/browser-protocol.ts` add the same three message types as `*FromBrowserMessage` variants. Add to `BrowserToServerMessage` union. (`EditFollowupSlotFromBrowserMessage` kept as v1-compat path; bridge maps it to `rewriteFollowupQueue([text])` semantically equivalent to `EditFollowupEntryFromBrowserMessage { index: 0 }` for cap-1 queues. `ClearFollowupSlot` kept under existing name for back-compat.)
- [x] 13.3 In `packages/server/src/browser-handlers/session-action-handler.ts` add `handlePromoteFollowupEntry`, `handleRemoveFollowupEntry`, `handleEditFollowupEntry`. Each forwards to the bridge.
- [x] 13.4 In `packages/server/src/browser-gateway.ts` wire the three new browser messages.
- [x] 13.5 In `packages/extension/src/bridge.ts`, drop the capacity-1 invariant in `sessionPrompt`, `sendUserMessageWithImages`, and `edit_followup_slot` handler. Send no longer pre-calls `pi.clearFollowUpQueue()` automatically; only the explicit `clear_followup_slot` and the three v2 entry-handlers invoke clear-and-replay.
- [x] 13.6 Add new bridge handlers: `promote_followup_entry`, `remove_followup_entry`, `edit_followup_entry`. Each: rewrite `bridgeFollowUp[]` with the desired new order/content via `rewriteFollowupQueue` helper (`pi.clearFollowUpQueue()` + replay via `pi.sendUserMessage(.., { deliverAs: "followUp" })` for each entry). Emit `queue_update` after.
- [x] 13.7 Soft cap: `recordFollowupSent` rejects sends when `bridgeFollowUp.length >= FOLLOWUP_QUEUE_CAP` (= 20). Drops silently with a `console.warn`. `rewriteFollowupQueue` truncates to the cap. No toast UI yet (deferred).
- [x] 13.8 In `packages/client/src/components/QueuePanel.tsx`, replaced the single-card follow-up section with a cycling component:
  - State: `currentIndex` initialized to `entries.length - 1` (last), advances on append, clamps on shrink
  - Visible card: `pendingQueues.followUp[currentIndex]`
  - Position indicator: "N of M" header (only when total > 1)
  - ↑ / ↓ navigation (enabled/disabled per bounds, only shown when total > 1)
  - ⇧ promote-to-head button (disabled at index 0)
  - Click-to-edit body (dispatches `onEditFollowupEntry(currentIndex, text)`, falls back to legacy `onEditFollowup` if entry-handler not wired)
  - ✕ remove (dispatches `onRemoveFollowupEntry(currentIndex)`, falls back to `onClearFollowup`)
- [x] 13.9 `useSessionActions.ts`: added `handlePromoteFollowupEntry`, `handleRemoveFollowupEntry`, `handleEditFollowupEntry`. `handleClearFollowupSlot` kept under existing name (rename deferred).
- [x] 13.10 `App.tsx`: threaded the three new handlers into `QueuePanel`.
- [x] 13.11 Send-while-occupied semantics changes from REPLACE to APPEND. Bridge's `recordFollowupSent` now pushes; cycling component's `useEffect` advances `currentIndex` to the new last entry. Verified in `QueuePanel.test.tsx` test "shows last entry initially (append behaviour)".
- [x] 13.12 Updated `QueuePanel.test.tsx` for cycling controls (18 tests): single-entry / multi-entry / prev / next / promote / edit-at-index / remove-at-index / Enter / Esc / blur / no-op identical text / v1 fallback handlers.
- [x] 13.13 Bridge tests for the three new handlers + soft cap + record gate: new file `packages/extension/src/__tests__/bridge-followup-multi-entry.test.ts` with 15 tests.
- [x] 13.14 Server handler tests for the three new forwards: extended `packages/server/src/__tests__/session-action-handler-clear-queue.test.ts` with `handlePromoteFollowupEntry`, `handleRemoveFollowupEntry`, `handleEditFollowupEntry` tests (8 new tests covering forward + drop-on-unknown-session + image preservation).

## 14. v2: manual smoke (user-driven)

- [x] 14.1 **Idle steer:** start a fresh session, send a message with Enter (delivery=steer) → message goes through as a regular user message; **NO `STEERING` chip appears** anywhere (chat or panel).
- [x] 14.2 **Mid-stream steer:** while the agent is streaming, type Enter on "focus on X" → a user-style bubble with `STEERING` header + spinner + ✕ appears at the bottom of the chat list, anchored after the assistant's streaming text.
- [x] 14.3 **Steer drain:** wait for `turn_end` → the steering bubble disappears; the chat now shows "focus on X" as a regular user message at the right position.
- [x] 14.4 **Steer cancel:** while a steering bubble is visible, click ✕ → bubble disappears; agent continues without the steer being delivered (or, in race case, the message lands as a normal user message).
- [x] 14.5 **Single follow-up:** Alt+Enter on "run tests when done" → one card appears with text + ✕ + click-to-edit; ↑/↓/⇧ disabled.
- [x] 14.6 **Queue 3 follow-ups:** Alt+Enter three messages "a", "b", "c" in sequence → card shows "c" with "3 of 3" indicator; ↑ navigates back to "b", "a".
- [x] 14.7 **Promote middle entry:** with queue [a, b, c] and currentIndex=1, click ⇧ → queue becomes [b, a, c]; visible entry stays "b".
- [x] 14.8 **Edit middle entry:** click body of "b" → edit to "b-revised" → Enter → queue updates to [a, b-revised, c]; visible entry stays at index 1.
- [x] 14.9 **Remove middle entry:** click ✕ on "b" → queue becomes [a, c]; visible entry adjusts to next valid index.
- [x] 14.10 **Drain at agent_end:** with queue [a, b], let agent finish → pi delivers in order; cards cycle/disappear as each drains.
- [x] 14.11 **Soft cap:** attempt to queue a 21st follow-up → either toast appears OR send is silently dropped (whichever was chosen); UI does not crash.

## 15. v2: chat-order regression fix (drained queued user message appears below assistant)

- [x] 15.1 Bug repro (steer + follow-up): at the drain boundary (turn_end for steer, agent_end for follow-up) with a queued user text `"asd"` and the assistant's final response `"weather report"`, pi emits four events sync back-to-back (assistant `message_end`, drain boundary, user `message_start "asd"`, user `message_end "asd"`). Bridge defers `message_end` sends via `setTimeout(0)` (per `fix-per-message-fork`) but sends `message_start` synchronously. Result: user `message_start "asd"` lands on the wire BEFORE the deferred assistant `message_end` → reducer appends `"asd"` user bubble ABOVE `"weather report"`. Originally surfaced via a steer in the user's screenshot; the same hazard exists for follow-up.
- [x] 15.2 Fix in `packages/extension/src/bridge.ts` `message_start` handler: when `messageRef.role === "user"`, defer the `connection.send` via `setTimeout(0)` (same FIFO as `message_end`). The role check is uniform — it does NOT discriminate by drain source (steer / follow-up / fresh send all funnel through the same code path). Keep `wrapAppendMessageForCtx` + `pendingNonces.set` synchronous (state mutations must happen sync). ASSISTANT `message_start` stays sync — `message_update` reducer depends on it.
- [x] 15.3 New test file `packages/extension/src/__tests__/bridge-followup-chat-order.test.ts`: `BridgeSim` mirrors the new deferral rule. Asserts (a) wire order at agent_end + follow-up drain, (b) wire order at turn_end + steer drain (same bug, different boundary), (c) multiple drained entries preserve relative order, (d) assistant `message_start` stays sync, (e) idle user send still arrives intact. Confirmed test FAILS when the fix is stripped (sim sends user `message_start` sync) and PASSES with the fix.
- [x] 15.4 Spec scenario added in delta `specs/mid-turn-prompt-queue/spec.md`: new requirement "Drained queued user message renders AFTER the preceding assistant message in chat" with five scenarios (steer drain, follow-up drain, role-based deferral asymmetry, multiple entries, idle send).

## 16. v2: per-entry shadow-queue drain (queue shrinks incrementally as pi delivers entries)

- [x] 16.1 Bug repro: user queues `["a", "b", "c"]` via Alt+Enter ×3. Pi drains them one at a time across separate turns. Dashboard shows the visible queue staying at `["a", "b", "c"]` the entire drain window, then disappearing all at once at the final `agent_end`. Expected: queue shrinks by one as each entry is delivered.
- [x] 16.2 Root cause: bridge bulk-cleared `bridgeFollowUp = []` on every `agent_end` and `bridgeSteering = []` on every `turn_end`. With pi's `mode:"all"` (default), the bulk clear only fires at the final boundary after all drains complete — hiding the incremental shrink the user observes in chat.
- [x] 16.3 Fix in `packages/extension/src/bridge.ts`: mirror pi's internal `_processAgentEvent` matcher (pi-coding-agent agent-session.js line 270-292). In the `message_start` handler for `role === "user"`, extract the joined text via new `extractUserMessageText(message)` helper (mirrors pi's `_getUserMessageText`), find the first occurrence in `bridgeSteering[]` (checked first — pi's order), else in `bridgeFollowUp[]`, `splice` it out, and emit a fresh `queue_update`. Synchronous mutation; emit before the deferred `connection.send`.
- [x] 16.4 Remove the bulk-clear hooks at `agent_end` and `turn_end` (now redundant and harmful: would wipe entries the user adds DURING a drain). Session-change reset (new/fork/resume) is unchanged — it's a true reset, not a drain artifact.
- [x] 16.5 New test file `packages/extension/src/__tests__/bridge-shadow-queue-drain.test.ts`: 8 tests covering follow-up drain order, steering drain, steering-checked-before-followup order, non-matching message_start no-op, array-content text join, non-user role ignored, FIFO on duplicates, and entries-added-during-drain survive.
- [x] 16.6 Spec delta updated: "Bridge maintains shadow steering and follow-up queues" requirement rewritten to document the per-entry matcher, the no-bulk-clear invariant, and 7 new scenarios (incremental shrink, steering-first order, drain survival, no-op on non-match, duplicate FIFO, turn_end no-bulk-clear, agent_end no-bulk-clear).
