## REMOVED Requirements

### Requirement: Queue panel renders above the chat input

**Reason for removal**: The original "Queue panel renders above the chat input" requirement mandated a `clear_queue` "Clear all" affordance and per-chip `remove_queue_entry` buttons. Both required queue-mutation primitives that pi's `ExtensionAPI` (verified through pi 0.76.0) does not expose to extensions. Superseded by the new "Read-only QueuePanel above CommandInput" requirement below.

### Requirement: `clear_steering_queue` browser-to-server message

**Reason for removal**: The bridge handler called `pi.clearSteeringQueue()` which is not on pi's ExtensionAPI surface — a silent no-op. The message type produced shadow-only mutations that desynced the bridge shadow from pi's real queue. Pi keeps delivering the "cleared" steers at the next drain. The honest answer is to delete the message type entirely; until upstream pi exposes the method, there is no clean way to honor this protocol message.

### Requirement: `clear_followup_slot` browser-to-server message

**Reason for removal**: Same as above. `pi.clearFollowUpQueue()` is not on pi's ExtensionAPI; the handler's call has always been a silent no-op. Shadow-only mutation produced ghost follow-up deliveries.

### Requirement: `edit_followup_slot` browser-to-server message

**Reason for removal**: The "clear-then-send" sequence cannot work without `pi.clearFollowUpQueue()`. The bridge's `rewriteFollowupQueue` implementation re-sent survivors via `sendUserMessage`, which appended to pi's real queue instead of replacing the slot — producing duplicate deliveries (empirically: editing `[α]` to `[β]` made pi deliver `[α, β]`).

### Requirement: Client renders the `PromptQueuePanel` above `CommandInput`

**Reason for removal**: The PromptQueuePanel specified bulk-cancel-steering, per-chip ✕ on follow-up, and a ✏ (edit) button — all wired to message types removed above. Superseded by the new "Read-only QueuePanel above CommandInput" requirement which keeps the panel placement and display semantics but drops every mutation affordance.

### Requirement: Send-while-occupied on follow-up replaces silently (v1, deprecated in v2)

**Reason for removal**: The v1 replace-semantics relied on a "cap-1 invariant" that was never enforced (`pi.clearFollowUpQueue()` is a no-op through the ext API). The bridge's append behavior was always the truth on the wire. The requirement encoded a fiction that never matched implementation. The surviving "Follow-up send appends to the queue" requirement already documents the real behavior.

### Requirement: Follow-up is a multi-entry queue with cycling navigation

**Reason for removal**: The requirement mandated promote (`⇧`), per-chip remove (`✕`), and click-to-edit affordances dispatched as `promote_followup_entry`, `remove_followup_entry`, `edit_followup_entry`. All three protocol messages and their bridge handlers are deleted by this change because pi exposes no clean way to mutate its queue. Superseded by the new "Read-only follow-up cycling navigation" requirement below.

### Requirement: Session shutdown resets shadow queues and clears pi's native queues

**Reason for removal**: The requirement mandated calls to `pi.clearSteeringQueue()` / `pi.clearFollowUpQueue()` during shutdown. Those methods are not on the ExtensionAPI; the calls were silent no-ops while the spec implied they worked. The shadow-reset step is also incorrect — shadow arrays must stay in sync with pi's actual queues, and pi's queues persist across `cachedCtx.shutdown` (until the process actually exits via the safety-net `setTimeout`). Superseded by the new "Session shutdown invokes cachedCtx.shutdown directly" requirement below.

### Requirement: User abort resets shadow queues and clears pi's native queues

**Reason for removal**: Same root cause. `pi.abort()` (and `cachedCtx.abort()`) signals the `AbortController` only — it does NOT clear queues, by design in pi-agent-core (`Agent.abort()` source verified). Queued messages persist across abort and drain at the next prompt. The "match pi-TUI's restoreQueuedMessagesToEditor" rationale was misapplied — that pi-TUI behavior depends on the internal `clearAllQueues` method which is not exposed to extensions. Superseded by the new "User abort invokes cachedCtx.abort directly" requirement below.

### Requirement: Client restores aborted queue text into the command-input draft

**Reason for removal**: The Stop → yank-to-draft UX told users "your queued text is now back in your draft, you can edit it". But pi's queues persist across `abort()` (see above), so the original queued text also drains at the next prompt — the user sees their edited draft AND the original ghost. Without `pi.clearFollowUpQueue` / `clearSteeringQueue` on the extension API, there is no honest way to yank-without-ghost. Drop the yank entirely; queued messages stay visible in the read-only QueuePanel until pi drains them. Users who want to cancel a queued message must wait for upstream pi to expose the clear primitive (tracked separately).

## ADDED Requirements

### Requirement: Read-only QueuePanel above CommandInput

The client SHALL render a `QueuePanel` component between the message list and the `CommandInput` whenever `Session.pendingQueues.followUp.length > 0` for the currently selected session. The panel SHALL be **display-only** with the following structure:

1. A subtitle line: `Follow-up — delivered when the agent finishes the turn` (uppercase, tertiary text colour).
2. A cycler showing one follow-up entry at a time with two navigation buttons (`↑` and `↓`) and a position counter (e.g. `2 of 3`).
3. The visible entry's full text on a single line with overflow ellipsis.

The panel SHALL NOT render:

- A "Clear all" button.
- A per-entry ✕ remove button.
- A per-entry ✎ edit button or click-to-edit affordance.
- A ⇧ promote-to-head button.
- Any other element that dispatches a queue-mutation protocol message.

Steering entries (`Session.pendingQueues.steering`) SHALL NOT appear in the QueuePanel. Steering renders inline in `ChatView` as ghost user-message bubbles labeled "steering" (covered by the surviving "Pending steer entries render inline in chat" requirement).

The panel SHALL hide entirely when `pendingQueues.followUp` is empty, even if `pendingQueues.steering` is non-empty.

The `↑` / `↓` buttons SHALL navigate the visible entry only; they SHALL NOT mutate `pendingQueues` and SHALL NOT emit any wire message.

#### Scenario: Empty follow-up hides the panel
- **WHEN** `Session.pendingQueues.followUp` is `[]`
- **THEN** the QueuePanel SHALL NOT be rendered, regardless of `pendingQueues.steering`

#### Scenario: Single follow-up entry renders with both arrows disabled
- **WHEN** `Session.pendingQueues.followUp` is `["run tests"]`
- **THEN** the QueuePanel SHALL render with the subtitle, counter `1 of 1`, and entry text "run tests"
- **AND** the `↑` and `↓` buttons SHALL be visually disabled

#### Scenario: Multi-entry follow-up cycles read-only
- **WHEN** `Session.pendingQueues.followUp` is `["A", "B", "C"]`
- **THEN** the QueuePanel SHALL render the most-recent entry initially (counter `3 of 3`, text "C")
- **AND** clicking `↑` SHALL advance the visible entry to position `2 of 3` ("B")
- **AND** clicking `↑` again SHALL advance to `1 of 3` ("A")
- **AND** no wire message SHALL be sent in response to either click
- **AND** `Session.pendingQueues.followUp` SHALL remain `["A", "B", "C"]` unchanged

#### Scenario: Panel renders no mutation buttons
- **WHEN** `Session.pendingQueues.followUp` is non-empty
- **THEN** the QueuePanel JSX SHALL contain exactly two interactive elements (the `↑` and `↓` buttons)
- **AND** no element SHALL dispatch `clear_*`, `remove_*`, `edit_*`, or `promote_*` protocol messages under any user interaction

#### Scenario: Long entry text truncates with ellipsis
- **WHEN** an entry's text exceeds the panel's render width
- **THEN** the panel SHALL display the text with an ellipsis on a single line
- **AND** the text SHALL NOT wrap to multiple lines

#### Scenario: Steering does not render in the panel
- **WHEN** `Session.pendingQueues.steering` is `["focus on auth"]` and `Session.pendingQueues.followUp` is `[]`
- **THEN** the QueuePanel SHALL NOT be rendered
- **AND** the steering entry SHALL render in `ChatView` as an inline ghost user-message bubble (separate requirement)

### Requirement: Read-only follow-up cycling navigation

When `Session.pendingQueues.followUp.length > 1`, the QueuePanel cycler SHALL provide `↑` and `↓` navigation buttons that change which entry is visible WITHOUT mutating the queue.

- `↑` SHALL move the visible index back by 1, clamped at 0.
- `↓` SHALL move the visible index forward by 1, clamped at `length - 1`.
- Initial visible index on first render SHALL be `length - 1` (the most-recently-queued entry).
- When `length === 1`, both buttons SHALL be disabled.
- The position counter SHALL display `(visibleIndex + 1) of length`.
- A new entry appended to the queue (via `send_prompt {delivery:"followUp"}`) SHALL automatically advance the visible index to point at the new last entry.

The bridge SHALL NOT receive any wire message in response to `↑` / `↓` clicks. The cycler is a pure client-side UI state.

#### Scenario: Initial index points at the most-recent entry
- **WHEN** `pendingQueues.followUp` updates from `[]` to `["A", "B"]` while the QueuePanel mounts
- **THEN** the visible index SHALL be 1 (text "B")
- **AND** the counter SHALL display `2 of 2`

#### Scenario: ↑ clamps at index 0
- **WHEN** the visible index is 0 and the user clicks `↑`
- **THEN** the visible index SHALL stay at 0
- **AND** the `↑` button SHALL appear visually disabled

#### Scenario: ↓ clamps at the last entry
- **WHEN** the visible index is `length - 1` and the user clicks `↓`
- **THEN** the visible index SHALL stay at `length - 1`
- **AND** the `↓` button SHALL appear visually disabled

#### Scenario: Append advances visible index automatically
- **WHEN** the visible index is 0 in a queue `["A", "B"]`
- **AND** a new `queue_update` arrives with `followUp: ["A", "B", "C"]`
- **THEN** the visible index SHALL advance to 2 (text "C")
- **AND** the counter SHALL display `3 of 3`

#### Scenario: Removal via drain clamps the index
- **WHEN** the visible index is 2 in a queue `["A", "B", "C"]`
- **AND** pi drains entry "C" at `agent_end` (matched by user `message_start`)
- **AND** the bridge emits a fresh `queue_update` with `followUp: ["A", "B"]`
- **THEN** the visible index SHALL clamp to `length - 1` (= 1, text "B")
- **AND** the counter SHALL display `2 of 2`

### Requirement: Session shutdown invokes cachedCtx.shutdown directly

When the bridge's `shutdown` extension command is invoked, the bridge SHALL invoke `cachedCtx.shutdown()` and the existing `setTimeout(() => process.exit(0), 500)` safety net. The bridge SHALL NOT call `pi.clearSteeringQueue()`, `pi.clearFollowUpQueue()`, or any other pi queue-mutation method (none exist on the ExtensionAPI through pi 0.76.0).

The bridge SHALL NOT reset `bridgeSteering` / `bridgeFollowUp` to `[]` during shutdown. Pi's real queues persist across `cachedCtx.shutdown` (until the process exits 500 ms later via the safety net); the shadows MUST mirror pi's state. The session-end teardown destroys both pi's state and the bridge's process in the same instant — no observable cleanup of shadows is needed before that point.

The bridge SHALL NOT emit a final `queue_update { steering: [], followUp: [] }` on shutdown. Such an emission would mislead the client into believing the queues had been drained when in fact they persist server-side until the bridge process exits.

#### Scenario: Shutdown invokes only cachedCtx.shutdown
- **WHEN** the bridge's `shutdown` extension command is invoked
- **THEN** the bridge SHALL invoke `cachedCtx.shutdown()` directly
- **AND** the bridge SHALL NOT call `pi.clearSteeringQueue` or `pi.clearFollowUpQueue` (or any `(pi as any).clear*Queue` defensive variant)
- **AND** the bridge SHALL NOT mutate `bridgeSteering` or `bridgeFollowUp`
- **AND** the bridge SHALL NOT emit a final `queue_update`
- **AND** the existing `setTimeout(() => process.exit(0), 500)` safety net SHALL fire as before

#### Scenario: Shutdown with non-empty shadows leaves shadows unchanged
- **WHEN** `bridgeSteering` is `["focus"]` and `bridgeFollowUp` is `["after"]`
- **AND** the bridge's `shutdown` extension command is invoked
- **THEN** the bridge SHALL invoke `cachedCtx.shutdown()` directly
- **AND** `bridgeSteering` SHALL remain `["focus"]`
- **AND** `bridgeFollowUp` SHALL remain `["after"]`
- **AND** no `queue_update` SHALL be emitted

### Requirement: User abort invokes cachedCtx.abort directly

When the bridge's `abort` extension command is invoked, the bridge SHALL invoke `cachedCtx.abort()`. The bridge SHALL NOT call `pi.clearSteeringQueue()` or `pi.clearFollowUpQueue()` (no-ops on pi 0.76.0). The bridge SHALL NOT reset shadow arrays. The bridge SHALL NOT emit a synthetic `queue_update { steering: [], followUp: [] }`.

Pi's `Agent.abort()` signals the `AbortController` for the active run — it does NOT touch the steering or follow-up queues. Queued messages persist by design; pi drains them at the next prompt (whether that prompt is a fresh user send or a re-arming continuation). The bridge's shadow arrays MUST mirror this by staying populated.

The bridge SHALL still call `retryTracker.noteAbort(sessionId)` after `cachedCtx.abort()` (cleans the in-flight attempt counter; unrelated to queue state). The bridge SHALL NOT call `usageLimitOrderer.noteRetryEnd(sessionId)` (per `unify-status-banner-and-terminal-limit-stop`).

The client SHALL NOT yank queued text into the command-input draft when the user clicks Stop. Queued messages stay visible in the read-only QueuePanel (or the inline ghost-bubble for steering) until pi drains them.

#### Scenario: Abort invokes only cachedCtx.abort
- **WHEN** the bridge's `abort` extension command is invoked
- **THEN** the bridge SHALL invoke `cachedCtx.abort()` directly
- **AND** the bridge SHALL NOT call `pi.clearSteeringQueue` or `pi.clearFollowUpQueue`
- **AND** the bridge SHALL NOT mutate `bridgeSteering` or `bridgeFollowUp`
- **AND** the bridge SHALL NOT emit a synthetic `queue_update`
- **AND** the bridge SHALL call `retryTracker.noteAbort(sessionId)`
- **AND** the bridge SHALL NOT call `usageLimitOrderer.noteRetryEnd(sessionId)`

#### Scenario: Queued messages persist across abort and drain at next prompt
- **WHEN** `bridgeFollowUp` is `["run tests when done"]` and the user clicks Stop
- **THEN** the bridge SHALL invoke `cachedCtx.abort()` only
- **AND** `bridgeFollowUp` SHALL remain `["run tests when done"]`
- **AND** the QueuePanel SHALL continue rendering the entry
- **AND** when the user sends a fresh prompt later, pi SHALL drain the queued entry alongside the new message at the next `agent_end`

#### Scenario: Client does not modify draft on Stop
- **WHEN** `pendingQueues.steering` is `["do X"]` and `pendingQueues.followUp` is `["then Y"]`
- **AND** the command-input draft is `"extra thought"`
- **AND** the user clicks Stop
- **THEN** the command-input draft SHALL remain `"extra thought"` unchanged
- **AND** no merge / concatenation of queued text into the draft SHALL occur
- **AND** the QueuePanel SHALL continue rendering "then Y"
- **AND** the inline ghost-bubble for "do X" SHALL continue rendering in ChatView

### Requirement: Queue mutation is not exposed by pi; dashboard SHALL NOT pretend it is

The dashboard SHALL NOT define, send, handle, or invoke any queue-mutation surface, because pi's `ExtensionAPI` (verified against pi 0.75.5 and 0.76.0) exposes only `sendUserMessage{deliverAs}` and `abort()`. Pi does NOT expose `clearSteeringQueue`, `clearFollowUpQueue`, `clearAllQueues`, `clearQueue`, `getSteeringMessages`, or `getFollowUpMessages` to extensions. The Agent and AgentSession internals carry these methods, but they are not routed through the extension surface.

Therefore:

1. The dashboard wire protocol SHALL NOT define message types for queue mutation. Specifically, the following message types SHALL NOT exist in `packages/shared/src/browser-protocol.ts` (browser ↔ server) nor as extension messages forwarded to the bridge: `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`, `edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry`, `clear_queue`, `remove_queue_entry`, `edit_queue_entry`.

2. The bridge SHALL NOT define handlers for any of the above message types. If a stale client sends one, the message SHALL fall through to the commandHandler default arm and be silently ignored.

3. The bridge SHALL NOT call `(pi as any).clearSteeringQueue?.()`, `(pi as any).clearFollowUpQueue?.()`, or `(pi as any).clearAllQueues?.()` anywhere in its code paths — not in `abort:`, not in `shutdown:`, not in `send_prompt` handling, not in `session_change` reset. These calls are silent no-ops and their presence misleads readers into believing pi's queues are cleared.

4. The client SHALL NOT export action senders for queue mutation. `useSessionActions.ts` SHALL NOT define `clearSteer`, `clearFollow`, `removeFollowUp`, `editFollowUp`, `promoteFollowUp`, or any equivalent. The QueuePanel SHALL NOT consume them.

5. The Stop button (mapped to `ctx.abort()`) SHALL NOT yank queued text into the command-input draft, because pi's queues persist across abort by design. Yanking would produce duplicate deliveries (drafted-edited copy + original ghost drain).

#### Scenario: Bridge ignores stale clear_steering_queue from a buggy client
- **WHEN** the bridge receives a `clear_steering_queue { sessionId }` message (e.g. from a stale browser tab predating this change)
- **THEN** the bridge SHALL NOT define a handler matching this `msg.type`
- **AND** the message SHALL fall through to the commandHandler default arm
- **AND** no `pi.clear*Queue()` method SHALL be called
- **AND** `bridgeSteering` / `bridgeFollowUp` SHALL remain unchanged
- **AND** no `queue_update` SHALL be emitted as a side effect

#### Scenario: Bridge abort path does not call clear-queue methods
- **WHEN** the bridge's `abort` extension command is invoked
- **THEN** the bridge SHALL NOT call `pi.clearSteeringQueue`
- **AND** the bridge SHALL NOT call `pi.clearFollowUpQueue`
- **AND** the bridge SHALL invoke `cachedCtx.abort()` (the only honest abort primitive)
- **AND** `bridgeSteering` and `bridgeFollowUp` shadows SHALL remain in their current state — pi's real queues persist and will drain at the next prompt, so shadows match pi's reality

#### Scenario: Bridge shutdown path does not call clear-queue methods
- **WHEN** the bridge's `shutdown` extension command is invoked
- **THEN** the bridge SHALL NOT call `pi.clearSteeringQueue` or `pi.clearFollowUpQueue`
- **AND** the bridge SHALL invoke `cachedCtx.shutdown()` directly
- **AND** session teardown SHALL proceed without any pretense of clearing pi's queues

#### Scenario: Client does not send mutation messages
- **WHEN** the user interacts with the QueuePanel via available controls (`↑` / `↓` navigation only)
- **THEN** the client SHALL NOT send any `clear_*`, `remove_*`, `edit_*`, or `promote_*` protocol message
- **AND** the wire protocol SHALL NOT define types for such messages

#### Scenario: Future upstream support is tracked separately
- **WHEN** pi-coding-agent exposes `clearFollowUpQueue` / `clearSteeringQueue` (or `clearQueue`) on the ExtensionAPI in a future release
- **THEN** a new OpenSpec change `restore-mid-turn-queue-mutation` SHALL be authored
- **AND** that future change SHALL re-introduce the protocol message types, bridge handlers, client senders, and UI affordances WITH passing integration tests against the new pi version
- **AND** this requirement SHALL be removed by that future change's spec deltas

## MODIFIED Requirements

### Requirement: Typed-during-streaming prompts are forwarded to pi's native queues

When the bridge receives a `send_prompt` message AND `getBridgeState().isAgentStreaming` is `true` for the target session AND the prompt is not a slash, bash, compact, reload, new, model, or mgmt command, the bridge SHALL route the prompt directly to pi's native queue via `pi.sendUserMessage`, governed by `msg.delivery`:

- If `delivery === "followUp"` (or absent — backward-compat default), the bridge SHALL call `pi.sendUserMessage(text, { deliverAs: "followUp" })` ONLY. Append semantics. Multiple follow-up entries are valid; pi drains them FIFO at `agent_end`.
- If `delivery === "steer"`, the bridge SHALL call `pi.sendUserMessage(text, { deliverAs: "steer" })`. Append semantics. Multiple steer entries are valid; pi drains them at `turn_end` boundaries.

The bridge SHALL NOT call any `pi.clear*Queue()` method as part of `send_prompt` handling. Those methods are not exposed on pi's ExtensionAPI (verified through pi 0.76.0) and pretending to call them produced silent no-ops while misleading readers about a depth-1 invariant that was never enforced.

The bridge SHALL maintain its `bridgeSteering` / `bridgeFollowUp` shadow arrays by pushing the text on each `sendUserMessage` call, and SHALL splice from the shadow when pi emits a matching `user` `message_start` event (drain-by-matcher). The shadow feeds `queue_update` events to the server.

#### Scenario: Follow-up send while slot is empty
- **WHEN** the agent is streaming
- **AND** `pendingQueues.followUp` is `[]`
- **AND** the bridge receives `send_prompt { text: "run tests when done", delivery: "followUp" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("run tests when done", { deliverAs: "followUp" })`
- **AND** the bridge SHALL NOT call any `pi.clear*Queue()` method
- **AND** the next `queue_update` SHALL show `followUp: ["run tests when done"]`

#### Scenario: Follow-up send while slot is occupied appends a second entry
- **WHEN** the agent is streaming
- **AND** `pendingQueues.followUp` is `["original text"]`
- **AND** the bridge receives `send_prompt { text: "second follow-up", delivery: "followUp" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("second follow-up", { deliverAs: "followUp" })`
- **AND** the bridge SHALL NOT call any `pi.clear*Queue()` method
- **AND** the next `queue_update` SHALL show `followUp: ["original text", "second follow-up"]`
- **AND** at the next `agent_end` both entries SHALL drain in FIFO order

#### Scenario: Steer send appends to pi's steering queue
- **WHEN** the agent is streaming
- **AND** `pendingQueues.steering` is `["earlier steer"]`
- **AND** the bridge receives `send_prompt { text: "new steer", delivery: "steer" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("new steer", { deliverAs: "steer" })`
- **AND** the bridge SHALL NOT call `pi.clearSteeringQueue` or `pi.clearFollowUpQueue`
- **AND** the next `queue_update` SHALL show `steering: ["earlier steer", "new steer"]`

#### Scenario: Idle send bypasses queue routing
- **WHEN** the agent is idle
- **AND** the bridge receives `send_prompt { text: "hi" }` (with or without `delivery` field)
- **THEN** the bridge SHALL call `pi.sendUserMessage("hi")` without any `deliverAs` option
- **AND** the bridge SHALL NOT call any `pi.clear*Queue()` method
