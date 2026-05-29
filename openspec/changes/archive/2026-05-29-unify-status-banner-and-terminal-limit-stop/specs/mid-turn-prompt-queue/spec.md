## MODIFIED Requirements

### Requirement: User abort resets shadow queues and clears pi's native queues

When the bridge's `abort` extension command is invoked (via a browser `abort { sessionId }` message routed through the server to pi), the bridge SHALL — before invoking `cachedCtx.abort()` — perform the same shadow-queue reset used by the shutdown command:

1. The bridge SHALL call `pi.clearSteeringQueue()` and `pi.clearFollowUpQueue()` defensively (guarded by `typeof === "function"` and wrapped in `try/catch`). Both run unconditionally.
2. If either `bridgeSteering` or `bridgeFollowUp` is non-empty, the bridge SHALL reset both to `[]` AND emit one final `queue_update { sessionId, steering: [], followUp: [] }`. Empty shadows SHALL NOT emit `queue_update`.
3. The bridge SHALL THEN invoke the existing `cachedCtx.abort()` call.
4. After `cachedCtx.abort()`, the bridge SHALL call `retryTracker.noteAbort(sessionId)` (clears the in-flight attempt counter). The bridge SHALL NOT call `usageLimitOrderer.noteRetryEnd(sessionId)`; the orderer's `pending` flag MUST survive user-initiated abort so that pi's eventual terminal `agent_end` can still surface the real provider `errorMessage` via the orderer's `maybeSynthesize` path (see `provider-retry-state` "Bridge usage-limit orderer cleans retry-banner → error-banner transition").

The wrapper-abort SHALL run exactly ONCE on the initial `abort` command. Subsequent persistent-abort scheduler ticks (see `provider-retry-state` "Bridge persistent-abort scheduler closes retry race") SHALL invoke `cachedCtx.abort()` directly (raw), NOT the wrapper — preventing recurring queue clears that would clobber user prompts sent within the 2 s persistent-abort window.

Rationale: user clicked Stop. Mental model is "stop everything currently queued" — queued messages must not be delivered after the abort settles. Matches pi-TUI's `restoreQueuedMessagesToEditor({abort: true})` behavior (`pi-coding-agent/dist/modes/interactive/interactive-mode.js:3040`). The orderer's pending flag is intentionally NOT cleared here so that the real provider error survives the user-initiated abort path.

#### Scenario: Abort with non-empty steering resets, emits, then calls cachedCtx.abort
- **WHEN** `bridgeSteering` is `["focus on X"]` and `bridgeFollowUp` is `[]`
- **AND** the bridge's `abort` extension command is invoked
- **THEN** the bridge SHALL call `pi.clearSteeringQueue()` and `pi.clearFollowUpQueue()` defensively
- **AND** the bridge SHALL set `bridgeSteering` to `[]`
- **AND** the bridge SHALL emit `queue_update { sessionId, steering: [], followUp: [] }` exactly once
- **AND** the bridge SHALL THEN invoke `cachedCtx.abort()`
- **AND** the bridge SHALL call `retryTracker.noteAbort(sessionId)`
- **AND** the bridge SHALL NOT call `usageLimitOrderer.noteRetryEnd(sessionId)`

#### Scenario: Abort with both queues empty does NOT emit queue_update
- **WHEN** `bridgeSteering` is `[]` and `bridgeFollowUp` is `[]`
- **AND** the bridge's `abort` extension command is invoked
- **THEN** the bridge SHALL still call `pi.clearSteeringQueue()` and `pi.clearFollowUpQueue()` defensively
- **AND** the bridge SHALL NOT emit `queue_update`
- **AND** the bridge SHALL invoke `cachedCtx.abort()` as before
- **AND** `usageLimitOrderer.hasPending(sessionId)` SHALL be unchanged by the abort

#### Scenario: Pi missing clear-queue functions — abort still proceeds without throw
- **WHEN** the running pi version does not expose `pi.clearSteeringQueue` as a function
- **AND** the bridge's `abort` extension command is invoked with non-empty shadows
- **THEN** the bridge SHALL skip the missing call (guarded by `typeof === "function"`)
- **AND** the bridge SHALL still reset the shadow arrays and emit the final `queue_update`
- **AND** the bridge SHALL still invoke `cachedCtx.abort()`

#### Scenario: Wrapper-abort runs once, persistent ticks run raw
- **WHEN** the user dispatches `abort` for a session with `bridgeSteering: ["a"]`
- **THEN** the wrapper-abort body (clear queues, reset shadows, emit queue_update, cachedCtx.abort, noteAbort) SHALL execute exactly once
- **AND** subsequent persistent-abort scheduler ticks within the 2 s window SHALL each invoke `cachedCtx.abort()` directly
- **AND** the persistent ticks SHALL NOT additionally call `pi.clearSteeringQueue`, `pi.clearFollowUpQueue`, reset bridge shadows, or emit `queue_update`

#### Scenario: Orderer pending survives user abort during retry
- **GIVEN** the orderer's `pending` flag is `true` for the session (retry chain in flight)
- **WHEN** the user dispatches `abort`
- **THEN** the wrapper-abort SHALL run as described above
- **AND** `usageLimitOrderer.hasPending(sessionId)` SHALL remain `true` after the wrapper completes
- **AND** when pi subsequently emits `agent_end` with `errorMessage` matching `USAGE_LIMIT_PATTERN`, the orderer's `maybeSynthesize` SHALL fire and forward the synthesized terminal `auto_retry_end{finalError}` carrying the real provider message

### Requirement: Pending steer entries render inline in chat as user-style bubbles

The client SHALL render each entry of `Session.pendingQueues.steering[]` as a user-message-style bubble inside `ChatView`, positioned **at the bottom of the message list** (after the last assistant turn and any streaming text). Each rendered bubble SHALL:

- Use the same visual style as a real user message (`bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md`).
- Display a `STEERING` header (uppercase, tertiary text) with an animated spinner.
- Disappear when `pendingQueues.steering[]` is empty (the bridge clears the shadow on `turn_end`). At that point pi's `message_end` will have already rendered the corresponding user message in chat, so the chat surface looks coherent.

The per-entry ✕ cancel button is REMOVED. Pi's `ExtensionAPI` (verified through pi 0.75.5) does NOT expose `clearSteeringQueue` or `clearFollowUpQueue`; the bridge's previous `(pi as any).clearSteeringQueue?.()` call was a silent no-op via the `typeof === "function"` guard. Clicking ✕ cleared the bridge shadow but pi still delivered the queued message at the next drain — a misleading UI. Until pi exposes queue mutation on `ExtensionContext` (upstream feature request tracked under change `unify-status-banner-and-terminal-limit-stop` task 15.6), the steer cards remain visible (so the user knows what's queued) but offer no cancel affordance.

The `QueuePanel.SteerSection` component SHALL be removed.

#### Scenario: Pending steer appears at the bottom of chat
- **WHEN** `Session.pendingQueues.steering` is `["focus on X"]`
- **AND** the message list ends with an assistant message
- **THEN** `ChatView` SHALL render "focus on X" as a user-style bubble after the assistant message, with `STEERING` header + spinner
- **AND** the bubble SHALL NOT render a ✕ cancel button

#### Scenario: Multiple pending steers render in order without cancel buttons
- **WHEN** `Session.pendingQueues.steering` is `["a", "b", "c"]`
- **THEN** `ChatView` SHALL render three bubbles in array order, all positioned at the bottom
- **AND** no `data-testid="pending-steer-cancel"` element SHALL be present in the DOM

#### Scenario: Steer chip disappears when shadow clears
- **WHEN** `Session.pendingQueues.steering` transitions from `["a"]` to `[]` (because pi emitted turn_end and the bridge per-entry drain matcher removed the entry)
- **THEN** the inline `STEERING` bubble SHALL disappear
- **AND** the chat SHALL show "a" as a real user message once pi emits `message_end` for that user message

#### Scenario: Bridge `clear_steering_queue` handler still clears shadow (for stale clients)
- **WHEN** the bridge receives `clear_steering_queue { sessionId }` (e.g. from a stale client that still has the ✕ button)
- **THEN** the bridge SHALL set `bridgeSteering = []`
- **AND** the bridge SHALL emit `queue_update { steering: [], followUp: <unchanged> }`
- **AND** the bridge SHALL NOT log a warning about the missing pi method (silent no-op)
- **AND** pi's internal `_steeringMessages` queue SHALL still deliver at the next drain (known limitation — see upstream pi feature request)

### Requirement: Follow-up queue surface is display-only with cycling navigation

The client `QueuePanel` component SHALL render the follow-up queue as a display-only surface. One entry visible at a time, navigable with two controls only:

- **↑ Previous (`queue-followup-prev`)** — navigate to previous entry in `pendingQueues.followUp[]`. Disabled when `currentIndex === 0`. Hidden when queue has ≤1 entry.
- **↓ Next (`queue-followup-next`)** — navigate to next entry. Disabled when at last entry. Hidden when queue has ≤1 entry.
- Position indicator (`queue-followup-position`) shows `“<idx+1> of <total>”` when queue has ≥2 entries.

The visible entry SHALL be rendered as plain text inside `data-testid="queue-chip-followup"`. **NO mutation controls SHALL be present**: no ✕ cancel-all, no ✕ per-entry remove, no edit (click-to-edit), no ⇧ promote, no editor textarea. The following `data-testid` values SHALL NEVER be in the DOM:

- `queue-followup-promote`
- `queue-followup-remove`
- `queue-followup-edit`
- `queue-followup-editor`

Navigation between entries is purely client-side state (no network round-trip, no bridge messages, no pi mutation). The currentIndex SHALL clamp to `length - 1` when the queue shrinks and SHALL jump to `length - 1` when the queue grows (append-friendly UX so the user sees what they just queued).

Rationale: pi's ExtensionAPI (verified through pi 0.75.5) exposes no queue mutation methods. The bridge's previous `(pi as any).clearFollowUpQueue?.()` was a silent no-op; per-entry edit/promote/remove all routed through `rewriteFollowupQueue` which appended duplicates instead of replacing (empirical confirmation: `/tmp/pi-queue-experiment.mjs` — removing entry `"beta"` from `["alpha","beta","gamma"]` caused pi to deliver `["alpha","beta","gamma","alpha","gamma"]`). The honest interim UX matches pi-TUI's own model: `app.message.dequeue` (`alt+up`) yanks ALL queued text into the editor; per-entry editing doesn't exist there either. The dashboard's Stop button (`wrappedHandleAbort`) already implements the yank-into-draft side of that flow.

Upstream pi feature request: expose `ctx.clearQueue()` on `ExtensionContext` (one-liner over `AgentSession.clearQueue()`); once available, restore the mutation surface honestly.

#### Scenario: empty queue renders nothing
- **WHEN** `pendingQueues.followUp` is `[]`
- **THEN** the `QueuePanel` SHALL render nothing in the DOM

#### Scenario: single entry renders text + no controls
- **WHEN** `pendingQueues.followUp` is `["only one"]`
- **THEN** `queue-chip-followup` SHALL contain `"only one"`
- **AND** no `queue-followup-prev`, `queue-followup-next`, `queue-followup-promote`, `queue-followup-remove`, `queue-followup-edit`, `queue-followup-editor`, OR `queue-followup-position` element SHALL be present

#### Scenario: multi-entry renders cycling controls + position indicator
- **WHEN** `pendingQueues.followUp` is `["alpha", "beta", "gamma"]`
- **THEN** `queue-chip-followup` SHALL initially render `"gamma"` (the last entry)
- **AND** `queue-followup-position` SHALL render `"3 of 3"`
- **AND** `queue-followup-prev` and `queue-followup-next` SHALL be present
- **AND** `queue-followup-promote`, `queue-followup-remove`, `queue-followup-edit`, `queue-followup-editor` SHALL NOT be present

#### Scenario: ↑ navigates without mutating the queue
- **GIVEN** `pendingQueues.followUp` is `["alpha", "beta", "gamma"]` (currentIndex = 2)
- **WHEN** the user clicks `queue-followup-prev`
- **THEN** `queue-chip-followup` SHALL render `"beta"`
- **AND** NO browser-to-server message SHALL be dispatched (no `clear_followup_slot`, no `edit_followup_entry`, no `remove_followup_entry`, no `promote_followup_entry`)
- **AND** `pendingQueues.followUp` SHALL remain `["alpha", "beta", "gamma"]`

#### Scenario: navigation buttons disable at boundaries
- **WHEN** `pendingQueues.followUp` is `["a", "b"]` and currentIndex is at the last entry
- **THEN** `queue-followup-next` SHALL be disabled (`disabled` attribute)
- **WHEN** the user clicks `queue-followup-prev` to navigate to currentIndex 0
- **THEN** `queue-followup-prev` SHALL be disabled

#### Scenario: currentIndex clamps when the queue shrinks
- **GIVEN** `pendingQueues.followUp` was `["a", "b", "c"]` (currentIndex = 2)
- **WHEN** a `queue_update` arrives with `followUp: ["a", "b"]` (length decreased)
- **THEN** `queue-chip-followup` SHALL render `"b"` (clamped to last valid index)

#### Scenario: currentIndex jumps to last on grow (append-friendly)
- **GIVEN** `pendingQueues.followUp` was `["a"]`
- **WHEN** a `queue_update` arrives with `followUp: ["a", "b"]` (length increased)
- **THEN** `queue-chip-followup` SHALL render `"b"` (the newly-appended entry)

## ADDED Requirements

### Requirement: rewriteFollowupQueue requires active streaming

The bridge's `rewriteFollowupQueue(newEntries)` helper — used by `edit_followup_slot`, `edit_followup_entry`, `promote_followup_entry`, and `remove_followup_entry` message handlers — SHALL early-return when `getBridgeState().isAgentStreaming === false`. The helper SHALL emit a `command_feedback` event with `status: "error"` and a human-readable message (e.g. `"Follow-up queue edit ignored: session is idle"`) so the client can surface a transient toast and clear the affected chip from the visible queue.

Rationale: pi's `pi.sendUserMessage(text, {deliverAs:"followUp"})` is idle-aware — when there is no streaming agent, pi treats the call as a fresh user send and synchronously fires `agent_start`, starting a NEW turn for the first replayed entry. Without this guard, an edit/promote/remove against an idle session would refire the agent for the first replayed entry while the bridge's shadow simultaneously claims the entries are queued — a desync that surfaces as "the agent started running my queued message instead of waiting".

The guard SHALL apply equally to all four entry points (`edit_followup_slot`, `edit_followup_entry`, `promote_followup_entry`, `remove_followup_entry`). Each handler SHALL check `isAgentStreaming` BEFORE calling `rewriteFollowupQueue` (or inside, identically — implementation choice as long as the no-op behavior is observable from outside).

When the guard fires, the bridge's shadow queue (`bridgeFollowUp`) SHALL remain unchanged AND no `queue_update` SHALL be emitted. The user-visible queue stays at whatever state it was before the user clicked the control. The `command_feedback` is the only outgoing event.

#### Scenario: edit_followup_entry on idle session emits command_feedback and does not refire
- **GIVEN** `isAgentStreaming === false` (no active agent)
- **AND** `bridgeFollowUp` is `["a", "b"]`
- **WHEN** the bridge receives `edit_followup_entry { sessionId, index: 1, text: "b-edited" }`
- **THEN** `pi.sendUserMessage` SHALL NOT be invoked
- **AND** `pi.clearFollowUpQueue` SHALL NOT be invoked
- **AND** `bridgeFollowUp` SHALL remain `["a", "b"]`
- **AND** the bridge SHALL forward a `command_feedback { status: "error", message: <user-facing string> }` event
- **AND** no `queue_update` SHALL be emitted

#### Scenario: promote_followup_entry on idle session is a no-op with feedback
- **GIVEN** `isAgentStreaming === false`
- **AND** `bridgeFollowUp` is `["a", "b", "c"]`
- **WHEN** the bridge receives `promote_followup_entry { sessionId, index: 2 }`
- **THEN** `pi.sendUserMessage` SHALL NOT be invoked
- **AND** `bridgeFollowUp` SHALL remain `["a", "b", "c"]`
- **AND** the bridge SHALL forward `command_feedback { status: "error", … }`

#### Scenario: remove_followup_entry on idle session is a no-op with feedback
- **GIVEN** `isAgentStreaming === false`
- **AND** `bridgeFollowUp` is `["a", "b"]`
- **WHEN** the bridge receives `remove_followup_entry { sessionId, index: 0 }`
- **THEN** `bridgeFollowUp` SHALL remain `["a", "b"]`
- **AND** the bridge SHALL forward `command_feedback { status: "error", … }`

#### Scenario: edit_followup_entry while streaming behaves as today
- **GIVEN** `isAgentStreaming === true`
- **AND** `bridgeFollowUp` is `["a", "b"]`
- **WHEN** the bridge receives `edit_followup_entry { sessionId, index: 1, text: "b-edited" }`
- **THEN** the bridge SHALL invoke `pi.clearFollowUpQueue()`
- **AND** the bridge SHALL invoke `pi.sendUserMessage("a", { deliverAs: "followUp" })`
- **AND** the bridge SHALL invoke `pi.sendUserMessage("b-edited", { deliverAs: "followUp" })`
- **AND** `bridgeFollowUp` SHALL be `["a", "b-edited"]`
- **AND** a `queue_update` SHALL be emitted

#### Scenario: rewriteFollowupQueue is no-op when post-abort idle
- **GIVEN** the user dispatched `abort` (wrapper-abort ran, `bridgeFollowUp` is `[]`, `isAgentStreaming` is `false` after agent_end settled)
- **WHEN** any of the four follow-up-mutation messages arrives at the bridge (e.g. due to a race between the abort and the user clicking ✕ on a chip still visible in the client)
- **THEN** the bridge SHALL early-return per `isAgentStreaming === false`
- **AND** no `pi.sendUserMessage` SHALL fire (no agent refire)
- **AND** the bounds check on `bridgeFollowUp` length would also have caught this (length 0), but the streaming-guard is sufficient on its own
