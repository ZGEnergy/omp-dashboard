## Why

Post-`add-steering-message` (PR #27), the dashboard has two prompt queues with asymmetric UX:

- **Steer queue** lives entirely inside pi. The dashboard sees only an optimistic chip for the *most-recent* steer. If the user sends three rapid steers, two are invisible. They cannot be cancelled (only `Abort`, which kills the whole turn). They cannot be edited.
- **Follow-up queue** is bridge-owned with full visibility and per-entry remove, but its multi-entry shape is a workaround for the missing **edit** affordance — users today must remove + retype to refine a queued follow-up.

Both gaps trace to one root cause: the dashboard lacks the simple mutation messages that would let users cancel/edit pending prompts. Pi exposes `clearSteeringQueue`, `clearFollowUpQueue`, `sendUserMessage({deliverAs})`, and emits a `queue_update` event at the AgentSession layer.

**Pi API constraint (discovered mid-implementation):** pi's `_emitExtensionEvent` forwards a fixed allowlist of events to extensions (agent_*, turn_*, message_*, tool_execution_*, model_select, session_*, before/after_provider_*, etc.) and **`queue_update` is NOT in that allowlist**. `pi.on("queue_update", ...)` registers a listener pi never calls. Consequence: the bridge must maintain its own *shadow* steering + follow-up queues, mirroring every mutation it performs (sends, clears, edits) plus the natural drain boundaries (`turn_end` drains steering, `agent_end` drains follow-up). The bridge — not pi-via-event — is the source of truth that browsers converge on via `queue_update` ExtensionToServerMessage.

This change closes the two UX holes with affordances that match each queue's actual drain cadence: steer drains every 1–15 s (slot mostly empty), follow-up drains only at `agent_end` (slot mostly occupied for long stretches).

## What Changes

### Server

- **Forward pi's `queue_update`** events from bridge → browser. Server caches the latest `{steering, followUp}` per session as `SessionUiState.pendingQueues`, so reconnecting browsers get the current state in their initial replay.
- **New browser-to-server WS messages**:
  - `clear_steering_queue { sessionId }`
  - `clear_followup_slot { sessionId }`
  - `edit_followup_slot { sessionId, text, images? }` — replaces the slot atomically (clear-then-send)
- Server forwards each to the appropriate bridge handler.

### Bridge (extension)

- **New bridge handlers** for the three new messages:
  - `clear_steering_queue` → `pi.clearSteeringQueue()`
  - `clear_followup_slot` → `pi.clearFollowUpQueue()`
  - `edit_followup_slot` → `pi.clearFollowUpQueue()` then `pi.sendUserMessage(text, {deliverAs:"followUp"})`
- **Listen for pi's `queue_update`** event; forward as a new `queue_update` ExtensionToServerMessage carrying `{steering: string[], followUp: string[]}`.
- **Enforce capacity = 1 on follow-up** at the bridge: any `send_prompt` with `delivery:"followUp"` whose slot is non-empty SHALL clear-then-send (replace semantics). Steer slot remains multi-entry (pi-managed).
- `PromptQueue` (bridge-owned mid-turn queue) is **removed** as a separate construct — its capability is subsumed by pi's native queues now that the bridge forwards `queue_update`. **BREAKING** for any consumer reading `queue_state` events directly (the existing server-cached `pendingQueue` field becomes derived from `queue_update`).

### Client (v1 — shipped, click-to-edit follow-up + chip-style steer)

- **`PromptQueuePanel` component** above `CommandInput` renders steer (multi-chip read-only) and follow-up (single click-to-edit full-width card).
- `CommandInput` keyboard contract unchanged from PR #27 (Enter = steer, Alt+Enter = followUp).
- Optimistic `pendingPrompt` chip is **removed** for both delivery modes. Authoritative state is `Session.pendingQueues` (from server forwarding the bridge's shadow-queue `queue_update`).

### Client (v2 — redesigned, this round)

- **Inline-chat steering**: pending steer entries no longer render in `PromptQueuePanel`. They render inside `ChatView` as user-style bubbles **positioned at the bottom of the chat** (after the last assistant turn / streaming text), with a `STEERING` header + spinner + ✕ cancel button. Once pi drains the entry on `turn_end`, the bridge's shadow steering[] clears — the chip disappears, and pi's normal `message_end` flow renders the prompt as a plain user message in chat. **Initial idle send produces no chip** (race fix below ensures `wasStreaming === false` skips the shadow record).
- **Multi-entry follow-up queue with cycling**: pi natively supports `followUp: string[]` with multiple entries. The bridge stops enforcing capacity-1 and instead maintains the full ordered queue in its shadow state. The client renders **one entry visible at a time** with three controls:
  - **Up arrow** — navigate to previous entry in queue (read-only browsing)
  - **Down arrow** — navigate to next entry
  - **Promote arrow** (↑↑ or jump-to-head) — move currently-visible entry to position 0 so pi drains it next at `agent_end`
  - Currently-visible entry is editable inline; submitting replaces that entry in the queue
  - ✕ removes the currently-visible entry only (not the whole queue); pi's `clearFollowUpQueue` followed by replay of the surviving entries enforces this.
- `PromptQueuePanel` shrinks to the follow-up surface only; steer rendering moves into `ChatView`.

### Bridge (v2 additions)

- **Capture-before-send streaming gate** (race fix): pi's `agent_start` fires synchronously inside `pi.sendUserMessage` on an idle session, which flips `isAgentStreaming` to `true` before the next sync line runs. The bridge must capture `wasStreaming = getBridgeState().isAgentStreaming` **before** calling `sendUserMessage`, and only record to the shadow queue when `wasStreaming === true`. The internal gate inside `recordSteerSent`/`recordFollowupSent` stays as defense-in-depth.
- **Multi-entry follow-up shadow**: drop the capacity-1 invariant; bridge accepts arbitrary follow-up depth. New browser messages: `promote_followup_entry { index }`, `remove_followup_entry { index }`, `edit_followup_entry { index, text, images? }`. Each is implemented by `pi.clearFollowUpQueue()` + replay of the new ordered list via `pi.sendUserMessage(.., { deliverAs: "followUp" })`.

### Capabilities

#### Modified Capabilities

- `mid-turn-prompt-queue` — broad rewrite. Replaces the bridge-owned `PromptQueue` model with the pi-mirrored model. Adds requirements for steering-queue visibility + bulk cancel, follow-up slot capacity, edit, and cancel. Adds requirement for `queue_update` event forwarding. Removes requirements tied to the bridge-owned `PromptQueue` (id format, drain on `agent_end`, `remove_queue_entry` / `clear_queue` messages → replaced by `clear_followup_slot` + `clear_steering_queue`).

## Impact

### v1 (shipped)

- **Protocol**: 3 new browser-to-server messages, 1 new extension-to-server message (`queue_update`), 1 new server-to-browser broadcast (`queue_update` mirrored), removal of `clear_queue` and `remove_queue_entry` browser messages (BREAKING — clients on older dashboards will see them rejected; rollout requires server + client lockstep).
- **Bridge**: +3 handlers, **shadow steering[] + followUp[] state** (bridge owns truth because pi doesn't expose `queue_update`), -1 PromptQueue class (~120 lines net change). Includes the capture-before-send race fix.
- **Server**: +1 event-wiring case (`queue_update` forward + cache), +3 handler methods in `session-action-handler.ts`, -2 handlers (`clear_queue`, `remove_queue_entry`).
- **Client**: New `QueuePanel.tsx` component (~180 lines, click-to-edit follow-up), edits to `ChatView.tsx`, edits to `App.tsx` wiring, edits to event-reducer.
- **Spec**: `openspec/specs/mid-turn-prompt-queue/spec.md` undergoes a significant rewrite; impacted requirements documented in `specs/mid-turn-prompt-queue/spec.md` of this change.
- **No pi version bump required.** Pi ≥ 0.71 (current dashboard minimum) exposes everything needed.

### v2 (this round, in progress)

- **Protocol**: 3 more browser-to-server messages: `promote_followup_entry`, `remove_followup_entry`, `edit_followup_entry`. The existing `clear_followup_slot` becomes `clear_followup_queue` (semantic widening from cap-1 slot to full queue), `edit_followup_slot` semantic narrowed to "replace ALL with one entry" or deprecated in favor of `edit_followup_entry { index: 0 }`.
- **Bridge**: shadow follow-up state grows from `string` to `string[]`. Promote / remove / edit implemented as `clearFollowUpQueue` + replay. Capacity-1 invariant dropped.
- **Server**: +3 handlers forwarding the new browser messages.
- **Client**: `QueuePanel.tsx` follow-up section gains cycling controls (↑ ↓ ⇧); steer rendering removed from `QueuePanel.tsx` and moves to `ChatView.tsx` as inline user-bubble-style cards (positioned at the bottom of the chat list, with `STEERING` header + spinner + ✕).
- **Out of scope (v2)**:
  - Reordering the entire queue via drag-and-drop. Only promote-to-head is provided.
  - Pi's `steeringMode` / `followUpMode` exposure as dashboard settings.
  - Mid-flight cancel of a follow-up entry pi has already started draining — race-tolerant (cancel may be late; pi processes the in-flight message anyway).
