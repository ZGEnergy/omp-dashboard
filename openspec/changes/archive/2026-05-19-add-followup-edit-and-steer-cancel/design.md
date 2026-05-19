## Context

Pi's `@earendil-works/pi-agent-core` exposes a complete queue API surface that the dashboard has so far only used partially:

```ts
// Pi Agent API (already shipped, verified in pi-agent-core 0.71+)
agent.steeringMode = "all" | "one-at-a-time";
agent.followUpMode = "all" | "one-at-a-time";
pi.sendUserMessage(text, { deliverAs: "steer" | "followUp" });
agent.clearSteeringQueue();
agent.clearFollowUpQueue();
agent.clearAllQueues();
agent.hasQueuedMessages(): boolean;

// Event payload (from pi-coding-agent's AgentSessionEvent)
{ type: "queue_update", steering: readonly string[], followUp: readonly string[] }
```

Today the dashboard ignores `queue_update` entirely, and runs a *parallel* bridge-owned FIFO (`PromptQueue` in `packages/extension/src/prompt-queue.ts`) that drains on `agent_end`. The parallel queue was originally built (change `surface-mid-turn-prompt-queue`, archived 2026-05-14) because the dashboard had no way to observe pi's internal state. With `add-steering-message` (PR #27, archived 2026-05-18) the bridge gained `deliverAs:"steer"` routing — but the parallel `PromptQueue` still owns follow-up storage, creating two sources of truth.

This change initially planned to consolidate onto pi's native queues via the `queue_update` event. **That plan was invalidated mid-implementation by the discovery in Decision 5 (below): pi's extension API does not forward `queue_update` events.** The bridge keeps a shadow queue (revised purpose: it's the *source of truth* for the dashboard, not a parallel one), but the implementation is now much smaller because the bridge only tracks what it itself sends + observes the natural drain boundaries (turn_end / agent_end).

## Goals / Non-Goals

**Goals**

- Single source of truth for pending prompts: pi's internal queues, observed via `queue_update` and mutated via the existing pi API surface.
- Visibility of both queues in the dashboard, matching their natural cadence (steer = rapid drain, follow-up = waits for `agent_end`).
- Follow-up slot is editable in place (capacity 1, replace semantics).
- Steer is bulk-cancelable.
- Zero new pi APIs required.

**Non-Goals**

- Per-entry steer cancel or edit. Would force the bridge to re-introduce its own queue at depth 1 (clear-then-resend dance per pi-mutation), reintroducing the dual-source-of-truth problem this change set out to eliminate. Deferred until user demand is observed.
- Reorder of either queue. YAGNI for v1.
- Exposing `agent.steeringMode` / `agent.followUpMode` toggles in the dashboard UI. These remain pi-internal defaults (`mode: "all"`).
- Forwarding `queue_update.nextTurn` (pi's pre-turn buffer). Not user-actionable from the dashboard.

## Decision 1: Drop the bridge-owned `PromptQueue` entirely

**Option A (chosen)**: Delete `packages/extension/src/prompt-queue.ts`. Bridge no longer stores follow-up prompts. Every `send_prompt {delivery:"followUp"}` calls `pi.sendUserMessage(text, {deliverAs:"followUp"})` immediately. Pi's native follow-up queue holds the entry; pi's `queue_update` event surfaces it.

**Option B (rejected)**: Keep `PromptQueue` for follow-up, add a thin "depth-1 invariant" enforcement at the bridge. Mirror pi's steer queue separately for visibility but keep bridge-as-owner for follow-up.

Why A: Option B keeps two sources of truth (bridge memory + pi memory) and forces the bridge to reconcile them on every mutation. Pi already has all the storage semantics we need; running our own queue alongside is exactly the kind of dual-state duplication called out in the architecture-discipline guidance (see `docs/architecture.md` "single source of truth"). Pi's queue survives bridge restarts; the bridge queue does not — making pi authoritative removes a reconnect-state hazard.

**Implication**: The `queue_state` ExtensionToServerMessage and the bridge-minted `bq_<sid>_<n>` ids disappear from the protocol. The new `queue_update` ExtensionToServerMessage carries plain `string[]` arrays per pi's event shape. The server-cached `pendingQueue: PendingPrompt[]` becomes `pendingQueues: { steering: string[]; followUp: string[] }`.

## Decision 2: Follow-up slot is capacity 1 with replace-on-send

**Option A (chosen)**: Bridge calls `pi.clearFollowUpQueue()` before every `pi.sendUserMessage(text, {deliverAs:"followUp"})`. Pi's follow-up queue is therefore *always* depth ≤ 1 for sessions originated from the dashboard. Sending a new follow-up while one is pending silently replaces it.

**Option B (rejected)**: Append semantics — concatenate new text onto the existing slot with `"\n\n"`.

**Option C (rejected)**: Reject — show a toast "follow-up slot full; edit or cancel first."

Why A: Replace is the simplest mental model and matches the affordance set we ship (chip with `✏` and `✕` visible). Append risks the slot growing unboundedly and produces text the user never composed in one piece. Reject is hostile — the user's pressing Alt+Enter is a clear "make this the follow-up" signal. The chip is right there with edit; the cost of accidental replace is low because the slot is editable.

**Implication**: Bridge handler for `send_prompt {delivery:"followUp"}` becomes: `pi.clearFollowUpQueue()` then `pi.sendUserMessage(text, {deliverAs:"followUp"})`. The new `edit_followup_slot` browser message uses the same code path — it's just "send a new follow-up" with the textbox content from the editor.

## Decision 3: Steer remains multi-entry, observable, bulk-cancelable only

**Option A (chosen)**: Dashboard simply mirrors pi's steer queue read-only. The only mutation affordance is `clear_steering_queue` (calls `pi.clearSteeringQueue()`). Per-entry cancel and edit are not provided.

**Option B (rejected)**: Bridge owns the steer queue at depth 1 (same trick as follow-up). Per-entry cancel is `clearSteeringQueue` of the current head + resend of remaining locally-held entries.

Why A: Steer drains every 1–15 s (every turn boundary). The window where per-entry cancel is meaningful is small. Option B reintroduces a parallel bridge-owned queue (the very thing Decision 1 eliminates), with race-condition complexity (drain-vs-cancel-vs-edit) that scales worst when the queue is most "fast-moving." The marginal UX gain (cancel one specific steer out of two) does not justify the surface area. If user demand emerges post-ship, a follow-up change can add it without breaking this one's wire protocol.

**Implication**: Steer chips have no per-entry buttons. Single "Cancel all steering" button below the chip list. Edit is not offered for steer.

## Decision 4: Client uses authoritative `pendingQueues`, drops optimistic chip

(See revision in Decision 6.)


**Option A (chosen)**: Client renders strictly from `state.pendingQueues` populated via server-broadcast `queue_update`. No optimistic local update on send; the chip appears only once `queue_update` confirms pi accepted it.

**Option B (rejected)**: Optimistic chip on send, reconciled with `queue_update` arrival.

Why A: pi's `queue_update` typically arrives within a single network RTT (< 50 ms on local, < 300 ms over zrok tunnels). The flicker risk is negligible. Option B requires reconciliation logic for edge cases (pi rejected the send, bridge crashed mid-send, queue overflowed) — none of which we currently handle for the optimistic chip path. Going authoritative eliminates a class of state-divergence bugs at the cost of a perceptible-only-on-bad-networks render delay.

**Implication**: `useSessionActions.handleSend` no longer writes `pendingPrompt` into session state. `state.pendingPrompt` and the `PendingPrompt` type are deleted. `ChatView` and `CommandInput` read `state.pendingQueues` instead.

## The Two Code Paths Affected (parallel to existing routing)

Today messages reach the bridge from the dashboard via two paths in `command-handler.ts`:

1. **Passthrough** (plain text, multiline slashes): currently calls `enqueueIfStreaming` → `sendUserMessageWithImages`. After this change: drop `enqueueIfStreaming` entirely. Always call `sendUserMessageWithImages(pi, outgoing, images, msg.delivery)`. For `delivery:"followUp"`, the helper additionally calls `pi.clearFollowUpQueue()` first to enforce capacity 1.

2. **Slash commands** (`parsed.type === "slash"`): routed to `options.sessionPrompt(parsed.text, msg.delivery)`. Bridge's `sessionPrompt` already honors delivery (from `add-steering-message`). The follow-up branch in `sessionPrompt` gains the same `pi.clearFollowUpQueue()` pre-call.

The new `clear_steering_queue` / `clear_followup_slot` / `edit_followup_slot` messages bypass `command-handler.ts` and dispatch directly to bridge methods.

## Bridge invariant

For dashboard-originated sessions, the bridge maintains:

```
pi.followUpQueue.length ≤ 1 (always)
pi.steeringQueue.length     ≤ N (pi-managed, no bridge enforcement)
```

The follow-up invariant is enforced by `pi.clearFollowUpQueue()` before every `sendUserMessage({deliverAs:"followUp"})`. If a non-dashboard consumer (TUI, another extension) injects multiple follow-ups, pi's `queue_update` will report `followUp.length > 1` and the client will render the array's first entry as the canonical slot. This is a fail-soft path; no errors thrown.

## Migration: removing the old `queue_state` event

Old `queue_state` ExtensionToServerMessage and its server cache are deleted. Existing browsers connected to a new server won't see `queue_state` updates and will fail-soft (the field is gone from `Session`). On reconnect, they'll receive the initial-state snapshot with the new `pendingQueues` field instead.

**Server-side breaking**: a NEW client connecting to an OLD server (pre-this-change) will not receive `queue_update` events. The client renders the new `PromptQueuePanel` with empty arrays — degrades to "no queue visible" rather than crash. Reverse compat (old client + new server) is also empty-view fail-soft because the old client doesn't know to read `pendingQueues`.

No version handshake is added — both ends are deployed together (single dashboard product).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Race: user edits/cancels follow-up while pi is already draining it on `agent_end` | Same as any cancel-vs-drain race. Pi processes the in-flight message; subsequent `clearFollowUpQueue` is a no-op. UI may briefly show "in flight" indicator (chip dims) — keep simple: just let the eventual `queue_update` reconcile. |
| Race: user clicks "Cancel all steering" while pi just pulled the head into a turn | Pi processes the pulled message; the cancel wipes the rest of the queue. Acceptable. |
| Pi version skew: `clearFollowUpQueue` missing on an older pi | Required pi version stays at 0.71 (current floor — see `adopt-pi-071-072-073-features`). Methods verified present in pi-agent-core 0.71+. Bridge guards with `typeof pi.clearFollowUpQueue === "function"` and falls back to no-op + console warning. |
| Non-dashboard consumer (TUI, custom extension) pushes a second follow-up, breaking the cap-1 invariant | Client renders `pendingQueues.followUp[0]` only. Second entry is silently ignored in UI; pi still drains both on `agent_end`. Documented in spec. |
| Replace-semantics surprises a user who pressed Alt+Enter twice quickly | Mitigation: chip with edit button is visible; replace is the documented behavior. If users complain, switch to confirm-on-replace later (no protocol change needed). |
| `queue_update` event is high-frequency (fires on every push/drain) | Pi already throttles to actual queue mutations. Server caches the latest snapshot per session; client subscribes to single state slot. No throttling needed on our side. |

## Migration Plan

1. Ship the protocol-types + bridge handlers first (server forwards `queue_update`, bridge listens to pi's event). Old client still sees `queue_state` → fail-soft empty.
2. Ship the client `PromptQueuePanel` and event-reducer changes. New `pendingQueues` field appears in `SessionState`.
3. Delete `PromptQueue` class + `queue_state` event + `clear_queue` / `remove_queue_entry` handlers in a single follow-up commit once new path is verified.

In practice the three steps land in one PR since the dashboard is a single artifact.

## Decision 5: Pi does not forward `queue_update` to extensions — bridge owns a shadow queue

**Discovered after initial implementation.** Pi's `_emitExtensionEvent` (in `pi-coding-agent/dist/core/agent-session.js`) forwards a fixed allowlist of events through the extension runner: `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `model_select`, `thinking_level_select`, `session_*`, `before/after_provider_*`, `before_agent_start`, `context`, `input`, `user_bash`, `resources_discover`, `tool_call`, `tool_result`. **`queue_update` is NOT in this allowlist.** Verified by inspecting `_emitExtensionEvent`: the only writers of `queue_update` are pi's internal `_emit` for SDK consumers and the AgentSessionEvent stream for the TUI's interactive mode.

Consequence: `pi.on("queue_update", ...)` registered in `bridge.ts` would never fire. The plan in Decision 1 to have pi-be-source-of-truth-via-event is structurally impossible without a pi-side change.

**Option A (chosen)**: bridge maintains its own shadow `bridgeSteering: string[]` + `bridgeFollowUp: string[]` per session. Every mutation the bridge performs against pi (sends, clears, edits) updates the shadow + emits a `queue_update` ExtensionToServerMessage. Drain happens on observed boundaries: `pi.on("turn_end")` clears `bridgeSteering`; `pi.on("agent_end")` clears `bridgeFollowUp`.

**Option B (rejected)**: lobby for pi to extend the extension allowlist. Right answer long-term but blocking now; can be a follow-up change that simplifies the bridge once pi ships it.

**Option C (rejected)**: poll pi's `agent.hasQueuedMessages()` via timer. High-rate polling for a low-rate event; wasteful and adds latency.

This effectively un-rejects the parallel-queue concern from the original Decision 1 reasoning, but with a key difference: the parallel queue is now the SINGLE source of truth visible to the dashboard — it's not duplicated against a separate pi-emit feed (because that feed doesn't reach us). The duplication concern doesn't apply.

**Implication**: external (non-dashboard) consumers that mutate pi's queues bypass the bridge's shadow. The dashboard won't reflect TUI-side pushes. Acceptable: the dashboard owns the session; TUI access is the rare case.

## Decision 6: Capture-before-send streaming gate (race fix)

**Initial implementation bug**: when the user sent the first prompt on an idle session with `delivery:"steer"`, a STEERING chip appeared anyway. Trace:

```
t=0   command-handler: pi.sendUserMessage(text, {deliverAs:"steer"})
t=1   pi: idle → starts new run → emits agent_start SYNCHRONOUSLY inside sendUserMessage
t=2   bridge agent_start handler runs first sync line:
      isAgentStreaming = true              ← flag flipped
t=3   pi.sendUserMessage returns
t=4   command-handler: if (da==="steer") options.onSteerSent(text)
t=5   recordSteerSent: checks isAgentStreaming → true → records chip 🟥 (BUG)
```

The v1 internal gate inside `recordSteerSent` checks AFTER pi has already flipped the flag.

**Option A (chosen, v2)**: capture `wasStreaming = options.isStreaming()` at the call site **before** invoking `pi.sendUserMessage`. Only record to the shadow queue when `wasStreaming === true`. The internal gate stays as defense-in-depth for any future caller that forgets to capture.

```ts
// command-handler.ts passthrough branch
const wasStreaming = options?.isStreaming?.() ?? false;
sendUserMessageWithImages(pi, outgoing, msg.images, msg.delivery);
if (wasStreaming) {
  const da = msg.delivery ?? "followUp";
  if (da === "steer") options?.onSteerSent?.(outgoing);
  else options?.onFollowupSent?.(outgoing);
}
```

Same pattern in `bridge.ts` `sessionPrompt` fallback and `edit_followup_slot` handler.

**Option B (rejected)**: make pi's extension event emission async so `agent_start` fires after `sendUserMessage` returns. Requires a pi-side change.

**Option C (rejected)**: delay the bridge's `isAgentStreaming = true` write to a `setTimeout(0)`. Fragile; introduces drift between pi's actual state and the bridge's view.

**Implication**: initial-idle send produces no chip naturally — the message goes through as a fresh turn and renders as a regular user message in chat once `message_end` fires. This is the desired UX.

## Decision 7: Inline-chat steering instead of separate chip section

The v1 implementation rendered pending steers as chips in `QueuePanel.SteerSection`, above `CommandInput`. UX feedback: the chip location feels disconnected from the conversation flow; users want pending steers to appear inline with chat, anchored to the message they're trying to steer.

**Option A (chosen)**: render `Session.pendingQueues.steering[]` as user-style bubbles inside `ChatView`, positioned **at the bottom of the message list** (after the last assistant turn / streaming text). Each entry:

- Uses the same `bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400` user-message-bubble style.
- Has a small `STEERING` header (uppercase, tertiary text) with an animated spinner.
- Has a top-right ✕ button that dispatches `clear_steering_queue` (clears all; per-entry steer removal is still out of scope).
- Disappears when the bridge clears `bridgeSteering` on `turn_end`. The chat replay then naturally shows the corresponding user message once pi's `message_end` fires.

**Option B (rejected)**: keep chips in `QueuePanel` but visually link them with a connector to the chat. Adds visual chrome without changing the metaphor; chip remains feels detached.

**Option C (rejected)**: collapse pending steers into the last user message as an inline annotation. Loses the "this is in-flight" affordance and conflates two distinct entities (the original message + the steer instruction).

**Implication**: `QueuePanel.SteerSection` is deleted. `ChatView` gains a new rendering block driven by `Session.pendingQueues.steering` and an `onCancelSteering` callback. The `STEERING` header naturally communicates "pending delivery, not yet seen by the agent."

## Decision 8: Multi-entry follow-up queue with cycling navigation

The v1 implementation enforced capacity-1 on follow-up via `pi.clearFollowUpQueue()` before every send. UX feedback: users want to queue multiple follow-ups ("after fixing the bug, run tests, then commit, then notify me") with the ability to reorder priorities.

Pi natively supports `followUp: string[]` with arbitrary depth, so the constraint was purely dashboard-side.

**Option A (chosen)**: drop the capacity-1 invariant. The bridge's `bridgeFollowUp: string[]` accepts arbitrary entries (with a soft cap of 20 to prevent runaway). The client renders **one entry visible at a time** with cycle controls:

- **↑ (prev)**: navigate to previous entry (does NOT mutate the queue)
- **↓ (next)**: navigate to next entry
- **⇧ (promote-to-head)**: move the currently-visible entry to position 0 in the queue — it will be the first one pi drains at `agent_end`
- **(editable text)**: clicking the body opens inline edit; submitting replaces the currently-visible entry in-place
- **✕ (remove)**: removes the currently-visible entry from the queue (NOT the whole queue)

Mutations (promote, edit, remove) all implement via `pi.clearFollowUpQueue()` + replay of the new ordered queue via `pi.sendUserMessage(.., { deliverAs: "followUp" })`. O(N) replays per mutation. For N ≤ 20 this is sub-millisecond.

**Option B (rejected)**: drag-and-drop reorder of the entire queue. UI complexity not justified for v1; promote-to-head covers the dominant reorder use case ("do this one next").

**Option C (rejected)**: visible list of all entries with per-entry actions. Wastes vertical space; the cycling-one-at-a-time matches the follow-up's nature (only one is "about to be delivered" anyway).

**New protocol messages**:

- `promote_followup_entry { sessionId, index }` — reorder entry at `index` to position 0
- `remove_followup_entry { sessionId, index }` — drop entry at `index`
- `edit_followup_entry { sessionId, index, text, images? }` — replace entry at `index`

The v1 `clear_followup_slot` becomes `clear_followup_queue` (clears all entries; idempotent on empty).
The v1 `edit_followup_slot` is deprecated; clients migrate to `edit_followup_entry { index: 0 }`.

**Implication**: bridge state grows from `bridgeFollowUp: string | null` (conceptually cap-1) to `bridgeFollowUp: string[]`. Race tolerance: if pi drains entry 0 while user is editing entry N, the bridge's replay reflects the post-drain state. Acceptable: pi has already committed entry 0 to the assistant's context; trying to mutate it is a no-op from the user's perspective.

## Open Questions

- Should the follow-up queue survive `agent_end` and the next `session_start` for the same sessionId? Pi clears follow-up after drain; this change accepts that. If users want "sticky follow-ups", a follow-up change can persist via session metadata.
- Should we expose `agent.steeringMode` / `agent.followUpMode` as session-level settings? Currently both default to `"all"`. Power-user need; not a v1/v2 concern.
- What's the right UI affordance for "follow-up was just delivered"? When pi drains an entry, the visible card cycles to the next entry (or disappears if last). Animate "✓ delivered" briefly? Pure polish; defer.
- v2 inline-chat steering positions the chip "at the bottom of the message list." When the user scrolls up to read older messages, the steer chip stays anchored to the latest position — OK behavior. Should it follow the user's scroll instead? Defer.
- v2 multi-entry follow-up soft-caps at 20 entries. Should over-cap sends be rejected with a toast, or silently dropped? Lean reject-with-toast for clarity. Confirm during implementation.
