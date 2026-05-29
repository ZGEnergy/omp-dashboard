## Why

The `mid-turn-prompt-queue` capability is currently broken on two axes that only make sense to fix together:

1. **The Phase 3 model is a ghost factory.** Pi's `ExtensionAPI` (verified against pi-coding-agent 0.76.0 at `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`) exposes only `sendUserMessage`, `abort`, and `hasPendingMessages` for queue work. The Agent class methods `clearSteeringQueue` / `clearFollowUpQueue` / `clearAllQueues` exist on the inner `pi-agent-core` Agent (verified at `node_modules/@earendil-works/.../pi-agent-core/dist/agent.d.ts:84-88`) but are NOT exposed through the ExtensionAPI to bridge extensions. The previous Phase 3 architecture (archived 2026-05-19 in `add-followup-edit-and-steer-cancel`) assumed otherwise. Its mutation handlers called `(pi as any).clearFollowUpQueue?.()` as a silent no-op, then re-sent survivors via `sendUserMessage(_, {deliverAs:"followUp"})` — which **appends** to pi's real queue. Recorded empirical bug: removing `β` from `[α,β,γ]` causes pi to deliver `[α,β,γ,α,γ]`. The shadow lied to the UI; pi delivered ghosts.

2. **Phase 1's working architecture was thrown out to gain edit/remove/promote.** Phase 1 (archived 2026-05-14 as `surface-mid-turn-prompt-queue`) had the bridge own a `PendingPrompt[]` buffer. Pi never saw dashboard-queued follow-ups until the bridge's drain loop sent them as fresh turns at `agent_end`. That architecture worked end-to-end. The migration to Phase 3 sacrificed it on the assumption pi would expose mutation to extensions. Pi never did.

This change unifies two threads that lived in `honest-mid-turn-queue-surface` (43/47 done, code uncommitted in working copy) and `bridge-owned-followup-queue` (0/49 done, pure proposal). Both are superseded under `openspec/changes/archive/2026-05-28-SUPERSEDED-*/`. The consolidated approach: **delete the lies (mostly done), then revive Phase 1's bridge-owned architecture and layer per-entry edit/remove/promote/pull-to-editor on top — safely, because the bridge owns the data and mutation never touches pi.**

Hard design constraint (user direction): **steer queue stays pi-owned + display-only, forever.** Steer drains every 1-15 seconds at `turn_end`. Mutation UI on a queue that drains faster than humans react is wasted code. No "future steer change" is tracked; this is permanent. Steer continues to render as inline ghost user-message bubbles in `ChatView`, sourced from the existing pi-owned shadow + drain-by-`message_start`-matcher.

## What Changes

### §1 — Cleanup already in working copy (Phase 4a — DONE, verified by grep)

The dashboard tells the truth: read-only QueuePanel, no buttons that pretend to mutate pi's queue, no defensive `clear*Queue?.()` no-ops, no yank-to-draft on Stop. Specifically (every item verified zero-hits in WC by `grep` 2026-05-28):

- **DELETED** six wire types in `packages/shared/src/browser-protocol.ts`: `ClearSteeringQueueFromBrowserMessage`, `ClearFollowupSlotFromBrowserMessage`, `EditFollowupSlotFromBrowserMessage`, `EditFollowupEntryFromBrowserMessage`, `RemoveFollowupEntryFromBrowserMessage`, `PromoteFollowupEntryFromBrowserMessage`. Matching server↔extension types in `packages/shared/src/protocol.ts` deleted.
- **DELETED** six server case arms in `packages/server/src/browser-gateway.ts` + matching `handle*` functions in `session-action-handler.ts`.
- **DELETED** six bridge mutation handlers in `bridge.ts` (`clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`, `edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry`).
- **DELETED** `rewriteFollowupQueue` function (the clear-then-replay strategy that was the ghost source).
- **DELETED** defensive `(pi as any).clear*Queue?.()` calls in bridge `abort:` and `shutdown:` arms (silent no-ops; misled future readers).
- **DELETED** five client action senders in `packages/client/src/hooks/useSessionActions.ts`: `clearSteer`, `clearFollow`, `removeFollowUp`, `editFollowUp`, `promoteFollowUp`.
- **DELETED** `wrappedHandleAbort` yank-to-draft callback in `App.tsx`. Pi's queues persist across `abort()` by design; yanking produced duplicate delivery.
- **DELETED** `onCancelPending` prop + plumbing in `ChatView.tsx`. Steering inline ghost-bubble rendering preserved.
- **EDITED** `QueuePanel.tsx`: read-only header note. Subtitle "Follow-up — delivered when the agent finishes the turn". ↑/↓ cycler only.
- **DELETED** test `bridge-shadow-queue-drain.test.ts` (asserted the broken rewrite-via-clear-and-replay).
- **REWRITTEN** as negative assertions: `bridge-shutdown-reset.test.ts`, `bridge-abort-orderer.test.ts`, `command-handler.test.ts`, `QueuePanel.test.tsx`.
- **ADDED** `bridge-no-queue-mutation.test.ts`: iterates the six deleted message-type strings, asserts the bridge ignores them with zero `pi.*` calls, includes a positive control via `send_prompt`.
- **UPDATED** `docs/file-index-{client,extension,server,shared}.md` with `See change: honest-mid-turn-queue-surface` annotations (those will be re-annotated to `rework-mid-turn-prompt-queue` during this change's archive).

§1 also includes one orphan cleanup: `packages/extension/src/__tests__/bridge-followup-idle-guard.test.ts` is an untracked file that tests `rewriteFollowupQueue` (deleted) and cites the `unify-status-banner-and-terminal-limit-stop` change. The function it tests no longer exists; the test is broken-on-arrival. Delete.

### §2 — Bridge-owned follow-up queue restoration (Phase 5 — TODO)

#### Bridge: flip ownership from shadow to buffer

- **MODIFY** `bridge.ts`: rename `recordFollowupSent(text)` → `bufferFollowupSend(text)`. Semantics flip: today the function is called AFTER `pi.sendUserMessage(text, {deliverAs:"followUp"})` and records what pi already received; the new function is called INSTEAD of that pi call and pushes into the authoritative `bridgeFollowUp: string[]` buffer.
- **MODIFY** `command-handler.ts` `sessionPrompt` arm: when `delivery === "followUp"` AND `getBridgeState().isAgentStreaming === true`, call `bufferFollowupSend(text)` ONLY — do NOT call `pi.sendUserMessage`. When idle, keep the existing direct `pi.sendUserMessage(text)` no-`deliverAs` path (idle sends become fresh turns, unchanged).
- **ADD** `drainFollowupQueue(): Promise<void>` in `bridge.ts`. Subscribes to pi's `agent_end` event (via `queueMicrotask` to let retry-tracker / usage-limit-orderer run first). Body invariants (full text in `design.md` D2):
  1. Re-entrancy lock (`isDraining` boolean, set→try→finally clear).
  2. Idle gate (`ctx.isIdle()` must be `true`).
  3. TUI-coexistence gate (`pi.hasPendingMessages()` must be `false`).
  4. Empty-buffer gate (`bridgeFollowUp.length > 0`).
  5. POP FIRST: `bridgeFollowUp.shift()` captures the entry before any pi call.
  6. EMIT BEFORE SEND: `emitQueueUpdate()` so wire-state matches buffer-state.
  7. SINGLE SEND: `pi.sendUserMessage(entry)` with no `deliverAs` (fresh-turn semantics). No `await` for turn completion; the next `agent_end` re-enters the drain for the next entry.
  8. CATCH + DROP: any exception is logged; the entry is NOT re-pushed (double-shipping is worse than dropping).
- **MODIFY** drain-by-`message_start`-matcher (bridge.ts:1097 region): steer matcher stays unchanged. Follow-up matcher becomes unnecessary for dashboard-queued entries (pi never queues them; the bridge sends them as fresh turns). It remains harmless for TUI-queued follow-ups (which still flow through `pi.followUpQueue` → `message_start`) and for any direct extension `sendUserMessage(_,{deliverAs:"followUp"})` made outside the buffer path — but those don't exist in our codebase post-this-change. Keep the matcher for robustness; document the new no-op-for-buffered-entries case.

#### Wire protocol: new message types

- **ADD** in `packages/shared/src/browser-protocol.ts`:
  - `ClearFollowupEntriesFromBrowserMessage { type: "clear_followup_entries"; sessionId: string; indices: number[] | "all" }`.
  - `EditFollowupEntryFromBrowserMessage { type: "edit_followup_entry"; sessionId: string; index: number; text: string; images?: ImageContent[] }`.
  - `RemoveFollowupEntryFromBrowserMessage { type: "remove_followup_entry"; sessionId: string; index: number }`.
  - `PromoteFollowupEntryFromBrowserMessage { type: "promote_followup_entry"; sessionId: string; index: number }`.
  - `PullFollowupToEditorFromBrowserMessage { type: "pull_followup_to_editor"; sessionId: string; index: number }`.
  - `FollowupPulledMessage { type: "followup_pulled"; sessionId: string; text: string }` server-to-browser.
- **ADD** matching `*ToExtensionMessage` types in `packages/shared/src/protocol.ts` + extension-to-server `FollowupPulledExtensionToServerMessage`.
- Names deliberately differ from the deleted set (`clear_followup_entries` vs. `clear_followup_slot`; new `pull_followup_to_editor`) so `bridge-no-queue-mutation.test.ts`'s iteration over the OLD strings does not collide.

#### Server: forwarders + case arms

- **ADD** five `handle*` functions in `packages/server/src/browser-handlers/session-action-handler.ts` (one per new browser message). Each validates `sessionManager.get(msg.sessionId)` and forwards via `piGateway.sendToSession`.
- **ADD** five case arms in `packages/server/src/browser-gateway.ts` routing to the handlers.
- **ADD** the bridge→server `followup_pulled` arm: cache nothing, broadcast as `FollowupPulledMessage` to subscribers of that session.

#### Bridge: mutation handlers (bridge-buffer only, never pi)

- **ADD** five message-router cases in `bridge.ts`:
  - `edit_followup_entry`: range-check; `bridgeFollowUp[index] = text`; `emitQueueUpdate()`. Out-of-range → `command_feedback { status: "error" }`.
  - `remove_followup_entry`: range-check; `bridgeFollowUp.splice(index, 1)`; `emitQueueUpdate()`.
  - `promote_followup_entry`: if `index > 0`, splice + unshift + emit. `index <= 0` → silent no-op (no emit).
  - `clear_followup_entries`: when `indices === "all"` clear buffer; when `number[]` sort descending then splice each. Emit once.
  - `pull_followup_to_editor`: range-check; splice; `emitQueueUpdate()`; send `followup_pulled { sessionId, text }` extension→server.
- All handlers MUST NOT call `pi.sendUserMessage`, `pi.clear*Queue`, or any other pi method.

#### Client: senders + UI + draft hydration

- **ADD** in `packages/client/src/hooks/useSessionActions.ts`: `removeFollowUpEntry(index)`, `editFollowUpEntry(index, text, images?)`, `promoteFollowUpEntry(index)`, `clearFollowUpEntries(indices)`, `pullFollowUpToEditor(index)`. Each guards on `selectedId` and sends the matching wire message.
- **ADD** in `packages/client/src/components/QueuePanel.tsx` chip controls on the displayed entry:
  - `[✎]` opens inline edit (textarea); Cmd/Ctrl+Enter dispatches `editFollowUpEntry(idx, newText)`; Esc cancels.
  - `[✕]` dispatches `removeFollowUpEntry(idx)`. Confirmation only when entry > 50 chars.
  - `[⇧]` dispatches `promoteFollowUpEntry(idx)`. Disabled when `idx === 0`.
  - `[→ editor]` dispatches `pullFollowUpToEditor(idx)`. Tooltip: "Move to editor for editing".
- **ADD** panel-header "Clear all follow-up" button → dispatches `clearFollowUpEntries("all")`. Shown only when `followUp.length > 1`.
- **ADD** in `useMessageHandler.ts` (or wherever WS messages dispatch into state): `case "followup_pulled"` arm. Read `currentDraft = drafts.get(msg.sessionId) ?? ""`. Compute `nextDraft = [currentDraft, msg.text].filter(t => t.trim()).join("\n\n")`. Call `setDraftForSession(msg.sessionId, nextDraft)`.
- **UPDATE** `QueuePanel.tsx` header comment + subtitle: replace the "read-only" note from §1 with "Mutation buttons restored: edit, remove, promote, pull-to-editor, clear-all. Bridge owns the buffer; mutations are local to the bridge and never touch pi. See change: rework-mid-turn-prompt-queue."

### §3 — Tests for restored mutation

- **NEW** `bridge-followup-queue-drain.test.ts`: pop-before-send call-order, pi-throws drop semantics, one-per-`agent_end`, idle gate, TUI gate, re-entrancy lock.
- **NEW** `bridge-followup-mutation.test.ts`: each of edit/remove/promote/clear/pull, plus out-of-range emits `command_feedback`, plus zero pi calls in all handlers.
- **UPDATE** `command-handler.test.ts`: previous "followUp APPENDS to pi's queue" test flips to "followUp while streaming buffers in bridge, does NOT call pi.sendUserMessage" + new test "followUp while idle calls pi.sendUserMessage directly with no deliverAs".
- **UPDATE** `QueuePanel.test.tsx`: ADD tests for each new button being present and dispatching the right action; ADD edit-flow test (open textarea, Cmd+Enter); ADD "Clear all" visibility test; ADD pull-to-editor test.
- **NEW** reducer test for `followup_pulled` draft hydration: empty-draft and non-empty-draft cases.
- **PRESERVE** `bridge-no-queue-mutation.test.ts`: iterates the OLD deleted type strings; passes because those names stay deleted forever.

### §4 — Spec

The consolidated change updates `specs/mid-turn-prompt-queue/spec.md` deltas to reflect the net effect of §1 cleanup + §2 restoration, computed relative to the current canonical (Phase-3-lies) state on disk. See `specs/mid-turn-prompt-queue/spec.md` in this change directory.

## Capabilities

### Modified Capabilities

- **`mid-turn-prompt-queue`** — substantial rework:
  - Steer surface: stays as-is (pi-owned shadow + drain-by-matcher + inline ghost bubbles in ChatView). PERMANENT decision.
  - Follow-up surface: flips ownership from pi-owned-shadow to bridge-owned-buffer. Adds drain loop with pop-before-send invariant. Adds bridge-buffer-only mutation (edit/remove/promote/clear/pull-to-editor). Adds round-trip `followup_pulled` for draft hydration.
  - Lies retracted: depth-1 invariant, "Clear all" via no-op pi.clear, per-chip pi-mutation. None ever worked.

### Removed Capabilities

None — the capability itself remains; its implementation changes.

## Impact

- **Code already changed (§1)**: ~250 lines net deleted (verified in `git diff --stat`).
- **Code to add (§2)**: ~150 lines bridge (drain + 5 handlers + bufferFollowupSend rename); ~50 lines shared types; ~30 lines server forwarders + case arms; ~100 lines client (5 senders + QueuePanel buttons + reducer arm).
- **Tests added**: 2 new bridge test files + reducer test; multiple updates in existing test files.
- **Spec**: net-zero requirement count vs Phase-3-lies canonical; substantial content rewrite (steer requirements unchanged; follow-up requirements re-authored for bridge-owned semantics).
- **Behavior visible to user**:
  - Follow-up queue gets working `[✎] [✕] [⇧] [→ editor]` buttons.
  - "Clear all follow-up" comes back.
  - Pull-to-editor (new) replaces the deleted yank-to-draft on Stop.
  - Steer queue still display-only as inline ghost bubbles (unchanged).
  - TUI users no longer see dashboard-queued follow-ups in their TUI footer (regression, documented).
  - `/reload` loses `bridgeFollowUp` (regression, documented, matches Phase 1 trade-off).
- **Risk**: low end-to-end (Phase 1 already proved the architecture works) but moderate per-component (drain loop, idle-gate race, pop-before-send invariant). Mitigated by §3 tests + the preserved `bridge-no-queue-mutation.test.ts` keeping the broken paths buried.
- **Upstream pi**: no longer dependent. The bridge-owned model needs only `sendUserMessage`, `abort`, `hasPendingMessages` — all exposed at pi 0.76.0. If pi later exposes `clearFollowUpQueue` on the ExtensionAPI, a future change can optionally call it as a "tell pi to flush its TUI items first" optimization, but the dashboard's correctness no longer depends on it.
