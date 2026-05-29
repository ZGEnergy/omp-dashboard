## Why

The prior change `honest-mid-turn-queue-surface` removed Phase 3's ghost-producing pi-owned + bridge-shadow mutation surface. The dashboard ended up with read-only follow-up display — correct, but worse UX than the user expected, and worse than what Phase 1 (`surface-mid-turn-prompt-queue`, archived 2026-05-14) already shipped before the migration to Phase 3.

Phase 1's bridge-owned follow-up queue worked end-to-end. Its limitations were (a) no per-entry edit/remove (explicitly Out of Scope at the time) and (b) no steer support (added later in Phase 2). Phase 3 migrated to a pi-owned + bridge-shadow model **specifically to gain edit/remove/promote**, assuming pi would expose `clearFollowUpQueue` to extensions. Pi never did. The migration produced ghosts ever since.

This change revives Phase 1's architecture for follow-up — bridge owns the queue, never forwards to pi until drain — and adds the edit/remove/promote/pull-to-editor affordances that motivated Phase 3, this time honestly (the bridge owns the data, so mutation is local and safe). Steer remains pi-owned + display-only (the current inline-ghost-bubble in `ChatView`), preserving Phase 2's steer-visibility gain.

The key safety invariant the user requested: **bridge MUST pop entries from its buffer BEFORE handing them to pi**. On pi error, entries are lost (user re-types) — never double-shipped.

## What Changes

### Bridge — restore the buffer, add the drain loop

- **NEW**: `bridgeFollowUp: string[]` becomes the **authoritative** follow-up queue for dashboard-originated sends. Never forwarded to pi while pi is streaming.
- **MODIFIED** in `command-handler.ts` `sessionPrompt` arm: when `delivery === "followUp"` AND `isAgentStreaming === true`, the bridge SHALL push to `bridgeFollowUp` and emit `queue_update` — but SHALL NOT call `pi.sendUserMessage`. When the agent is idle, the existing direct-forward path stays unchanged (idle followUp sends become fresh turns, identical to today).
- **NEW**: `drainFollowupQueue()` function subscribes to pi's `agent_end` event. Drain rules:
  - Pre-flight: only drain if `ctx.isIdle() === true` AND `pi.hasPendingMessages() === false` AND `bridgeFollowUp.length > 0`. If pi still has its own queued items (e.g. TUI-sent follow-ups), let pi drain those first; the next `agent_end` retries.
  - Pop the **front** entry from `bridgeFollowUp` first.
  - Emit `queue_update` reflecting the pop.
  - Call `pi.sendUserMessage(entry)` (no `deliverAs`, so pi starts a fresh turn).
  - On exception: log warning, **do NOT re-queue**. User accepts the loss.
  - Return after one entry. Pi is now busy; the next `agent_end` re-enters `drainFollowupQueue()` for the next entry. **One drain per `agent_end`.**
- **NEW**: `clear_followup_entries { sessionId, indices: number[] | "all" }` browser-to-server message + matching bridge handler. The bridge splices `bridgeFollowUp` and emits `queue_update`. No pi call. Safe by construction.
- **NEW**: `edit_followup_entry { sessionId, index, text, images? }` → bridge replaces `bridgeFollowUp[index]` and emits. No pi call.
- **NEW**: `promote_followup_entry { sessionId, index }` → bridge moves entry to position 0 and emits. No pi call.
- **NEW**: `pull_followup_to_editor { sessionId, index }` → bridge splices the entry AND sends `followup_pulled { sessionId, text }` browser-to-server-to-browser event so the client can hydrate the command-input draft. No pi call.
- Steer queue handling unchanged (display-only via shadow + drain-by-matcher; existing inline ghost bubbles in `ChatView`).
- The current `recordFollowupSent` helper (was used by the broken Phase 3 shadow to mirror pi's queue) is repurposed: it now pushes into the bridge buffer instead of the shadow. The function name + signature stays for minimum diff.

### Wire protocol — restore the deleted message types

- **NEW** in `packages/shared/src/browser-protocol.ts`:
  - `ClearFollowupEntriesFromBrowserMessage { type: "clear_followup_entries"; sessionId: string; indices: number[] | "all" }` — replaces the prior `clear_followup_slot` (deleted) and gives `indices: "all"` as a clear-all affordance.
  - `EditFollowupEntryFromBrowserMessage { type: "edit_followup_entry"; sessionId: string; index: number; text: string; images?: ImageContent[] }` — same shape as the deleted version. Semantics now safe (mutates bridge buffer).
  - `RemoveFollowupEntryFromBrowserMessage { type: "remove_followup_entry"; sessionId: string; index: number }` — restored.
  - `PromoteFollowupEntryFromBrowserMessage { type: "promote_followup_entry"; sessionId: string; index: number }` — restored.
  - `PullFollowupToEditorFromBrowserMessage { type: "pull_followup_to_editor"; sessionId: string; index: number }` — new.
- **NEW** server-to-browser: `FollowupPulledMessage { type: "followup_pulled"; sessionId: string; text: string }` — fires when the bridge confirms a pull; client hydrates draft.
- **NOT restored**: `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`. The steering surface stays display-only; the v1 follow-up `_slot` shape is superseded by the per-entry variants.
- **NEW** in `packages/shared/src/protocol.ts` (server↔bridge wire format): matching message types, forwarded from browser-protocol through the server.

### Server — restore the forwarders

- **NEW** in `packages/server/src/browser-handlers/session-action-handler.ts`: `handleClearFollowupEntries`, `handleEditFollowupEntry`, `handleRemoveFollowupEntry`, `handlePromoteFollowupEntry`, `handlePullFollowupToEditor`. Each validates `sessionManager.get(msg.sessionId)` and forwards to the bridge via `piGateway.sendToSession`.
- **NEW** in `packages/server/src/browser-gateway.ts`: five matching `case` arms in the message router.
- **NEW**: forward `FollowupPulledMessage` from bridge → browser. Server caches no state; the client consumes the event and updates its local draft.

### Client — restore the QueuePanel mutation surface

- **NEW** chip controls in `packages/client/src/components/QueuePanel.tsx`:
  - ✕ per-entry remove → sends `remove_followup_entry { index }`.
  - ✎ inline edit → opens a small editor (textarea) on the visible entry; on submit (Cmd/Ctrl+Enter), sends `edit_followup_entry { index, text }`.
  - ⇧ promote-to-head → sends `promote_followup_entry { index }` (only enabled when not already at index 0).
  - → editor (pull) → sends `pull_followup_to_editor { index }`. Bridge splices + emits `followup_pulled`; client reducer hydrates `CommandInput` draft via `setDraftForSelected`.
- **NEW** "Clear all follow-up" affordance at the panel header → sends `clear_followup_entries { indices: "all" }`.
- **RESTORED** action senders in `packages/client/src/hooks/useSessionActions.ts`: `removeFollowUpEntry`, `editFollowUpEntry`, `promoteFollowUpEntry`, `pullFollowUpToEditor`, `clearFollowUpEntries`. No `clearSteer`, no `clearFollow` (the slot-shape ones stay deleted).
- **NEW** reducer arm in `event-reducer.ts` (or `useMessageHandler.ts`): on `followup_pulled`, dispatch a draft-update for the named session. Client owns the merge with the current draft (append with separator if draft is non-empty; replace if empty).
- The Stop button does NOT yank queue to draft (deleted by the prior change, stays deleted). The dedicated pull-to-editor button is the only path that combines remove + draft-hydrate.

### Spec — re-introduce the requirements that the prior change removed (but with bridge-owned semantics)

The `mid-turn-prompt-queue` spec needs ADD-back requirements covering:

- Bridge owns the follow-up queue; pi never sees dashboard-queued follow-ups until drain.
- Drain runs on `agent_end` with pop-before-send invariant + idle gate + one-entry-per-`agent_end` serialization.
- Per-entry edit / remove / promote / pull mutate `bridgeFollowUp` only; no pi call.
- `clear_followup_entries` accepts `indices: number[] | "all"` (replaces prior `clear_followup_slot`).
- `pull_followup_to_editor` triggers `followup_pulled` round-trip for draft hydration.
- TUI compatibility section: TUI follow-ups live in `pi.Agent.followUpQueue` (out of bridge view); dashboard follow-ups live in `bridgeFollowUp` (out of TUI view); both drain at `agent_end` boundaries (pi's queue first via natural drain, then bridge's queue via the new drain loop).
- `bridgeFollowUp` does NOT persist across bridge restart (`/reload`, dashboard restart, pi crash). User must re-queue. Same as Phase 1 documented trade-off.

### Tests

- Pop-before-send invariant test: simulate `drainFollowupQueue`, assert `bridgeFollowUp.shift()` happens **before** `pi.sendUserMessage` is awaited (use mock counters + order assertions).
- Pi-throws test: mock `pi.sendUserMessage` to throw; assert entry is NOT re-pushed, `bridgeFollowUp.length` decreases by 1, warning logged.
- One-per-`agent_end` test: enqueue 3 entries, fire `agent_end` once → assert 1 entry sent, 2 remain; fire `agent_end` again → 1 more sent, 1 remains.
- Idle-gate test: `agent_end` fires but `ctx.isIdle()` returns false → assert no drain, queue unchanged.
- TUI-coexistence test: simulate `pi.hasPendingMessages() === true` (TUI items still in pi queue) → bridge drain skips, queue unchanged.
- Edit-in-place test: `edit_followup_entry { index: 1, text: "new" }` mutates `bridgeFollowUp[1]`, emits `queue_update`, **never** calls `pi.sendUserMessage` or any `pi.clear*Queue`.
- Pull-to-editor test: `pull_followup_to_editor { index: 0 }` splices `bridgeFollowUp[0]`, emits `queue_update`, sends `followup_pulled { text }` back to client.
- Reconnect mid-queue test: drop the bridge connection while `bridgeFollowUp = [a, b]`; reconnect → assert next `queue_update` carries the surviving entries; no double-drain.

## Capabilities

### Modified Capabilities

- `mid-turn-prompt-queue` — substantial re-add of requirements removed by `honest-mid-turn-queue-surface`. Bridge-owned follow-up queue. Per-entry edit/remove/promote/pull. Steer remains pi-owned + display-only.

### New Capabilities

None — the capability surface is the same; the implementation moves.

## Impact

- **Bridge**: +~150 lines (drain loop, idle gate, restored handlers with bridge-only semantics, pull-to-editor handler). Removes ~30 lines of "do not pretend pi.clear* works" guard comments since the code now never calls pi.clear*.
- **Wire protocol**: +5 message types in `browser-protocol.ts`, +5 in `protocol.ts`. The names are NEW (`clear_followup_entries` not the deleted `clear_followup_slot`; `pull_followup_to_editor` brand new) so there's no name collision with the prior change's negative-assertion test.
- **Server**: +5 forwarders + 5 case arms.
- **Client**: ~80 lines in `QueuePanel.tsx` (mutation UI), ~30 lines in `useSessionActions.ts`, ~15 lines in reducer for `followup_pulled`.
- **Tests**: 1 new test file `bridge-followup-queue-drain.test.ts` covering the drain invariants; updates to `command-handler.test.ts` for the new buffering branch; new `QueuePanel.test.tsx` cases for mutation buttons. The negative-assertion test from the prior change (`bridge-no-queue-mutation.test.ts`) iterates over the **old** deleted type strings — those stay deleted forever — so the new types don't conflict.
- **Spec**: ~10 requirements added back, with new bridge-owned semantics and the TUI-compat trade-off documented.
- **Behavior visible to user**:
  - Follow-up queue gets working ✕ ✎ ⇧ → buttons.
  - "Clear all follow-up" comes back.
  - Pull-to-editor (new) replaces the deleted yank-to-draft on Stop.
  - Steer queue still display-only (unchanged from the prior change).
  - TUI users no longer see dashboard-queued follow-ups in their TUI footer (regression, documented).
  - `/reload` loses bridgeFollowUp (regression, documented, matches Phase 1 trade-off).
- **Risk**: low end-to-end (Phase 1 already proved the architecture works) but moderate per-component (new drain loop, idle-gate race, pop-before-send invariant). Mitigated by the test suite above + negative-assertion test from prior change keeping the broken paths buried.
