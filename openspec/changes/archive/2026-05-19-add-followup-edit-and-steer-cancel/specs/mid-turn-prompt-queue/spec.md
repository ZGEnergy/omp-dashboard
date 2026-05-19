## REMOVED Requirements

### Requirement: Bridge holds a per-session mid-turn prompt queue

**Reason for removal**: The bridge-owned `PromptQueue` class is deleted. Pi's native follow-up and steering queues become the single source of truth. The dashboard mirrors pi's state via the `queue_update` event rather than maintaining a parallel store.

**Migration**: callers reading the old `Session.queue.pending: PendingPrompt[]` array migrate to `Session.pendingQueues: { steering: string[]; followUp: string[] }`. Opaque `id` values (`bq_<sessionId>_<n>`) are gone — pi's queue entries are addressed by index within their array.

### Requirement: Bridge emits `queue_state` events on every queue mutation

**Reason for removal**: Superseded by the new `queue_update` ExtensionToServerMessage emitted by the bridge from its shadow queue state. Pi does NOT forward `queue_update` events to extensions (verified via `_emitExtensionEvent` allowlist), so the bridge tracks shadow state itself and emits the message after every mutation. See design.md Decision 5.

### Requirement: Bridge drains the queue on `agent_end`

**Reason for removal**: There is no separate bridge-owned `PromptQueue` to drain via `pi.sendUserMessage`. The bridge's *shadow* queues mirror pi's natural drain boundaries: `turn_end` clears `bridgeSteering[]`, `agent_end` clears `bridgeFollowUp[]`. Each drain emits a fresh `queue_update`.

### Requirement: `clear_queue` browser-to-server message

**Reason for removal**: Replaced by two targeted messages — `clear_steering_queue` and `clear_followup_queue` (v2; was `clear_followup_slot` in v1) — each acting on exactly one pi queue. The split mirrors the new UX.

### Requirement: `remove_queue_entry` browser-to-server message

**Reason for removal**: Replaced in v2 by per-queue targeted messages — `remove_followup_entry` for follow-up (per-entry removal IS supported in v2 via clear-and-replay). Steer still offers bulk cancel only (`clear_steering_queue`).

### Requirement: Follow-up slot is capacity 1 with replace-on-send (v1)

**Reason for removal (in v2)**: The v1 cap-1 invariant is dropped. Follow-up is now a multi-entry queue (see new requirements below). The bridge no longer calls `pi.clearFollowUpQueue()` automatically before every send; only on explicit cancel / promote / remove / edit operations, each followed by a replay of the new ordered queue.

## MODIFIED Requirements

### Requirement: Server caches per-session queue state from `queue_update` events

The server SHALL maintain a per-session `pendingQueues: { steering: string[]; followUp: string[] }` field inside `SessionUiState`. The field SHALL be updated whenever a `queue_update` ExtensionToServerMessage arrives from a bridge for that session. The server SHALL include `pendingQueues` in every `session_updated` broadcast and in the initial-state replay sent on browser subscribe.

This replaces the prior `queue.pending: PendingPrompt[]` cache, which was sourced from the deleted `queue_state` event.

#### Scenario: queue_update populates the cache
- **WHEN** a bridge sends `queue_update { sessionId: "S", steering: ["a", "b"], followUp: ["c"] }`
- **THEN** the server SHALL set `SessionUiState[S].pendingQueues = { steering: ["a", "b"], followUp: ["c"] }`
- **AND** the server SHALL broadcast `session_updated` with the new value to subscribers

#### Scenario: Empty arrays clear the cache slot
- **WHEN** a bridge sends `queue_update { sessionId: "S", steering: [], followUp: [] }`
- **THEN** the server SHALL set `SessionUiState[S].pendingQueues = { steering: [], followUp: [] }`
- **AND** the server SHALL broadcast `session_updated`

#### Scenario: Reconnect replays the cached state
- **WHEN** a browser subscribes to session "S" whose `pendingQueues` is non-empty
- **THEN** the initial-state snapshot SHALL include the current `pendingQueues` value
- **AND** the client SHALL render chips for both arrays without waiting for a fresh `queue_update`

### Requirement: Typed-during-streaming prompts are forwarded to pi's native queues

When the bridge receives a `send_prompt` message AND `getBridgeState().isAgentStreaming` is `true` for the target session AND the prompt is not a slash, bash, compact, reload, new, model, or mgmt command, the bridge SHALL route the prompt directly to pi's native queue via `pi.sendUserMessage`, governed by `msg.delivery`:

- If `delivery === "followUp"` (or absent — backward compat with PR #27's default rule), the bridge SHALL call `pi.clearFollowUpQueue()` THEN `pi.sendUserMessage(text, { deliverAs: "followUp" })`. The clear-then-send sequence enforces a depth-1 invariant on pi's follow-up queue for dashboard-originated sessions.
- If `delivery === "steer"`, the bridge SHALL call `pi.sendUserMessage(text, { deliverAs: "steer" })` directly. The bridge SHALL NOT clear the steering queue first.

The bridge SHALL NOT maintain its own parallel storage for either case.

#### Scenario: Follow-up send while slot is empty
- **WHEN** the agent is streaming
- **AND** `pendingQueues.followUp` is `[]`
- **AND** the bridge receives `send_prompt { text: "run tests when done", delivery: "followUp" }`
- **THEN** the bridge SHALL call `pi.clearFollowUpQueue()` (no-op on empty queue)
- **AND** the bridge SHALL call `pi.sendUserMessage("run tests when done", { deliverAs: "followUp" })`
- **AND** the next `queue_update` SHALL show `followUp: ["run tests when done"]`

#### Scenario: Follow-up send while slot is occupied replaces the entry
- **WHEN** the agent is streaming
- **AND** `pendingQueues.followUp` is `["original text"]`
- **AND** the bridge receives `send_prompt { text: "replacement", delivery: "followUp" }`
- **THEN** the bridge SHALL call `pi.clearFollowUpQueue()`
- **AND** the bridge SHALL call `pi.sendUserMessage("replacement", { deliverAs: "followUp" })`
- **AND** the next `queue_update` SHALL show `followUp: ["replacement"]` (original lost; replace semantics by design — see design.md Decision 2)

#### Scenario: Steer send appends to pi's steering queue
- **WHEN** the agent is streaming
- **AND** `pendingQueues.steering` is `["earlier steer"]`
- **AND** the bridge receives `send_prompt { text: "new steer", delivery: "steer" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("new steer", { deliverAs: "steer" })`
- **AND** the bridge SHALL NOT clear the steering queue
- **AND** the next `queue_update` SHALL show `steering: ["earlier steer", "new steer"]`

#### Scenario: Idle send bypasses queue routing
- **WHEN** the agent is idle
- **AND** the bridge receives `send_prompt { text: "hi" }` (with or without `delivery` field)
- **THEN** the bridge SHALL call `pi.sendUserMessage("hi")` without any `deliverAs` option
- **AND** the bridge SHALL NOT call `clearFollowUpQueue` or `clearSteeringQueue`

## ADDED Requirements

### Requirement: Bridge forwards pi's `queue_update` events to the server

The bridge SHALL subscribe to pi's `queue_update` events (via `pi.events?.on("queue_update", ...)`) and forward each event as a `queue_update` ExtensionToServerMessage carrying `{ sessionId, steering: string[], followUp: string[] }`. The bridge SHALL forward every event without filtering — the server is responsible for caching and broadcasting.

The bridge SHALL register the listener exactly once per pi instance and unregister it on session shutdown / re-register.

#### Scenario: Pi emits queue_update, bridge forwards
- **WHEN** pi emits `{ type: "queue_update", steering: ["x"], followUp: ["y"] }`
- **THEN** the bridge SHALL send `queue_update { sessionId, steering: ["x"], followUp: ["y"] }` to the server

#### Scenario: Bridge unregisters listener on session shutdown
- **WHEN** the bridge receives `shutdown` for a session
- **THEN** the `queue_update` listener for that pi instance SHALL be removed
- **AND** no further forwards SHALL occur for that sessionId

### Requirement: `clear_steering_queue` browser-to-server message

The protocol SHALL define a `clear_steering_queue { type: "clear_steering_queue"; sessionId: string }` message sent from the browser to the server. The server SHALL forward it to the bridge for the named session. The bridge SHALL call `pi.clearSteeringQueue()`. Pi SHALL emit a fresh `queue_update` reflecting the empty steering array, which propagates to the client via the normal forward path.

#### Scenario: Cancel-all wipes pi's steering queue
- **WHEN** `pendingQueues.steering` is `["a", "b", "c"]`
- **AND** the browser sends `clear_steering_queue { sessionId: "S" }`
- **THEN** the bridge SHALL call `pi.clearSteeringQueue()`
- **AND** the resulting `queue_update` SHALL show `steering: []`

#### Scenario: Cancel-all on empty queue is a safe no-op
- **WHEN** `pendingQueues.steering` is `[]`
- **AND** the browser sends `clear_steering_queue { sessionId: "S" }`
- **THEN** the bridge SHALL still call `pi.clearSteeringQueue()` (idempotent)
- **AND** no error SHALL be raised

### Requirement: `clear_followup_slot` browser-to-server message

The protocol SHALL define a `clear_followup_slot { type: "clear_followup_slot"; sessionId: string }` message. The bridge SHALL call `pi.clearFollowUpQueue()`. The resulting `queue_update` SHALL show `followUp: []`.

#### Scenario: Cancel removes the single follow-up entry
- **WHEN** `pendingQueues.followUp` is `["run tests"]`
- **AND** the browser sends `clear_followup_slot { sessionId: "S" }`
- **THEN** the bridge SHALL call `pi.clearFollowUpQueue()`
- **AND** the resulting `queue_update` SHALL show `followUp: []`

### Requirement: `edit_followup_slot` browser-to-server message

The protocol SHALL define an `edit_followup_slot { type: "edit_followup_slot"; sessionId: string; text: string; images?: ImageContent[] }` message. The bridge SHALL apply the same clear-then-send sequence used by `send_prompt {delivery:"followUp"}`: call `pi.clearFollowUpQueue()` THEN `pi.sendUserMessage(text, { deliverAs: "followUp" })`. The resulting `queue_update` SHALL show `followUp: [text]`.

This message is functionally equivalent to `send_prompt {delivery:"followUp"}` but is named distinctly to make UI intent unambiguous (the chip's ✏ button is wired to this message; the textarea's Alt+Enter is wired to `send_prompt`).

#### Scenario: Edit replaces the follow-up slot atomically
- **WHEN** `pendingQueues.followUp` is `["original"]`
- **AND** the browser sends `edit_followup_slot { sessionId: "S", text: "revised" }`
- **THEN** the bridge SHALL call `pi.clearFollowUpQueue()` then `pi.sendUserMessage("revised", { deliverAs: "followUp" })`
- **AND** the resulting `queue_update` SHALL show `followUp: ["revised"]`

#### Scenario: Edit on empty slot just sets the slot
- **WHEN** `pendingQueues.followUp` is `[]`
- **AND** the browser sends `edit_followup_slot { sessionId: "S", text: "newly composed" }`
- **THEN** the bridge SHALL still call `pi.clearFollowUpQueue()` (no-op) then `pi.sendUserMessage(...)`
- **AND** the resulting `queue_update` SHALL show `followUp: ["newly composed"]`

### Requirement: Client renders the `PromptQueuePanel` above `CommandInput`

The client SHALL render a `PromptQueuePanel` component above the chat input bar whenever `state.pendingQueues.steering.length > 0` OR `state.pendingQueues.followUp.length > 0`. The component SHALL render two sub-sections in this order:

1. **Steer chips** (read-only): one chip per entry in `pendingQueues.steering`, in array order. When the array is non-empty, the panel SHALL render a single `[Cancel all steering]` button beneath the chip list, which dispatches `clear_steering_queue` on click. No per-chip buttons SHALL be rendered for steer.

2. **Follow-up chip** (interactive): a single chip rendering `pendingQueues.followUp[0]` when the array is non-empty. The chip SHALL include a `✏` (edit) button and a `✕` (cancel) button. Clicking `✏` SHALL open an inline editor pre-filled with the current text; submitting dispatches `edit_followup_slot`. Clicking `✕` dispatches `clear_followup_slot`. Additional entries (`pendingQueues.followUp[1...]`) are not rendered — see design.md "Risks" for non-dashboard injectors.

The panel SHALL hide entirely when both arrays are empty.

#### Scenario: Steer chips render read-only with bulk cancel
- **WHEN** `pendingQueues.steering` is `["A", "B"]` and `pendingQueues.followUp` is `[]`
- **THEN** the panel SHALL render two read-only chips ("A", "B") and a "Cancel all steering" button
- **AND** no follow-up section SHALL be rendered

#### Scenario: Follow-up chip renders editable + cancelable
- **WHEN** `pendingQueues.followUp` is `["run tests"]` and `pendingQueues.steering` is `[]`
- **THEN** the panel SHALL render one chip with text "run tests" and two buttons (✏ and ✕)
- **AND** no steer section SHALL be rendered

#### Scenario: Both queues populated render both sections
- **WHEN** both arrays are non-empty
- **THEN** the panel SHALL render the steer section first, then the follow-up section, separated by a horizontal divider

#### Scenario: Panel hides when all queues empty
- **WHEN** both `pendingQueues.steering` and `pendingQueues.followUp` are `[]`
- **THEN** the panel SHALL render nothing (no empty-state placeholder)

### Requirement: Client uses authoritative `pendingQueues`, no optimistic chip

The client SHALL NOT maintain an optimistic `pendingPrompt` slot when sending a prompt. Pending state SHALL be rendered exclusively from `state.pendingQueues`, populated via server-broadcast `queue_update` events.

`useSessionActions.handleSend` SHALL dispatch the `send_prompt` WS message and SHALL NOT mutate `state.pendingPrompt`. The `pendingPrompt` field and the `PendingPrompt` type SHALL be removed from `SessionState`.

#### Scenario: Send appears in panel only after queue_update
- **WHEN** the user sends a follow-up via Alt+Enter
- **THEN** no chip SHALL appear immediately
- **AND** when `queue_update` arrives with the new entry, the chip SHALL render

#### Scenario: No optimistic state to reconcile on bridge error
- **WHEN** the bridge fails to call `pi.sendUserMessage` (e.g., session ended mid-send)
- **THEN** no stale optimistic chip SHALL be visible
- **AND** the user retypes if they want to retry

### Requirement: Send-while-occupied on follow-up replaces silently (v1, deprecated in v2)

**Status**: superseded by Requirement "Follow-up send appends to the queue" below. The v1 replace-semantics relied on the cap-1 invariant which v2 drops.

When the user presses Alt+Enter (or equivalent send-with-followup gesture) while `pendingQueues.followUp.length > 0`, the client SHALL dispatch `send_prompt {delivery:"followUp"}` as normal. The bridge's clear-then-send handler causes the existing slot entry to be discarded. No confirmation modal SHALL be displayed.

#### Scenario: Alt+Enter replaces existing follow-up
- **WHEN** `pendingQueues.followUp` is `["original"]`
- **AND** the user types "new" and presses Alt+Enter
- **THEN** the client SHALL send `send_prompt { delivery: "followUp", text: "new" }`
- **AND** no confirmation dialog SHALL be shown
- **AND** the next `queue_update` SHALL show `followUp: ["new"]`

## ADDED Requirements (v2)

### Requirement: Bridge maintains shadow steering and follow-up queues

Pi's `_emitExtensionEvent` does not forward `queue_update` events to extensions. The bridge SHALL maintain `bridgeSteering: string[]` and `bridgeFollowUp: string[]` per session. Every mutation the bridge performs against pi (sends, clears, edits, promotions, removals) SHALL update the shadow state and emit a `queue_update` ExtensionToServerMessage.

**Drain mechanism (per-entry, mirrors pi):** when pi delivers a queued entry (steer or follow-up), pi emits a user `message_start` with that entry's text as the message content. The bridge SHALL handle this by finding the matching entry in `bridgeSteering[]` first then `bridgeFollowUp[]`, removing the **first** occurrence (FIFO), and emitting a fresh `queue_update`. This mirrors pi's own internal logic in `_processAgentEvent` (pi-coding-agent `agent-session.js`) which performs the same matcher on its private `_steeringMessages` / `_followUpMessages` arrays. Steering is checked first to match pi's order.

**No bulk clear at drain boundaries:** the bridge SHALL NOT bulk-clear `bridgeSteering[]` at `turn_end` nor `bridgeFollowUp[]` at `agent_end`. Pi may emit those boundary events between drains while user-added entries are still pending; a bulk clear would wipe legitimate new entries the user queued during the drain window. The per-entry matcher is the only mechanism that mutates the shadow on drain.

**Session-change reset:** session-change events (new / fork / resume) SHALL reset both arrays to `[]` and emit once. This is a true reset (different session — old queue is meaningless), not a drain artifact.

The shadow queue is the source of truth for the dashboard. External (non-dashboard) consumers that mutate pi's queues bypass the shadow; the dashboard does not reflect such state.

#### Scenario: Bridge records a steer mid-stream
- **WHEN** the agent is streaming
- **AND** the bridge sends `pi.sendUserMessage("focus on X", {deliverAs:"steer"})`
- **THEN** the bridge SHALL append `"focus on X"` to `bridgeSteering[]`
- **AND** the bridge SHALL emit `queue_update { steering: [...], followUp: [...] }`

#### Scenario: Per-entry follow-up drain shrinks the queue incrementally
- **WHEN** `bridgeFollowUp` is `["a", "b", "c"]`
- **AND** pi drains `"a"` by emitting user `message_start` with content `"a"`
- **THEN** the bridge SHALL set `bridgeFollowUp` to `["b", "c"]`
- **AND** the bridge SHALL emit a `queue_update` reflecting the new shorter queue
- **WHEN** pi subsequently drains `"b"`
- **THEN** `bridgeFollowUp` SHALL be `["c"]`
- **WHEN** pi subsequently drains `"c"`
- **THEN** `bridgeFollowUp` SHALL be `[]`

#### Scenario: Per-entry steering drain checked before follow-up
- **WHEN** `bridgeSteering` is `["hello"]` and `bridgeFollowUp` is `["hello"]`
- **AND** pi delivers a user `message_start` with content `"hello"`
- **THEN** the bridge SHALL remove the steering entry first (pi's order)
- **AND** `bridgeSteering` SHALL be `[]` while `bridgeFollowUp` SHALL still be `["hello"]`

#### Scenario: Entries added DURING drain survive
- **WHEN** `bridgeFollowUp` is `["a", "b"]`
- **AND** pi drains `"a"` (queue becomes `["b"]`)
- **AND** the user types `"c"` + Alt+Enter while pi is still working on `"a"`
- **THEN** `bridgeFollowUp` SHALL be `["b", "c"]`
- **AND** when pi eventually drains `"b"` the queue SHALL be `["c"]`
- **AND** when pi drains `"c"` the queue SHALL be `[]`

#### Scenario: Non-matching user message_start does not mutate the shadow
- **WHEN** `bridgeFollowUp` is `["queued"]` and `bridgeSteering` is `[]`
- **AND** pi emits a user `message_start` with content `"fresh send"` (not in either queue)
- **THEN** neither `bridgeSteering` nor `bridgeFollowUp` SHALL be mutated
- **AND** no `queue_update` SHALL be emitted for this event

#### Scenario: Duplicate text removes only the first occurrence (FIFO)
- **WHEN** `bridgeFollowUp` is `["dup", "other", "dup"]`
- **AND** pi drains `"dup"`
- **THEN** `bridgeFollowUp` SHALL be `["other", "dup"]` (first occurrence removed)

#### Scenario: turn_end does NOT bulk-clear steering
- **WHEN** `bridgeSteering` is `["a"]` (e.g. user added it mid-drain after a different entry was already delivered)
- **AND** pi emits `turn_end`
- **THEN** the bridge SHALL NOT mutate `bridgeSteering`
- **AND** `"a"` SHALL remain queued until pi explicitly drains it (per-entry matcher)

#### Scenario: agent_end does NOT bulk-clear follow-up
- **WHEN** `bridgeFollowUp` is `["x"]` (a user-added entry that has not yet been drained)
- **AND** pi emits `agent_end`
- **THEN** the bridge SHALL NOT mutate `bridgeFollowUp`
- **AND** `"x"` SHALL remain queued until pi drains it via user `message_start`

### Requirement: Capture-before-send streaming gate prevents idle-message false-chip

Pi flips `isAgentStreaming` synchronously inside `pi.sendUserMessage` on an idle session (via `agent_start` emission to the extension runner). Therefore the bridge SHALL capture `wasStreaming = isAgentStreaming` **before** calling `pi.sendUserMessage`, and SHALL only record to the shadow queue when `wasStreaming === true`.

Call sites:

- `command-handler.ts` passthrough branch: capture before `sendUserMessageWithImages`, fire `onSteerSent` / `onFollowupSent` only if captured-true.
- `bridge.ts` `sessionPrompt` fallback (slash-route follow-up/steer): same pattern.
- `bridge.ts` `edit_followup_slot` / `edit_followup_entry` handler: same pattern.

The internal gate inside `recordSteerSent` / `recordFollowupSent` SHALL also check `isAgentStreaming` as defense-in-depth.

#### Scenario: Initial idle send produces no chip
- **WHEN** the agent is idle (`isAgentStreaming === false`)
- **AND** the bridge receives `send_prompt { text: "hello", delivery: "steer" }`
- **AND** pi flips `isAgentStreaming` to `true` synchronously inside `pi.sendUserMessage` (via agent_start)
- **THEN** the bridge SHALL NOT append to `bridgeSteering`
- **AND** the bridge SHALL NOT emit `queue_update` with a chip
- **AND** the message SHALL be processed by pi as a fresh turn

#### Scenario: Mid-stream steer produces a chip
- **WHEN** `isAgentStreaming === true` at the moment of `send_prompt {delivery:"steer"}`
- **THEN** the bridge SHALL append to `bridgeSteering`
- **AND** the bridge SHALL emit `queue_update` with the new entry

### Requirement: Pending steer entries render inline in chat as user-style bubbles

The client SHALL render each entry of `Session.pendingQueues.steering[]` as a user-message-style bubble inside `ChatView`, positioned **at the bottom of the message list** (after the last assistant turn and any streaming text). Each rendered bubble SHALL:

- Use the same visual style as a real user message (`bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md`).
- Display a `STEERING` header (uppercase, tertiary text) with an animated spinner.
- Display a top-right ✕ button that dispatches `clear_steering_queue` (bulk cancel; per-entry steer removal remains out of scope).
- Disappear when `pendingQueues.steering[]` is empty (the bridge clears the shadow on `turn_end`). At that point pi's `message_end` will have already rendered the corresponding user message in chat, so the chat surface looks coherent.

The `QueuePanel.SteerSection` component SHALL be removed.

#### Scenario: Pending steer appears at the bottom of chat
- **WHEN** `Session.pendingQueues.steering` is `["focus on X"]`
- **AND** the message list ends with an assistant message
- **THEN** `ChatView` SHALL render "focus on X" as a user-style bubble after the assistant message, with `STEERING` header + spinner + ✕

#### Scenario: Multiple pending steers render in order
- **WHEN** `Session.pendingQueues.steering` is `["a", "b", "c"]`
- **THEN** `ChatView` SHALL render three bubbles in array order, all positioned at the bottom

#### Scenario: Steer chip disappears when shadow clears
- **WHEN** `Session.pendingQueues.steering` transitions from `["a"]` to `[]` (because pi emitted turn_end)
- **THEN** the inline `STEERING` bubble SHALL disappear
- **AND** the chat SHALL show "a" as a real user message once pi emits `message_end` for that user message

### Requirement: Follow-up is a multi-entry queue with cycling navigation

The bridge SHALL accept arbitrary follow-up depth (soft cap: 20 entries). The client SHALL render the follow-up surface with **one entry visible at a time** and three navigation controls:

- **Up arrow (↑)**: navigate to the previous entry in `pendingQueues.followUp[]` for read-only browsing. Does NOT mutate the queue. Disabled when `currentIndex === 0`.
- **Down arrow (↓)**: navigate to the next entry. Disabled when `currentIndex === pendingQueues.followUp.length - 1`.
- **Promote-to-head (⇧)**: dispatch `promote_followup_entry { sessionId, index: currentIndex }`. Bridge moves entry to position 0 via `pi.clearFollowUpQueue()` + replay; resulting `queue_update` SHALL reflect the new ordering.

The currently-visible entry SHALL be:

- **Click-to-edit**: clicking the body opens inline edit. Submitting (Enter, blur) dispatches `edit_followup_entry { sessionId, index: currentIndex, text }`. The bridge clears + replays; resulting `queue_update` SHALL show the edited text at `currentIndex`.
- **Removable (✕)**: dispatches `remove_followup_entry { sessionId, index: currentIndex }`. Bridge clears + replays the surviving entries; resulting `queue_update` SHALL omit the removed entry.

#### Scenario: Single-entry follow-up shows just one card
- **WHEN** `pendingQueues.followUp` is `["run tests"]`
- **THEN** the client SHALL render one card with text "run tests"
- **AND** ↑ and ↓ SHALL be disabled
- **AND** ⇧ SHALL be either disabled or a no-op (entry already at position 0)

#### Scenario: Multi-entry follow-up shows one with cycling
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex` starts at 0
- **THEN** the client SHALL render "a" as the visible card
- **AND** ↓ SHALL be enabled (advances to index 1)
- **AND** ↑ SHALL be disabled
- **AND** the card SHALL show a position indicator (e.g. "1 of 3")

#### Scenario: Promote moves entry to head
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex === 2` (showing "c")
- **AND** the user clicks ⇧
- **THEN** the client SHALL dispatch `promote_followup_entry { index: 2 }`
- **AND** the next `queue_update` SHALL show `followUp: ["c", "a", "b"]`
- **AND** the client SHALL adjust `currentIndex` to 0 to keep showing "c"

#### Scenario: Remove drops one entry
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex === 1` (showing "b")
- **AND** the user clicks ✕
- **THEN** the client SHALL dispatch `remove_followup_entry { index: 1 }`
- **AND** the next `queue_update` SHALL show `followUp: ["a", "c"]`
- **AND** `currentIndex` SHALL adjust so a valid entry remains visible (clamp to `length - 1`)

#### Scenario: Edit replaces the visible entry in-place
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex === 1`
- **AND** the user clicks the body, edits to "b-revised", submits
- **THEN** the client SHALL dispatch `edit_followup_entry { index: 1, text: "b-revised" }`
- **AND** the next `queue_update` SHALL show `followUp: ["a", "b-revised", "c"]`
- **AND** `currentIndex` SHALL stay at 1

### Requirement: Follow-up send appends to the queue (v2 replace of v1 send-while-occupied semantics)

When the user presses Alt+Enter (or equivalent send-with-followup gesture), the client SHALL dispatch `send_prompt {delivery:"followUp", text}` as normal. The bridge SHALL append the new entry to `bridgeFollowUp[]` (NOT replace the existing entries). The client SHALL update `currentIndex` to point at the newly-appended entry so the user immediately sees what they just queued.

#### Scenario: Send while queue non-empty appends
- **WHEN** `pendingQueues.followUp` is `["a", "b"]`
- **AND** the user types "c" + Alt+Enter
- **THEN** the bridge SHALL append "c" to `bridgeFollowUp`
- **AND** the next `queue_update` SHALL show `followUp: ["a", "b", "c"]`
- **AND** the client SHALL set `currentIndex` to 2

#### Scenario: Send while queue empty initializes
- **WHEN** `pendingQueues.followUp` is `[]`
- **AND** the user types "first" + Alt+Enter
- **THEN** the bridge SHALL set `bridgeFollowUp` to `["first"]`
- **AND** `currentIndex` SHALL be 0

#### Scenario: Soft cap on queue depth
- **WHEN** `pendingQueues.followUp.length === 20` (soft cap)
- **AND** the user attempts to send another follow-up
- **THEN** the bridge SHALL reject the new entry (drop or emit a toast — implementation choice)
- **AND** the user-visible state SHALL communicate the cap (toast or disabled send)

### Requirement: Drained queued user message renders AFTER the preceding assistant message in chat

This invariant applies to BOTH drain boundaries:

- **Steer drain** at `turn_end` (Enter while streaming)
- **Follow-up drain** at `agent_end` (Alt+Enter while streaming)

When pi drains a queued user message at either boundary, the resulting user `message_start` event SHALL arrive on the wire AFTER the preceding assistant `message_end` event for the same turn. The client reducer SHALL therefore append the drained user bubble to `state.messages[]` AFTER the assistant's final response, not before it.

At either boundary pi emits four events synchronously back-to-back in this order:

1. `message_end` (assistant — the final response of the just-completed turn)
2. `turn_end` OR `agent_end` (the drain boundary)
3. `message_start` (user — the drained steer or follow-up text)
4. `message_end` (user — same text)

The bridge defers every `message_end` send via `setTimeout(0)` for entryId capture (per `fix-per-message-fork`). To preserve pi's emit order on the wire, the bridge SHALL also defer USER `message_start` sends via the same `setTimeout(0)` so they queue in the timer FIFO behind any pending `message_end` deferrals. The check is on `messageRef.role === "user"` — it does NOT discriminate by drain source (steer / follow-up / fresh send all funnel through the same code path).

The bridge SHALL NOT defer ASSISTANT `message_start` sends — `message_update` events fire synchronously and the reducer's `streamingTextFlushed` reset depends on the assistant `message_start` being processed first.

#### Scenario: Drained STEER appears below the assistant's final response
- **WHEN** the agent is mid-turn streaming `"weather report"`
- **AND** the user types `"asd"` and presses Enter (delivery=steer)
- **AND** the assistant finishes the current turn
- **AND** pi drains the steer at `turn_end`, delivering `"asd"` as a new user message
- **THEN** the wire order received by the client SHALL be: `turn_end`, `message_end` (assistant `"weather report"`), `message_start` (user `"asd"`), `message_end` (user `"asd"`)
- **AND** the client SHALL render `"weather report"` (assistant bubble) ABOVE `"asd"` (user bubble) in the chat

#### Scenario: Drained FOLLOW-UP appears below the assistant's final response
- **WHEN** the agent is mid-turn streaming `"weather report"`
- **AND** the user types `"asd"` and presses Alt+Enter (delivery=followUp)
- **AND** the assistant finishes the entire agent run
- **AND** pi drains the follow-up at `agent_end`, delivering `"asd"` as a new user message
- **THEN** the wire order received by the client SHALL be: `agent_end`, `message_end` (assistant `"weather report"`), `message_start` (user `"asd"`), `message_end` (user `"asd"`)
- **AND** the client SHALL render `"weather report"` (assistant bubble) ABOVE `"asd"` (user bubble) in the chat

#### Scenario: Bridge defers USER message_start, sends ASSISTANT message_start sync
- **WHEN** the bridge handles a `message_start` event
- **AND** the message's `role` is `"user"`
- **THEN** the bridge SHALL queue the `connection.send` via `setTimeout(0)`
- **AND** the bridge SHALL keep `wrapAppendMessageForCtx` + `pendingNonces.set` synchronous (state mutations must run sync before the handler returns)
- **WHEN** the bridge handles a `message_start` event
- **AND** the message's `role` is `"assistant"`
- **THEN** the bridge SHALL call `connection.send` synchronously (so subsequent `message_update` events arrive after the reducer has processed `message_start` and reset `streamingTextFlushed`)

#### Scenario: Multiple drained entries preserve their pi emit order
- **WHEN** a queue contains `["a", "b"]` at the drain boundary (steer or follow-up)
- **AND** pi drains both entries in order
- **THEN** the wire order SHALL be: assistant `message_end`, user `message_start "a"`, user `message_end "a"`, user `message_start "b"`, user `message_end "b"`
- **AND** the chat SHALL render the assistant message first, then `"a"`, then `"b"`

#### Scenario: Idle user send is unaffected by the deferral
- **WHEN** the user sends a prompt on an idle session
- **AND** no `message_end` is pending in the timer queue
- **THEN** the user `message_start` SHALL still be deferred via `setTimeout(0)` (uniform handling)
- **AND** the message SHALL appear in chat after exactly one macrotask delay (visually instant)
