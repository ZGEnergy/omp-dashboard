## REMOVED Requirements

### Requirement: `clear_steering_queue` browser-to-server message

**Reason for removal**: pi's `ExtensionAPI` does not expose `clearSteeringQueue` (verified through pi-coding-agent 0.76.0). The handler that called `(pi as any).clearSteeringQueue?.()` was a silent no-op. The message type, the server forwarder, the bridge handler, and the client sender are all deleted in §1.

**Migration**: none. Steer remains pi-owned + display-only; mutation never existed honestly.

### Requirement: `clear_followup_slot` browser-to-server message

**Reason for removal**: same as above. The bridge's clear-then-replay strategy produced ghost duplicates because `pi.clearFollowUpQueue` was not on the ExtensionAPI; the "clear" was no-op and the replay appended to pi's real queue.

**Migration**: replaced by `clear_followup_entries { indices: number[] | "all" }` (see ADDED section). Bridge-owned-buffer semantics make the operation honest.

### Requirement: `edit_followup_slot` browser-to-server message

**Reason for removal**: same as above. Edit-via-clear-then-resend produced ghosts.

**Migration**: replaced by `edit_followup_entry { index, text, images? }` (see ADDED section). Name reused with new bridge-owned semantics.

### Requirement: Send-while-occupied on follow-up replaces silently (v1, deprecated in v2)

**Reason for removal**: the v1 replace semantics depended on the depth-1 invariant enforced by clear-then-send. That invariant was never enforceable (clear was no-op). Multiple follow-up entries are valid; FIFO append is the only honest operation.

**Migration**: subsumed by "Follow-up send appends to the buffer" (MODIFIED below). Append-only semantics; the user sees multi-entry queue with cycling navigation.

### Requirement: Client renders the `PromptQueuePanel` above `CommandInput`

**Reason for removal**: the v1 panel had two sections (read-only steer chips + interactive follow-up chip with ✏ and ✕). Steer mutation never worked; follow-up mutation produced ghosts.

**Migration**: replaced by "Read-only steer + bridge-owned-mutation follow-up QueuePanel" (ADDED below). Steer renders inline as ghost user-message bubbles in ChatView (not in the panel). Follow-up renders in the panel with restored `[✎] [✕] [⇧] [→ editor]` buttons that mutate the bridge buffer only.

### Requirement: Session shutdown resets shadow queues and clears pi's native queues

**Reason for removal**: the `pi.clearSteeringQueue()` / `pi.clearFollowUpQueue()` defensive calls in the shutdown arm were silent no-ops (not on ExtensionAPI). Their presence implied "we clear pi's queues on shutdown" — provably false. §1 deleted both the defensive calls and the shadow-reset block.

**Migration**: shutdown invokes `cachedCtx.shutdown()` directly; shadows are not touched (pi's natural lifecycle handles cleanup). Session-change (`handleSessionChange`) still resets shadows — that path is a true different-session reset, not a shutdown.

### Requirement: User abort resets shadow queues and clears pi's native queues

**Reason for removal**: same as shutdown — defensive `pi.clear*Queue?.()` calls were no-ops; "abort wipes queues" was a lie. Pi's `Agent.abort()` only calls `AbortController.abort()`; queues persist by design.

**Migration**: abort invokes `cachedCtx.abort()` + `retryTracker.noteAbort()` directly. Bridge-owned follow-up buffer survives abort (user can continue editing/sending the queued items after Stop). Pi's steer queue also survives but typically drains on the next prompt.

### Requirement: Client restores aborted queue text into the command-input draft

**Reason for removal**: `wrappedHandleAbort` in `App.tsx` yanked queued text into the draft on Stop. Because pi's queues persist across `abort()`, the yank produced duplicate delivery (drafted-edited copy + original drain). §1 deleted the callback; all `onAbort=` sites pass bare `handleAbort`.

**Migration**: per-entry pull-to-editor (ADDED below) replaces bulk yank. Users who want to pull a specific entry back to the editor click `[→ editor]` on that chip; the bridge splices the entry from `bridgeFollowUp` and round-trips `followup_pulled { text }` to hydrate the draft atomically.

### Requirement: Bridge forwards pi's `queue_update` events to the server

**Reason for removal**: pi's ExtensionAPI does not emit `queue_update` events (verified). The bridge never subscribed to one; this requirement described a non-existent mechanism. The actual bridge `queue_update` ExtensionToServerMessage is BRIDGE-EMITTED on shadow / buffer mutation, not forwarded from pi.

**Migration**: covered by "Bridge emits `queue_update` on every steer-shadow or follow-up-buffer mutation" (ADDED below).

## MODIFIED Requirements

### Requirement: Typed-during-streaming prompts are forwarded to pi's native queues

When the bridge receives a `send_prompt` message AND `getBridgeState().isAgentStreaming === true` for the target session AND the prompt is not a slash, bash, compact, reload, new, model, or mgmt command, the bridge SHALL route based on `msg.delivery` — follow-up goes to the bridge-owned buffer, steer goes to pi's queue:

- If `delivery === "followUp"` (or absent — backward-compat default), the bridge SHALL push the text into its in-memory `bridgeFollowUp: string[]` buffer AND emit `queue_update { sessionId, steering, followUp: [...bridgeFollowUp] }`. The bridge SHALL NOT call `pi.sendUserMessage(text, { deliverAs: "followUp" })`. Pi does not receive the message until the drain loop ships it later (see "Bridge follow-up drain loop runs on agent_end").

- If `delivery === "steer"`, the bridge SHALL call `pi.sendUserMessage(text, { deliverAs: "steer" })` directly. Steer remains pi-owned; the bridge tracks shadow steering via `recordSteerSent` + drain-by-`message_start`-matcher (unchanged from prior architecture).

The bridge SHALL NOT call `pi.clearSteeringQueue()`, `pi.clearFollowUpQueue()`, or `pi.clearAllQueues()` from any code path. None of these methods are exposed on pi's ExtensionAPI through pi 0.76.0.

When `getBridgeState().isAgentStreaming === false` (idle session), the bridge SHALL call `pi.sendUserMessage(text)` directly with no `deliverAs` option, starting a fresh turn. Idle sends bypass the buffer entirely (no chip appears).

#### Scenario: Follow-up send while streaming buffers in bridge
- **WHEN** the agent is streaming
- **AND** `bridgeFollowUp` is `["original"]`
- **AND** the bridge receives `send_prompt { text: "second", delivery: "followUp" }`
- **THEN** the bridge SHALL push to `bridgeFollowUp`, making it `["original", "second"]`
- **AND** the bridge SHALL emit `queue_update { followUp: ["original", "second"] }`
- **AND** the bridge SHALL NOT call `pi.sendUserMessage` at all for this message

#### Scenario: Steer send during streaming routes to pi directly
- **WHEN** the agent is streaming
- **AND** the bridge receives `send_prompt { text: "focus on auth", delivery: "steer" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("focus on auth", { deliverAs: "steer" })`
- **AND** the bridge SHALL push to `bridgeSteering` via `recordSteerSent`
- **AND** the bridge SHALL emit `queue_update`

#### Scenario: Idle send bypasses the buffer
- **WHEN** the agent is idle
- **AND** the bridge receives `send_prompt { text: "hi" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("hi")` with no `deliverAs`
- **AND** the bridge SHALL NOT touch `bridgeFollowUp` or `bridgeSteering`

### Requirement: Bridge maintains shadow steering and follow-up queues

Pi's ExtensionAPI does not forward `queue_update` events to extensions (verified through pi 0.76.0). The bridge SHALL maintain two distinct per-session in-memory structures with different ownership semantics:

- **`bridgeSteering: string[]` (pi-OWNED + SHADOW)** — mirrors pi's `Agent.steeringQueue`. Mutated only by `recordSteerSent` (on bridge-originated steer sends) + drain-by-`message_start`-matcher (when pi delivers a queued steer entry, the matching text is spliced).
- **`bridgeFollowUp: string[]` (BRIDGE-OWNED BUFFER)** — authoritative store for dashboard-originated follow-up entries while the agent is streaming. Pi never sees these entries until the drain loop ships them on `agent_end`. Mutated by `bufferFollowupSend` (on push) + `drainFollowupQueue` (on pop) + mutation handlers (`edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry`, `clear_followup_entries`, `pull_followup_to_editor`).

Both structures feed the same `queue_update { sessionId, steering: [...], followUp: [...] }` ExtensionToServerMessage. The server caches the snapshot and broadcasts to subscribed browsers.

**Session-change reset:** session-change events (new / fork / resume) SHALL reset both arrays to `[]` and emit `queue_update` once. Different session — old state is meaningless.

**Bridge restart:** both structures are in-memory only; bridge process restart (`/reload`, dashboard restart, pi crash) loses them. Symmetric with pi's own queue behavior.

#### Scenario: Bridge records a steer mid-stream
- **WHEN** the agent is streaming
- **AND** the bridge sends `pi.sendUserMessage("focus on X", {deliverAs:"steer"})`
- **THEN** the bridge SHALL append `"focus on X"` to `bridgeSteering`
- **AND** the bridge SHALL emit `queue_update { steering: [...], followUp: [...] }`

#### Scenario: Per-entry steering drain via message_start matcher
- **WHEN** `bridgeSteering` is `["a", "b", "c"]`
- **AND** pi drains `"a"` by emitting user `message_start` with content `"a"` at `turn_end`
- **THEN** the bridge SHALL set `bridgeSteering` to `["b", "c"]`
- **AND** the bridge SHALL emit `queue_update`

#### Scenario: Steering matcher checked before follow-up matcher
- **WHEN** `bridgeSteering` is `["hello"]` and `bridgeFollowUp` is `["hello"]`
- **AND** pi delivers user `message_start` with content `"hello"`
- **THEN** the bridge SHALL remove the steering entry first (matches pi's emit order)
- **AND** `bridgeSteering` SHALL become `[]` while `bridgeFollowUp` SHALL still contain `["hello"]`

#### Scenario: Follow-up matcher is a no-op for buffered entries
- **WHEN** `bridgeFollowUp` is `["queued by dashboard"]` (buffered, not yet drained)
- **AND** the agent finishes its turn and the drain loop pops `"queued by dashboard"` and sends it via `pi.sendUserMessage` with no `deliverAs`
- **AND** pi emits user `message_start` with content `"queued by dashboard"` for the fresh turn
- **THEN** the matcher SHALL look up `"queued by dashboard"` in `bridgeFollowUp` and find `-1` (already popped by the drain loop)
- **AND** the splice SHALL be a no-op; no `queue_update` emitted from the matcher path

#### Scenario: Session-change resets both structures
- **WHEN** the bridge handles `session_start` with `reason ∈ {"new", "fork", "resume"}`
- **AND** either `bridgeSteering` or `bridgeFollowUp` is non-empty
- **THEN** the bridge SHALL set both to `[]`
- **AND** the bridge SHALL emit `queue_update { steering: [], followUp: [] }` once

### Requirement: Follow-up is a multi-entry queue with cycling navigation

The bridge SHALL accept arbitrary follow-up depth (soft cap: 20 entries). The client SHALL render the follow-up surface with **one entry visible at a time** and the following controls:

- **Up arrow (↑)**: navigate to previous entry. Read-only browsing; does NOT mutate the buffer. Disabled when `currentIndex === 0`.
- **Down arrow (↓)**: navigate to next entry. Disabled when `currentIndex === pendingQueues.followUp.length - 1`.
- **Promote-to-head (⇧)**: dispatch `promote_followup_entry { sessionId, index: currentIndex }`. Bridge moves entry to position 0 via splice + unshift on `bridgeFollowUp`. Resulting `queue_update` SHALL reflect new ordering. Disabled / no-op when `currentIndex === 0`.
- **Edit (✎)**: opens inline edit (textarea pre-filled with current entry text). Cmd/Ctrl+Enter dispatches `edit_followup_entry { sessionId, index: currentIndex, text }`. Bridge replaces `bridgeFollowUp[index]`. Esc cancels without dispatch.
- **Remove (✕)**: dispatches `remove_followup_entry { sessionId, index: currentIndex }`. Bridge splices `bridgeFollowUp[index]`. Confirmation modal shown only when entry text length > 50.

The panel header SHALL render a "Clear all follow-up" button when `pendingQueues.followUp.length > 1`. Clicking it dispatches `clear_followup_entries { sessionId, indices: "all" }`.

All four mutation messages target `bridgeFollowUp` exclusively. None of them call `pi.sendUserMessage`, `pi.clear*Queue`, or any other pi method.

Pull-to-editor was deliberately NOT included per user direction ("we don't need the move to editor!"). Users who want to recover a queued entry as draft text can use the remove button + retype — the cost of typing again is lower than the cost of an extra round-trip protocol for a rarely-needed action.

#### Scenario: Single-entry follow-up shows one card with disabled navigation
- **WHEN** `pendingQueues.followUp` is `["run tests"]`
- **THEN** the client SHALL render one card with text "run tests"
- **AND** ↑ and ↓ SHALL be disabled
- **AND** ⇧ SHALL be disabled (entry already at position 0)
- **AND** ✎, ✕ SHALL be enabled
- **AND** "Clear all follow-up" SHALL NOT be rendered (length is 1)

#### Scenario: Multi-entry follow-up shows cycling + mutation
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex` starts at 0
- **THEN** the client SHALL render "a" with position indicator "1 of 3"
- **AND** ↓ SHALL advance to `b` (index 1), ↑ to disable
- **AND** "Clear all follow-up" SHALL be rendered in the header

#### Scenario: Promote moves entry to head
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex === 2` (showing "c")
- **AND** the user clicks ⇧
- **THEN** the client SHALL dispatch `promote_followup_entry { index: 2 }`
- **AND** the bridge SHALL splice + unshift, producing `["c", "a", "b"]`
- **AND** the next `queue_update` SHALL show `followUp: ["c", "a", "b"]`
- **AND** the client SHALL adjust `currentIndex` to 0 to keep showing "c"

#### Scenario: Remove drops one entry
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex === 1` (showing "b")
- **AND** the user clicks ✕ (text "b" is < 50 chars, no confirmation)
- **THEN** the client SHALL dispatch `remove_followup_entry { index: 1 }`
- **AND** the bridge SHALL splice index 1; `bridgeFollowUp` becomes `["a", "c"]`
- **AND** the next `queue_update` SHALL show `followUp: ["a", "c"]`
- **AND** `currentIndex` SHALL clamp to a valid index (e.g. 1 → "c")

#### Scenario: Edit replaces the visible entry in-place
- **WHEN** `pendingQueues.followUp` is `["a", "b", "c"]` and `currentIndex === 1`
- **AND** the user clicks ✎, edits to "b-revised", Cmd+Enter submits
- **THEN** the client SHALL dispatch `edit_followup_entry { index: 1, text: "b-revised" }`
- **AND** the bridge SHALL set `bridgeFollowUp[1] = "b-revised"`
- **AND** the next `queue_update` SHALL show `followUp: ["a", "b-revised", "c"]`
- **AND** `currentIndex` SHALL stay at 1

### Requirement: Follow-up send appends to the queue (v2 replace of v1 send-while-occupied semantics)

When the user presses Alt+Enter (or equivalent send-with-followup gesture), the client SHALL dispatch `send_prompt { delivery: "followUp", text }`. The bridge SHALL append the new entry to `bridgeFollowUp[]` (never replace existing entries). The client SHALL update `currentIndex` to point at the newly-appended entry.

#### Scenario: Send while buffer non-empty appends
- **WHEN** `pendingQueues.followUp` is `["a", "b"]`
- **AND** the user types "c" + Alt+Enter
- **THEN** the bridge SHALL append "c" to `bridgeFollowUp`
- **AND** the next `queue_update` SHALL show `followUp: ["a", "b", "c"]`
- **AND** the client SHALL set `currentIndex` to 2

#### Scenario: Send while buffer empty initializes
- **WHEN** `pendingQueues.followUp` is `[]`
- **AND** the user types "first" + Alt+Enter
- **THEN** the bridge SHALL set `bridgeFollowUp` to `["first"]`
- **AND** the next `queue_update` SHALL show `followUp: ["first"]`
- **AND** `currentIndex` SHALL be 0

#### Scenario: Soft cap on buffer depth
- **WHEN** `pendingQueues.followUp.length === 20` (soft cap)
- **AND** the user attempts to send another follow-up
- **THEN** the bridge SHALL reject the new entry (drop with warn log, or emit `command_feedback { status: "error" }` — implementation choice)
- **AND** `bridgeFollowUp` SHALL remain at length 20

## ADDED Requirements

### Requirement: Bridge follow-up drain loop runs on agent_end with pop-before-send invariant

The bridge SHALL subscribe to pi's `agent_end` event and schedule `drainFollowupQueue()` via `setTimeout(_, 0)` (NOT `queueMicrotask`). The setTimeout is required to escape pi's run lifecycle: pi emits `agent_end` to extensions INSIDE the executor body of `runWithLifecycle`, but pi's `finishRun()` (which flips `isStreaming=false` and clears `activeRun`) only runs in the `finally` block AFTER the executor returns. A microtask runs before that finally; a setTimeout runs after. (Verified at pi-coding-agent `pi-agent-core/agent.js:307-330` for pi 0.76.0.)

The drain function SHALL enforce the following invariants in order:

1. **Re-entrancy lock**: a boolean `isDraining` SHALL prevent overlapping drain frames. Set true after gates pass; cleared in `finally`. Re-entrant calls early-return.
2. **Empty-buffer gate**: if `bridgeFollowUp.length === 0`, drain bails immediately. No-op.
3. **TUI-coexistence gate**: if `ctx.hasPendingMessages()` returns true (pi's own queue still has TUI-sent items), drain bails. The method lives on `ctx` (verified at pi 0.76.0 `extensions/types.d.ts:227`) and SHALL be guarded by `typeof === "function"` for older pi.
4. **Idle retry gate**: if `ctx.isIdle()` returns false (pi still in transition window post-agent_end), drain SHALL re-schedule itself via `setTimeout(..., 100)` with a bounded retry counter (max ~20 retries / 2s). After the cap, drain logs a warning and gives up. NOTE: an earlier design draft (D2 v1) gated on `isIdle()` and bailed immediately on false; smoke testing showed this blocks drain entirely because pi's `finishRun()` hasn't flipped state yet at scheduling time.
5. **Pop FIRST**: `bridgeFollowUp.shift()` captures the front entry BEFORE any pi call. The entry exists only on the call stack from this point.
6. **Emit BEFORE send**: `emitQueueUpdate()` SHALL fire reflecting the popped state BEFORE calling pi. Wire-state matches buffer-state at all observable moments.
7. **Fresh-turn send, NO deliverAs**: `pi.sendUserMessage(entry)` is called with NO options. Pi is now idle (passed the gate), so pi starts a new run via `Agent.prompt()`. NOTE: an earlier draft (D2 v2) tried `{ deliverAs: "followUp" }` to handle the transition window; smoke testing showed pi accepts the message into `Agent.followUpQueue` but its `getFollowUpMessages()` callback (called only inside `runAgentLoop`) has already exited — the queued entry never drains. Hence the strict requirement: wait for true idle, then fresh-turn send.
8. **Catch + drop on pi error**: any synchronous exception from `pi.sendUserMessage` SHALL be caught, logged as `console.warn`, and the entry SHALL be considered lost. The bridge SHALL NOT re-push.

The drain SHALL handle at most one entry per `agent_end`. Multiple queued entries drain across multiple agent turns in FIFO order (each turn fires its own `agent_end` which re-invokes the drain for the next entry).

#### Scenario: agent_end drains one entry, leaves the rest
- **WHEN** `bridgeFollowUp` is `["a", "b", "c"]`
- **AND** `ctx.isIdle()` returns true AND `ctx.hasPendingMessages()` returns false
- **AND** `agent_end` event fires
- **THEN** the bridge SHALL `shift` "a" from `bridgeFollowUp`, leaving `["b", "c"]`
- **AND** the bridge SHALL emit `queue_update { followUp: ["b", "c"] }`
- **AND** the bridge SHALL call `pi.sendUserMessage("a")` with NO deliverAs option
- **AND** the bridge SHALL return without touching "b" or "c"

#### Scenario: Pop is observable BEFORE the pi.sendUserMessage call
- **WHEN** Vitest spies record the order of `bridgeFollowUp.shift` and `pi.sendUserMessage` calls
- **THEN** the `shift` call SHALL appear in the call log BEFORE the `sendUserMessage` call

#### Scenario: pi.sendUserMessage throws — entry is lost, not re-queued
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** `pi.sendUserMessage` throws synchronously
- **AND** `agent_end` fires triggering drain
- **THEN** the bridge SHALL log a warning containing "drainFollowupQueue" and "entry lost"
- **AND** `bridgeFollowUp` SHALL remain `[]` (the entry is NOT re-pushed)
- **AND** the next `agent_end` SHALL find an empty buffer and no-op

#### Scenario: Idle retry succeeds within bounded window
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** `agent_end` fires while `ctx.isIdle()` still returns false (transition window)
- **THEN** the drain SHALL schedule itself via `setTimeout(_, 100)` and retry
- **AND** the buffer SHALL remain `["a"]` during the retry window
- **AND** within ~2s (20 retries), `ctx.isIdle()` SHALL return true and the drain SHALL proceed

#### Scenario: Idle retry exhausts bounded window
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** `ctx.isIdle()` continues to return false for >2s after `agent_end`
- **THEN** the drain SHALL log `"drainFollowupQueue: pi never idled after 2s; giving up"`
- **AND** the entry SHALL remain in `bridgeFollowUp` (visible to user; next agent_end will retry)

#### Scenario: TUI coexistence — bridge waits for pi to drain its own queue first
- **WHEN** `bridgeFollowUp` is `["dashboard-msg"]`
- **AND** `pi.hasPendingMessages()` returns true (TUI-queued follow-up still pending in pi)
- **AND** `agent_end` fires
- **THEN** the bridge SHALL NOT drain its own buffer
- **AND** `bridgeFollowUp` SHALL remain `["dashboard-msg"]`
- **AND** on a subsequent `agent_end` after pi has drained, `hasPendingMessages()` returns false and the bridge drains "dashboard-msg"

#### Scenario: Re-entrancy lock prevents double-drain
- **WHEN** the drain function is mid-execution for entry "a"
- **AND** a second `agent_end` event fires synchronously (re-entrant)
- **THEN** the second invocation SHALL early-return without popping
- **AND** the original drain SHALL complete normally
- **AND** a subsequent non-re-entrant `agent_end` SHALL drain "b"

### Requirement: Per-entry follow-up mutation mutates ONLY the bridge buffer

The bridge SHALL accept the following browser-to-server messages and mutate `bridgeFollowUp` locally + emit `queue_update`. The bridge SHALL NOT call `pi.sendUserMessage`, `pi.clear*Queue`, or any other pi method as part of handling these messages:

- `edit_followup_entry { sessionId, index, text, images? }` — replaces `bridgeFollowUp[index]`.
- `remove_followup_entry { sessionId, index }` — splices `bridgeFollowUp[index]`.
- `promote_followup_entry { sessionId, index }` — moves `bridgeFollowUp[index]` to position 0 via splice + unshift. Silent no-op when `index <= 0`.
- `clear_followup_entries { sessionId, indices }` — splices selected entries (when `indices: number[]`, sorted descending to avoid index drift) OR empties the buffer (when `indices: "all"`).

Out-of-range indices SHALL cause the handler to emit `command_feedback { command: <type>, status: "error", message: "Index out of range" }`. No partial mutation occurs.

#### Scenario: Edit mutates buffer only, never touches pi
- **WHEN** `bridgeFollowUp` is `["alpha", "beta", "gamma"]`
- **AND** the bridge receives `edit_followup_entry { index: 1, text: "BETA" }`
- **THEN** `bridgeFollowUp` SHALL become `["alpha", "BETA", "gamma"]`
- **AND** the bridge SHALL emit `queue_update { followUp: ["alpha", "BETA", "gamma"] }`
- **AND** the bridge SHALL NOT call `pi.sendUserMessage`, `pi.clearSteeringQueue`, `pi.clearFollowUpQueue`, or any other pi method

#### Scenario: Remove splices a single entry
- **WHEN** `bridgeFollowUp` is `["alpha", "beta", "gamma"]`
- **AND** the bridge receives `remove_followup_entry { index: 0 }`
- **THEN** `bridgeFollowUp` SHALL become `["beta", "gamma"]`
- **AND** the bridge SHALL emit `queue_update`

#### Scenario: Promote moves entry to head
- **WHEN** `bridgeFollowUp` is `["alpha", "beta", "gamma"]`
- **AND** the bridge receives `promote_followup_entry { index: 2 }`
- **THEN** `bridgeFollowUp` SHALL become `["gamma", "alpha", "beta"]`
- **AND** the bridge SHALL emit `queue_update`

#### Scenario: Promote on index 0 is a silent no-op
- **WHEN** `bridgeFollowUp` is `["alpha", "beta"]`
- **AND** the bridge receives `promote_followup_entry { index: 0 }`
- **THEN** `bridgeFollowUp` SHALL remain `["alpha", "beta"]`
- **AND** the bridge SHALL NOT emit `queue_update`

#### Scenario: Clear all empties the buffer
- **WHEN** `bridgeFollowUp` is `["a", "b", "c"]`
- **AND** the bridge receives `clear_followup_entries { indices: "all" }`
- **THEN** `bridgeFollowUp` SHALL become `[]`
- **AND** the bridge SHALL emit `queue_update { followUp: [] }`

#### Scenario: Clear specific indices splices selected entries
- **WHEN** `bridgeFollowUp` is `["a", "b", "c", "d"]`
- **AND** the bridge receives `clear_followup_entries { indices: [0, 2] }`
- **THEN** the bridge SHALL splice in descending order (2 first, then 0) to avoid index drift
- **AND** `bridgeFollowUp` SHALL become `["b", "d"]`
- **AND** the bridge SHALL emit `queue_update` exactly once

#### Scenario: Out-of-range index produces command_feedback error
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** the bridge receives `edit_followup_entry { index: 5, text: "x" }`
- **THEN** the bridge SHALL NOT mutate `bridgeFollowUp`
- **AND** the bridge SHALL emit `command_feedback { command: "edit_followup_entry", status: "error", message: "Index out of range" }`
- **AND** the bridge SHALL NOT emit `queue_update`

### Requirement: TUI compatibility — dashboard-buffered follow-up is invisible to TUI; symmetric

The dashboard's bridge SHALL hold dashboard-originated follow-up entries exclusively in `bridgeFollowUp`, never mirroring them into pi's `Agent.followUpQueue` until the drain loop ships them. Therefore:

1. TUI users SHALL NOT see dashboard-queued follow-ups in pi-TUI's footer widget (pi has no knowledge of the bridge buffer).
2. TUI users pressing `alt+up` (which calls `agent.clearAllQueues()`) SHALL clear pi's queues only; `bridgeFollowUp` SHALL remain untouched.
3. Dashboard users SHALL NOT see TUI-queued follow-ups in the dashboard `QueuePanel` (the shadow only tracks bridge-originated sends).
4. Both surfaces' messages SHALL still execute. At each `agent_end`, pi drains its own queue first (TUI items); the bridge drain runs after via the TUI-coexistence gate (`hasPendingMessages` returning false).

The bridge buffer is in-memory and SHALL NOT persist across bridge restart. On `/reload`, dashboard restart, or pi crash, `bridgeFollowUp` initializes empty; any pending dashboard-queued items are lost.

#### Scenario: Mixed TUI + dashboard queue — both drain in order
- **WHEN** TUI sends follow-up "look at logs" via `pi.sendUserMessage(_, {deliverAs:"followUp"})` (enters pi's queue)
- **AND** dashboard sends follow-up "run tests" (enters `bridgeFollowUp`)
- **AND** the agent finishes its current turn, firing `agent_end`
- **THEN** pi SHALL drain its own queue first — "look at logs" runs as a continuation turn
- **AND** a subsequent `agent_end` fires after that turn
- **AND** `pi.hasPendingMessages()` now returns false; the bridge drain fires `pi.sendUserMessage("run tests")` for the dashboard item
- **AND** both messages execute in order: TUI item first, dashboard item second

#### Scenario: TUI alt+up does not clear dashboard buffer
- **WHEN** TUI has queued "X" in pi's queue
- **AND** dashboard has buffered "Y" in `bridgeFollowUp`
- **AND** the TUI user presses alt+up
- **THEN** `pi.Agent.followUpQueue` SHALL be cleared (text "X" returns to TUI editor)
- **AND** `bridgeFollowUp` SHALL remain `["Y"]`
- **AND** the dashboard `QueuePanel` SHALL continue showing "Y"

#### Scenario: Bridge restart loses bridgeFollowUp
- **WHEN** dashboard has buffered "important task" in `bridgeFollowUp`
- **AND** the bridge process restarts (e.g. `/reload`)
- **THEN** `bridgeFollowUp` SHALL initialize to `[]` on the new bridge instance
- **AND** "important task" SHALL be lost (user must re-type)
- **AND** the QueuePanel SHALL render nothing for that session until the user re-queues

### Requirement: Steer queue is permanently pi-owned + display-only — no bridge-owned-steer

The steer queue SHALL remain pi-owned for the indefinite future. The dashboard SHALL NOT introduce a bridge-owned steer buffer, steer mutation surface, or per-steer-entry edit/remove/promote/pull affordances. Steer entries render inline in `ChatView` as ghost user-message bubbles (not in the follow-up `QueuePanel`).

**Rationale**: Steer drains every 1-15 seconds at every `turn_end`. The window in which a user could meaningfully cancel/edit a steer entry is too short to justify the UI surface. Pi-TUI also has no per-steer edit. This is a permanent design decision, not a tracked future change.

The bridge SHALL track `bridgeSteering` as a SHADOW (mirrors pi's `Agent.steeringQueue`) via:

- `recordSteerSent(text)`: bridge-originated steer pushes append to `bridgeSteering` only when `getBridgeState().isAgentStreaming === true` (capture-before-send pattern; mid-flight `pi.sendUserMessage` flips `isAgentStreaming` synchronously on idle sends, so we capture pre-send to avoid false chips).
- Drain-by-`message_start`-matcher: when pi delivers a queued steer at `turn_end`, the matching text is spliced from `bridgeSteering` (FIFO first-occurrence removal).

The dashboard SHALL NOT expose any client-side action that mutates `bridgeSteering` or pi's steer queue. The Stop button calls `cachedCtx.abort()` only — pi's steer queue persists across abort by design.

#### Scenario: No steer mutation messages exist in the wire protocol
- **WHEN** the wire protocol (`packages/shared/src/browser-protocol.ts`) is examined for steer-mutation message types
- **THEN** there SHALL be no `clear_steering_queue`, `edit_steering_entry`, `remove_steering_entry`, or `promote_steering_entry` types
- **AND** the bridge SHALL NOT handle any such messages

#### Scenario: Steer renders inline as ghost bubbles, never in QueuePanel
- **WHEN** `pendingQueues.steering` is `["focus on X"]`
- **THEN** `ChatView` SHALL render "focus on X" as a ghost user-message bubble at the bottom of the message list with a STEERING header + animated spinner
- **AND** `QueuePanel` SHALL NOT render any steer chip or steer section

#### Scenario: Stop does NOT clear pi's steer queue
- **WHEN** `pendingQueues.steering` is `["a", "b"]`
- **AND** the user clicks Stop
- **THEN** the bridge SHALL call `cachedCtx.abort()` only
- **AND** the bridge SHALL NOT call `pi.clearSteeringQueue` (it's not on the ExtensionAPI; the call is deleted from this codebase)
- **AND** pi's steer queue SHALL persist; the entries will drain at the next `turn_end` of the next turn (when the user re-prompts)

### Requirement: Pi ExtensionAPI does not expose queue-mutation methods

The bridge SHALL NOT call `pi.clearSteeringQueue()`, `pi.clearFollowUpQueue()`, or `pi.clearAllQueues()` from any code path. These methods exist on the inner `pi-agent-core` Agent class but are NOT exposed on the ExtensionAPI handed to extensions (verified through pi-coding-agent 0.76.0 at `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:1076-1099`).

If a future pi release adds these methods to the ExtensionAPI, a separate change MAY OPTIONALLY introduce them as an optimization (e.g. "explicit flush of TUI items before bridge drain"). The dashboard's correctness SHALL NOT depend on their availability; the bridge-owned model is correct without them.

#### Scenario: Codebase contains no `pi.clear*Queue` call expressions
- **WHEN** `grep -nE 'pi\.clearFollowUpQueue\(|pi\.clearSteeringQueue\(|pi\.clearAllQueues\(' packages/extension/src` runs
- **THEN** the output SHALL contain zero call expressions (only comment markers that reference the deletion are acceptable)

#### Scenario: Bridge ignores the OLD deleted browser message types
- **WHEN** the bridge receives any of: `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`, `edit_followup_entry` (with the OLD pi-mutation semantics), `remove_followup_entry` (with the OLD semantics), `promote_followup_entry` (with the OLD semantics)
- **AND** these arrive through a stale client or test injection
- **THEN** the bridge router SHALL NOT have a `case` arm for any of them
- **AND** the message SHALL be silently dropped (fall through to the default no-op arm)
- **AND** no `pi.*` method SHALL be called
- **AND** no `queue_update` SHALL be emitted
- **NOTE**: `edit_followup_entry`, `remove_followup_entry`, `promote_followup_entry` are RE-INTRODUCED with NEW bridge-buffer-only semantics in the ADDED requirements above. The negative-assertion test (`bridge-no-queue-mutation.test.ts`) MUST iterate only the names that remain permanently deleted: `clear_steering_queue`, `clear_followup_slot`, `edit_followup_slot`.
