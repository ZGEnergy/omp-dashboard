## 1. Wire protocol — restore message types with new names

- [ ] 1.1 In `packages/shared/src/browser-protocol.ts`, add `ClearFollowupEntriesFromBrowserMessage { type: "clear_followup_entries"; sessionId: string; indices: number[] | "all" }`. Add a JSDoc citing this change.
- [ ] 1.2 Add `EditFollowupEntryFromBrowserMessage { type: "edit_followup_entry"; sessionId: string; index: number; text: string; images?: ImageContent[] }`. JSDoc notes this mutates `bridgeFollowUp` only, no pi call.
- [ ] 1.3 Add `RemoveFollowupEntryFromBrowserMessage { type: "remove_followup_entry"; sessionId: string; index: number }`.
- [ ] 1.4 Add `PromoteFollowupEntryFromBrowserMessage { type: "promote_followup_entry"; sessionId: string; index: number }`.
- [ ] 1.5 Add `PullFollowupToEditorFromBrowserMessage { type: "pull_followup_to_editor"; sessionId: string; index: number }`. JSDoc notes the round-trip `followup_pulled` confirms removal and carries the text.
- [ ] 1.6 Add all five to the `BrowserToServerMessage` union.
- [ ] 1.7 Add `FollowupPulledMessage { type: "followup_pulled"; sessionId: string; text: string }` server-to-browser. Add to `ServerToBrowserMessage` union.
- [ ] 1.8 In `packages/shared/src/protocol.ts` (server↔bridge wire), add matching types: `ClearFollowupEntriesToExtensionMessage`, `EditFollowupEntryToExtensionMessage`, `RemoveFollowupEntryToExtensionMessage`, `PromoteFollowupEntryToExtensionMessage`, `PullFollowupToEditorToExtensionMessage`. Add to `ServerToExtensionMessage` union.
- [ ] 1.9 Add `FollowupPulledExtensionToServerMessage { type: "followup_pulled"; sessionId: string; text: string }` extension-to-server. Add to `ExtensionToServerMessage` union.
- [ ] 1.10 `tsc -p packages/shared --noEmit` clean.

## 2. Server — forwarders + case arms

- [ ] 2.1 In `packages/server/src/browser-handlers/session-action-handler.ts`, add `handleClearFollowupEntries`. Validates `sessionManager.get(msg.sessionId)`. Forwards `{type:"clear_followup_entries", sessionId, indices}` via `piGateway.sendToSession`.
- [ ] 2.2 Add `handleEditFollowupEntry`. Forwards with `index`, `text`, `images?`.
- [ ] 2.3 Add `handleRemoveFollowupEntry`. Forwards with `index`.
- [ ] 2.4 Add `handlePromoteFollowupEntry`. Forwards with `index`.
- [ ] 2.5 Add `handlePullFollowupToEditor`. Forwards with `index`.
- [ ] 2.6 In `packages/server/src/browser-gateway.ts`, add five `case` arms (`clear_followup_entries`, `edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry`, `pull_followup_to_editor`) routing to the handlers. Import the five `handle*` functions.
- [ ] 2.7 In the bridge→server event router (likely `event-wiring.ts` or `pi-gateway.ts`), add the `followup_pulled` arm: cache nothing, broadcast `{type:"followup_pulled", sessionId, text}` to subscribers of that session.
- [ ] 2.8 `tsc -p packages/server --noEmit` clean.
- [ ] 2.9 Unit tests: `packages/server/src/__tests__/session-action-handler-followup-queue.test.ts` covering each handler's forward behavior + missing-session early-return.

## 3. Bridge — buffer-then-drain architecture

- [ ] 3.1 In `packages/extension/src/bridge.ts`, locate the existing `recordFollowupSent` helper (used by Phase 3 shadow). Rename to `bufferFollowupSend` (single-PR-wide rename). Update its body: push to `bridgeFollowUp` + emit `queue_update`. Comment cites this change.
- [ ] 3.2 In `packages/extension/src/command-handler.ts` `sessionPrompt` arm, locate the followUp branch: today it calls `pi.sendUserMessage(text, { deliverAs: "followUp" })` and then `recordFollowupSent`. Change to: when `wasStreaming === true`, ONLY call `bufferFollowupSend(text)` — do NOT call `pi.sendUserMessage`. When `wasStreaming === false`, keep the existing direct `pi.sendUserMessage(text)` no-deliverAs path. Steer branch unchanged.
- [ ] 3.3 In `bridge.ts`, define `drainFollowupQueue(): Promise<void>` with the full pop-before-send loop from design.md D2. Include re-entrancy lock (`isDraining` boolean), idle gate (`ctx.isIdle()`), TUI gate (`pi.hasPendingMessages()`), empty gate, pop-then-emit-then-send, catch-and-drop on pi error.
- [ ] 3.4 Subscribe `drainFollowupQueue` to pi's `agent_end` event. Use `queueMicrotask` so other subscribers (retry tracker, usage limit orderer) run first.
- [ ] 3.5 Add five new message handlers in the bridge's message router (the location that used to hold the deleted `clear_steering_queue` / etc handlers). Each mutates `bridgeFollowUp` per spec and emits `queue_update`. NO pi calls.
  - `clear_followup_entries`: handle `indices: "all"` (set buffer empty) and `indices: number[]` (sort desc, splice each).
  - `edit_followup_entry`: range-check, replace, emit. Emit `command_feedback` error on bad index.
  - `remove_followup_entry`: range-check, splice, emit. Error on bad index.
  - `promote_followup_entry`: range-check, splice + unshift, emit. No-op (no emit) when `index <= 0`.
  - `pull_followup_to_editor`: range-check, splice, emit `queue_update`, then send `followup_pulled { sessionId, text }`.
- [ ] 3.6 `tsc -p packages/extension --noEmit` clean.

## 4. Client — restore action senders + draft hydration

- [ ] 4.1 In `packages/client/src/hooks/useSessionActions.ts`, add `removeFollowUpEntry(index: number)`, `editFollowUpEntry(index: number, text: string, images?: ImageContent[])`, `promoteFollowUpEntry(index: number)`, `clearFollowUpEntries(indices: number[] | "all")`, `pullFollowUpToEditor(index: number)`. Each guards on `selectedId` and sends the matching wire message. Add to the hook's return tuple.
- [ ] 4.2 In `packages/client/src/App.tsx`, destructure the five new senders from `sessionActions` and thread them to `QueuePanel` via props.
- [ ] 4.3 In `useMessageHandler.ts` (or wherever WS messages dispatch into state), add a `case "followup_pulled":` arm. Read `currentDraft = drafts.get(msg.sessionId) ?? ""`. Compute `nextDraft = [currentDraft, msg.text].filter(t => t.trim()).join("\n\n")`. Call `setDraftForSession(msg.sessionId, nextDraft)`.
- [ ] 4.4 `tsc -p packages/client --noEmit` clean.

## 5. Client — restore QueuePanel mutation UI

- [ ] 5.1 In `packages/client/src/components/QueuePanel.tsx`, add per-entry chip controls to the cycler:
  - `[✎]` button → opens inline edit (a textarea replacing the chip body); Cmd/Ctrl+Enter dispatches `editFollowUpEntry(idx, newText)`; Esc cancels.
  - `[✕]` button → dispatches `removeFollowUpEntry(idx)`. Confirmation only if entry has > 50 chars.
  - `[⇧]` button → dispatches `promoteFollowUpEntry(idx)`. Disabled when `idx === 0`.
  - `[→ editor]` button → dispatches `pullFollowUpToEditor(idx)`. Tooltip: "Move to editor for editing".
- [ ] 5.2 Add panel-header "Clear all" button → dispatches `clearFollowUpEntries("all")`. Shown only when `followUp.length > 1`.
- [ ] 5.3 Wire `onEdit`, `onRemove`, `onPromote`, `onPull`, `onClearAll` props to QueuePanel. Plumb from App.tsx.
- [ ] 5.4 Audit JSX — verify all five controls are present per entry; the cycler `↑`/`↓` nav also stays.
- [ ] 5.5 Update the header comment on QueuePanel.tsx: replace the prior change's "read-only" note with "Mutation buttons restored: edit, remove, promote, pull-to-editor, clear-all. Bridge owns the buffer; mutations are local to the bridge and never touch pi. See change: bridge-owned-followup-queue."

## 6. Tests — pop-invariant + drain semantics + mutation safety

- [ ] 6.1 New `packages/extension/src/__tests__/bridge-followup-queue-drain.test.ts`. Cover:
  - Pop-before-send: assert `bridgeFollowUp.shift` call order < `pi.sendUserMessage` call order via Vitest call-order tracking.
  - Pi-throws: mock `pi.sendUserMessage` to throw; assert entry is NOT re-pushed, warning logged.
  - One-per-`agent_end`: enqueue 3, fire `agent_end` once → 1 sent, 2 remain.
  - Idle-gate: `agent_end` fires but `ctx.isIdle()` false → no drain.
  - TUI-gate: `agent_end` fires but `pi.hasPendingMessages()` true → no drain, queue unchanged.
  - Re-entrancy lock: simulate two synchronous `agent_end` events; assert only the first does the pop+send work.
- [ ] 6.2 New `packages/extension/src/__tests__/bridge-followup-mutation.test.ts`. Cover:
  - `edit_followup_entry` mutates buffer + emits queue_update + does NOT call `pi.sendUserMessage` or any `pi.clear*`.
  - `remove_followup_entry` splices + emits.
  - `promote_followup_entry` reorders + emits; index 0 is no-op (no emit).
  - `clear_followup_entries` with `"all"` empties buffer + emits.
  - `clear_followup_entries` with `[0, 2]` splices in descending order, emits once.
  - Out-of-range index emits `command_feedback` error, no mutation.
  - `pull_followup_to_editor` splices + emits queue_update + sends `followup_pulled` with the captured text.
- [ ] 6.3 Update `packages/extension/src/__tests__/command-handler.test.ts`:
  - Existing test: "passthrough followUp APPENDS to pi's queue (v2: no pre-clear)" → flip to "passthrough followUp while streaming buffers in bridge, does NOT call pi.sendUserMessage".
  - New test: "passthrough followUp while idle calls pi.sendUserMessage directly with no deliverAs".
  - Update mocks for `bufferFollowupSend` instead of the deprecated `recordFollowupSent`.
- [ ] 6.4 Client tests — `packages/client/src/components/__tests__/QueuePanel.test.tsx`:
  - Add tests for the new `[✎]`, `[✕]`, `[⇧]`, `[→ editor]` buttons being present.
  - Test edit-flow: click `[✎]` → textarea appears → type → Cmd+Enter → `onEdit` callback invoked with `(idx, newText)`.
  - Test remove flow: click `[✕]` → `onRemove` callback with `idx`.
  - Test promote flow: `[⇧]` disabled when `idx === 0`.
  - Test pull flow: `[→ editor]` calls `onPull(idx)`.
  - Test "Clear all" appears only when `followUp.length > 1`.
- [ ] 6.5 Reducer/handler tests: cover `followup_pulled` draft hydration — empty draft case + non-empty draft case (append with `\n\n`).
- [ ] 6.6 Integration: assert prior change's `bridge-no-queue-mutation.test.ts` STILL PASSES (it iterates over the OLD deleted type strings — `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot` — which remain deleted forever). The NEW types in this change have different names (`clear_followup_entries`, etc.), so no collision.
- [ ] 6.7 Run `HOME=$(mktemp -d) npx vitest run` on the affected files. All green.
- [ ] 6.8 Full `npm test` — only the pre-existing `bare-import-exports-map.test.ts` failures remain (unrelated).

## 7. Documentation + file-index

- [ ] 7.1 Delegate to a general-purpose subagent (per Documentation Update Protocol) to update the following file-index rows in caveman style with `See change: bridge-owned-followup-queue`:
  - `docs/file-index-extension.md` — `src/extension/bridge.ts` (note the new drain loop + buffer ownership), `src/extension/command-handler.ts` (note the followUp buffering branch).
  - `docs/file-index-client.md` — `QueuePanel.tsx` (note restored mutation UI + pull-to-editor), `useSessionActions.ts` (note restored mutation senders + new pull sender), `useMessageHandler.ts` (note `followup_pulled` arm).
  - `docs/file-index-shared.md` — `browser-protocol.ts` (note new message types), `protocol.ts` (same).
  - `docs/file-index-server.md` — `session-action-handler.ts` and `browser-gateway.ts` (note restored five-handler set).
- [ ] 7.2 No `AGENTS.md` change (per-file detail).

## 8. Verification

- [ ] 8.1 `openspec validate bridge-owned-followup-queue` — must pass.
- [ ] 8.2 `npm run build` succeeds across all packages.
- [ ] 8.3 `npm test` — all tests pass except the two pre-existing unrelated failures.
- [ ] 8.4 Manual smoke (run dashboard against live pi session):
  - Queue 3 follow-ups while agent is streaming. Verify chips appear with `[✎] [✕] [⇧] [→ editor]` buttons.
  - Edit middle chip in place. Verify the chip updates without ghost duplicate at next drain.
  - Remove first chip. Verify only the two remaining drain (in order).
  - Promote third chip. Verify it drains first.
  - Pull a chip to editor. Verify the chip is gone and the draft contains the text.
  - Open a TUI session in parallel. TUI sends a follow-up. Verify dashboard does NOT see it (documented behavior). TUI does NOT see dashboard-buffered items (documented).
  - At `agent_end`, both queues drain — pi's first (TUI item), bridge's second (dashboard item).
  - `/reload` the dashboard. Verify `bridgeFollowUp` is empty after reload (documented loss).
- [ ] 8.5 Archive both `honest-mid-turn-queue-surface` AND `bridge-owned-followup-queue` together: they ship as one logical work-unit (cleanup + revival).
