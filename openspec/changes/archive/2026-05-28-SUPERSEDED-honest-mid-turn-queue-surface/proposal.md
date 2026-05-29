## Why

The `mid-turn-prompt-queue` capability claims behavior pi cannot deliver. Pi's `ExtensionAPI` (verified against pi 0.75.5 and 0.76.0) exposes **`sendUserMessage{deliverAs}`** and **`abort()`**, nothing else for queues. The Agent and AgentSession classes have `clearSteeringQueue`, `clearFollowUpQueue`, `clearAllQueues`, and `AgentSession.clearQueue()` — none of them routed through the extension surface. The bridge's `(pi as any).clearFollowUpQueue?.()` has been a silent no-op since day one.

Four downstream consequences are baked into the tree today:

1. **The spec lies.** `openspec/specs/mid-turn-prompt-queue/spec.md` mandates `pi.clearFollowUpQueue()` + depth-1 invariant + "Clear all" affordance + per-chip remove/edit/promote. None of these can work.
2. **The bridge carries dead protocol handlers.** `remove_followup_entry`, `edit_followup_entry`, `promote_followup_entry`, `clear_followup_slot`, `clear_steering_queue` all mutate `bridgeFollowUp` / `bridgeSteering` shadows AND call the no-op `clearFollowUpQueue`, then re-send survivors via `sendUserMessage(_, {deliverAs:"followUp"})` — which **appends** to pi's real queue. Empirical test (recorded in QueuePanel.tsx header): removing `β` from `[α,β,γ]` causes pi to deliver `[α,β,γ,α,γ]`. The shadow lies to the UI; pi delivers ghosts.
3. **The client carries dead action senders.** `useSessionActions.ts` exports `clearSteer`, `clearFollow`, `removeFollowUp`, `editFollowUp`, `promoteFollowUp`. No UI calls them today (QueuePanel was made read-only), but they're attractor surface — a future "just add a ✕ button" PR re-introduces silent duplicate delivery.
4. **The wire protocol carries dead message types.** `ClearSteeringQueueBrowserMessage` and the four follow-up mutation messages exist in `packages/shared/src/browser-protocol.ts`, force-typing tests and reducers.

The fix: align the spec with pi's reality, then aggressively remove the dead code. Honest read-only display + the two real primitives (`sendUserMessage` to append, `abort` to cancel the turn).

## What Changes

### Spec: shrink `mid-turn-prompt-queue` to match pi's reality

- **REMOVED**: requirement and scenarios for `pi.clearFollowUpQueue()` clear-then-send and the depth-1 invariant (factually impossible).
- **REMOVED**: "Follow-up send while slot is occupied replaces the entry" scenario (replace is impossible; append is the only operation).
- **REMOVED**: requirements + scenarios for `clear_queue` "Clear all" affordance, per-chip remove, per-chip edit, per-chip promote (none exist; none can exist honestly).
- **MODIFIED**: the follow-up send requirement: bridge calls `pi.sendUserMessage(text, {deliverAs:"followUp"})` only — append semantics, no clear. Multiple follow-up entries are valid; FIFO drain at `agent_end`.
- **MODIFIED**: queue panel render requirement — read-only follow-up cycler. No mutation buttons. No "Clear all". Steering does NOT render in the queue panel; it renders inline as ghost user-message bubbles in `ChatView`.
- **ADDED**: requirement explicitly forbidding queue-mutation protocol messages and bridge handlers. Pi extension API does not expose mutation; dashboard must not pretend it does.

### Bridge: delete dead handlers

- **DELETE**: bridge.ts handlers for `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`, `edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry` (bridge.ts:686-755 region).
- **DELETE**: `rewriteFollowupQueue` function (bridge.ts:281-313). Demonstrably broken; only callers are the deleted handlers.
- **DELETE**: defensive `(pi as any).clearSteeringQueue?.()` / `clearFollowUpQueue?.()` calls in the bridge `abort:` and `shutdown:` arms (bridge.ts:851-892). They are silent no-ops; their presence misleads readers and props up the spec lie.
- **KEEP**: bridge `bridgeSteering` / `bridgeFollowUp` shadow tracking by intercepting `sendUserMessage` calls + drain-by-`message_start`-matcher. This is the one mechanism that honestly works and feeds `queue_update` → server cache → client display.

### Client: delete dead action senders + yank-to-draft UX

- **DELETE** in `packages/client/src/hooks/useSessionActions.ts`: `clearSteer`, `clearFollow`, `removeFollowUp`, `editFollowUp`, `promoteFollowUp` action creators (and any helpers solely supporting them).
- **DELETE** in `packages/client/src/components/ChatView.tsx`: `onCancelPending` prop and its bulk-cancel-steering callback (L54, L148-callsite, plumbing). Steering inline rendering at L506-558 stays.
- **DELETE** in `packages/client/src/App.tsx` (~L823-851): `wrappedHandleAbort` callback that merges `pendingQueues.steering` + `followUp` into the command-input draft on Stop. Pi's queues persist across `abort()` by design (verified in `Agent.abort()` source); yanking produces duplicate delivery (drafted-edited copy + original ghost drain). All call sites (`onAbort={wrappedHandleAbort}` at ~L1163, L1172, L1242) revert to the bare `handleAbort`.
- **EDIT** in `packages/client/src/components/QueuePanel.tsx`: replace the long no-op explanation header (L1-28) with a 2-line note ("Read-only display. Pi's extension API does not expose queue mutation. See spec mid-turn-prompt-queue.") and add a one-line subtitle inside the panel: "Follow-up — delivered when the agent finishes the turn".

### Shared protocol: delete dead message types

- **DELETE** in `packages/shared/src/browser-protocol.ts`: `ClearSteeringQueueBrowserMessage`, `ClearFollowupSlotBrowserMessage`, `EditFollowupSlotBrowserMessage`, `EditFollowupEntryBrowserMessage`, `RemoveFollowupEntryBrowserMessage`, `PromoteFollowupEntryBrowserMessage`. Remove from the discriminated union. Remove any server-side `case` arms that forward them.

### Tests: prune + retruth

- **DELETE**: `packages/extension/src/__tests__/bridge-shadow-queue-drain.test.ts` (asserts the broken rewrite-via-clear-and-replay; the function it tests is gone).
- **REWRITE** as negative assertions: `bridge-shutdown-reset.test.ts`, `bridge-abort-orderer.test.ts`, `command-handler.test.ts` arms that asserted `clearFollowUpQueue` / `clearSteeringQueue` were called. Replace with "bridge does NOT call pi.clear* during shutdown/abort" assertions, since those calls are deleted.
- **REWRITE** as negative assertions: any client test asserting that `remove_followup_entry` / `edit_followup_entry` / `promote_followup_entry` / `clear_*` messages are sent. Replace with "client never sends these messages; sending them at the server is silently dropped".
- **REWRITE**: `QueuePanel.test.tsx` to assert no mutation buttons render; `↑`/`↓` cycler navigates display only.
- **DELETE** if unused: `packages/client/src/components/__tests__/package-queue.integration.test.tsx` and `packages/client/src/lib/__tests__/package-queue.test.ts` — assess; rewrite if they test the read-only display path; delete if they test mutation.

### Stop button label

No change. Tooltip and label stay as-is per user direction.

## Capabilities

### Modified Capabilities

- **`mid-turn-prompt-queue`** — drops all mutation surface; reduces to (a) append via `sendUserMessage{deliverAs}`, (b) shadow-tracked display, (c) drain-by-matcher on `message_start`. Stop button drops the yank-to-draft UX (pi's queues persist across abort by design). Explicit new requirement forbidding mutation protocol messages. Spec deltas cover 11 requirements total (6 REMOVED, 1 MODIFIED, 5 ADDED — net contraction of the capability surface).

### Removed Capabilities

None. The capability itself remains; only its scope shrinks.

## Impact

- **Code deleted**: ~250 lines (bridge.ts handlers + rewriteFollowupQueue + defensive no-op calls, client action senders, shared message types, plumbing in ChatView).
- **Tests deleted**: 1 file (`bridge-shadow-queue-drain.test.ts`).
- **Tests rewritten**: 4-6 files (`bridge-shutdown-reset.test.ts`, `bridge-abort-orderer.test.ts`, `command-handler.test.ts` partial, `QueuePanel.test.tsx`, `package-queue.*.test.*`).
- **Spec shrunk**: `mid-turn-prompt-queue/spec.md` loses ~half its requirements + scenarios.
- **Behavior visible to users**: zero. QueuePanel is already read-only; no mutation buttons exist today. The cleanup removes attractor surface, not user-facing capability.
- **Risk**: low. All deleted code paths are dead from the UI side already. Tests catch any accidental reintroduction.
- **Upstream pi**: a separate (non-blocking) task to file a feature request asking pi to expose `clearFollowUpQueue` / `clearSteeringQueue` on the ExtensionAPI. If upstream lands it, a future change can re-introduce mutation honestly. Until then, the dashboard tells the truth.
