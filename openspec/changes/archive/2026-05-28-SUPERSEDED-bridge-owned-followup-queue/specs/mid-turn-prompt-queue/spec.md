## MODIFIED Requirements

### Requirement: Typed-during-streaming prompts are forwarded to pi's native queues

When the bridge receives a `send_prompt` message AND `getBridgeState().isAgentStreaming` is `true` for the target session AND the prompt is not a slash, bash, compact, reload, new, model, or mgmt command, the bridge SHALL route the prompt as follows, governed by `msg.delivery`:

- If `delivery === "followUp"` (or absent — backward-compat default), the bridge SHALL push the text into its in-memory `bridgeFollowUp: string[]` buffer AND emit `queue_update { sessionId, steering, followUp: [...bridgeFollowUp] }`. The bridge SHALL NOT call `pi.sendUserMessage(text, { deliverAs: "followUp" })`. Pi does not receive the message until the bridge's drain loop ships it later (see "Bridge follow-up drain loop").

- If `delivery === "steer"`, the bridge SHALL call `pi.sendUserMessage(text, { deliverAs: "steer" })` directly. Steer remains pi-owned; the bridge tracks shadow steering via `recordSteerSent` + drain-by-matcher (unchanged from prior architecture).

The bridge SHALL NOT call any `pi.clear*Queue()` method. Those methods are not exposed on pi's ExtensionAPI through pi 0.76.0.

When `getBridgeState().isAgentStreaming === false` (idle session), the bridge SHALL call `pi.sendUserMessage(text)` directly with no `deliverAs` option, starting a fresh turn. Idle sends bypass the buffer entirely.

#### Scenario: Follow-up send while streaming buffers in bridge
- **WHEN** the agent is streaming
- **AND** `bridgeFollowUp` is `["original"]`
- **AND** the bridge receives `send_prompt { text: "second", delivery: "followUp" }`
- **THEN** the bridge SHALL push to `bridgeFollowUp`, making it `["original", "second"]`
- **AND** the bridge SHALL emit `queue_update { followUp: ["original", "second"] }`
- **AND** the bridge SHALL NOT call `pi.sendUserMessage` at all

#### Scenario: Steer send during streaming still routes to pi directly
- **WHEN** the agent is streaming
- **AND** the bridge receives `send_prompt { text: "focus on auth", delivery: "steer" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("focus on auth", { deliverAs: "steer" })`
- **AND** the bridge SHALL push to `bridgeSteering` shadow via `recordSteerSent`
- **AND** the bridge SHALL emit `queue_update`

#### Scenario: Idle send bypasses the buffer
- **WHEN** the agent is idle
- **AND** the bridge receives `send_prompt { text: "hi" }`
- **THEN** the bridge SHALL call `pi.sendUserMessage("hi")` with no `deliverAs`
- **AND** the bridge SHALL NOT touch `bridgeFollowUp`

## ADDED Requirements

### Requirement: Bridge follow-up drain loop runs on agent_end with pop-before-send invariant

The bridge SHALL subscribe to pi's `agent_end` event and invoke `drainFollowupQueue()` from the handler. The drain function SHALL enforce the following invariants:

1. **Idle gate**: if `ctx.isIdle()` returns false, drain bails immediately. No mutation.
2. **TUI-coexistence gate**: if `pi.hasPendingMessages()` returns true (pi's own queue still has items, e.g. TUI-sent follow-ups), drain bails. The next `agent_end` retries after pi drains its own.
3. **Empty-buffer gate**: if `bridgeFollowUp.length === 0`, drain bails. No-op.
4. **Re-entrancy lock**: a boolean `isDraining` SHALL prevent overlapping drain invocations. Set true at function entry, false in `finally`. Re-entrant calls early-return.
5. **Pop FIRST**: the bridge SHALL `bridgeFollowUp.shift()` to capture the front entry BEFORE any pi call. The entry exists only on the call stack from this point.
6. **Emit BEFORE send**: the bridge SHALL emit `queue_update` reflecting the popped state BEFORE calling pi. Wire-state matches buffer-state at all observable moments.
7. **Single send, no await for pi response**: the bridge SHALL call `pi.sendUserMessage(entry)` with NO `deliverAs` (fresh-turn semantics). The bridge SHALL NOT await pi's turn completion within the drain function; the next `agent_end` will re-call `drainFollowupQueue` for the next entry.
8. **Catch + drop on pi error**: any synchronous exception from `pi.sendUserMessage` SHALL be caught, logged as a warning, and the entry SHALL be considered lost. The bridge SHALL NOT re-push the entry to `bridgeFollowUp`. Double-shipping is worse than dropping.

The drain SHALL handle at most one entry per `agent_end`. Multiple queued entries are drained across multiple agent turns in FIFO order.

#### Scenario: agent_end drains one entry, leaves the rest
- **WHEN** `bridgeFollowUp` is `["a", "b", "c"]`
- **AND** `ctx.isIdle()` returns true AND `pi.hasPendingMessages()` returns false
- **AND** `agent_end` event fires
- **THEN** the bridge SHALL `shift` "a" from `bridgeFollowUp`, leaving `["b", "c"]`
- **AND** the bridge SHALL emit `queue_update { followUp: ["b", "c"] }`
- **AND** the bridge SHALL call `pi.sendUserMessage("a")` with no `deliverAs`
- **AND** the bridge SHALL return without touching "b" or "c"

#### Scenario: Pop is observable BEFORE the pi.sendUserMessage call
- **WHEN** the drain function is mocked to record the order of `bridgeFollowUp.shift()` calls and `pi.sendUserMessage` calls
- **THEN** the shift SHALL appear in the call log BEFORE the sendUserMessage call

#### Scenario: pi.sendUserMessage throws — entry is lost, not re-queued
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** `pi.sendUserMessage` throws synchronously
- **AND** `agent_end` fires triggering drain
- **THEN** the bridge SHALL log a warning containing "drainFollowupQueue" and "entry lost"
- **AND** `bridgeFollowUp` SHALL remain `[]` (the entry is NOT re-pushed)
- **AND** the next `agent_end` SHALL find an empty buffer and no-op

#### Scenario: Idle gate prevents drain when pi is not actually idle
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** `agent_end` fires but `ctx.isIdle()` returns false (e.g. mid-tool-call subagent_end fires the event)
- **THEN** the bridge SHALL NOT call `pi.sendUserMessage`
- **AND** `bridgeFollowUp` SHALL remain `["a"]`

#### Scenario: TUI coexistence — bridge waits for pi to drain its own queue first
- **WHEN** `bridgeFollowUp` is `["dashboard-msg"]`
- **AND** `pi.hasPendingMessages()` returns true (pi has a TUI-queued follow-up)
- **AND** `agent_end` fires
- **THEN** the bridge SHALL NOT drain its own buffer
- **AND** `bridgeFollowUp` SHALL remain `["dashboard-msg"]`
- **AND** pi's natural drain SHALL run, processing the TUI item, eventually firing a new `agent_end`
- **AND** on that subsequent `agent_end`, `pi.hasPendingMessages()` returns false, and the bridge drains "dashboard-msg"

#### Scenario: Re-entrancy lock prevents double-drain
- **WHEN** the drain function is in the middle of `pi.sendUserMessage` for entry "a"
- **AND** a second `agent_end` event fires synchronously (re-entrant)
- **THEN** the second invocation SHALL early-return without popping
- **AND** the original drain SHALL complete normally
- **AND** the next non-re-entrant `agent_end` SHALL drain "b" (the original second entry)

### Requirement: Per-entry follow-up mutation mutates ONLY the bridge buffer

The bridge SHALL accept the following browser-to-server messages and mutate `bridgeFollowUp` locally + emit `queue_update`. The bridge SHALL NOT call `pi.sendUserMessage`, `pi.clear*Queue`, or any other pi method as part of handling these messages:

- `edit_followup_entry { sessionId, index, text, images? }` — replaces `bridgeFollowUp[index]`.
- `remove_followup_entry { sessionId, index }` — splices `bridgeFollowUp[index]`.
- `promote_followup_entry { sessionId, index }` — moves `bridgeFollowUp[index]` to position 0.
- `clear_followup_entries { sessionId, indices }` — splices selected entries (when `indices: number[]`) OR empties the buffer (when `indices: "all"`).

Out-of-range indices SHALL cause the handler to emit a `command_feedback` event with `status: "error"` and a human-readable message. No partial mutation occurs.

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

#### Scenario: Promote on index 0 is a safe no-op
- **WHEN** `bridgeFollowUp` is `["alpha", "beta"]`
- **AND** the bridge receives `promote_followup_entry { index: 0 }`
- **THEN** `bridgeFollowUp` SHALL remain `["alpha", "beta"]` (no reorder)
- **AND** the bridge SHALL NOT emit `queue_update`

#### Scenario: Clear all empties the buffer
- **WHEN** `bridgeFollowUp` is `["a", "b", "c"]`
- **AND** the bridge receives `clear_followup_entries { indices: "all" }`
- **THEN** `bridgeFollowUp` SHALL be `[]`
- **AND** the bridge SHALL emit `queue_update { followUp: [] }`

#### Scenario: Clear specific indices splices selected entries
- **WHEN** `bridgeFollowUp` is `["a", "b", "c", "d"]`
- **AND** the bridge receives `clear_followup_entries { indices: [0, 2] }`
- **THEN** the bridge SHALL splice indices in descending order (2 first, then 0) to avoid index drift
- **AND** `bridgeFollowUp` SHALL become `["b", "d"]`
- **AND** the bridge SHALL emit `queue_update`

#### Scenario: Out-of-range index produces command_feedback error
- **WHEN** `bridgeFollowUp` is `["a"]`
- **AND** the bridge receives `edit_followup_entry { index: 5, text: "x" }`
- **THEN** the bridge SHALL NOT mutate `bridgeFollowUp`
- **AND** the bridge SHALL emit `command_feedback { command: "edit_followup_entry", status: "error", message: "Index out of range" }`
- **AND** the bridge SHALL NOT emit `queue_update`

### Requirement: Pull-to-editor splices the entry and round-trips text to the client draft

The bridge SHALL accept `pull_followup_to_editor { sessionId, index }` browser-to-server messages. Handler:

1. Validate `index >= 0 && index < bridgeFollowUp.length`. On failure, emit `command_feedback` with `status: "error"` and return.
2. `bridgeFollowUp.splice(index, 1)` to capture and remove the entry.
3. Emit `queue_update` reflecting the splice.
4. Send `followup_pulled { sessionId, text }` extension-to-server message; server forwards as `followup_pulled { sessionId, text }` server-to-browser broadcast to the originating client.

The bridge SHALL NOT call `pi.sendUserMessage` or any other pi method.

The client receiving `followup_pulled` SHALL hydrate the command-input draft for the named session:

- If the current draft is empty (or whitespace-only after `trim()`), the client SHALL set the draft to the pulled text.
- If the current draft is non-empty, the client SHALL append the pulled text with `\n\n` separator: `draft = [currentDraft, pulledText].filter(t => t.trim()).join("\n\n")`.

#### Scenario: Pull splices entry and sends followup_pulled
- **WHEN** `bridgeFollowUp` is `["original text"]`
- **AND** the bridge receives `pull_followup_to_editor { index: 0 }`
- **THEN** `bridgeFollowUp` SHALL be `[]`
- **AND** the bridge SHALL emit `queue_update { followUp: [] }`
- **AND** the bridge SHALL send `followup_pulled { sessionId, text: "original text" }` to the client

#### Scenario: Client hydrates empty draft
- **WHEN** the client receives `followup_pulled { sessionId: "S", text: "original" }`
- **AND** the current draft for session S is empty
- **THEN** the client SHALL set the draft to "original"

#### Scenario: Client appends to non-empty draft
- **WHEN** the client receives `followup_pulled { sessionId: "S", text: "pulled" }`
- **AND** the current draft for session S is "in-progress"
- **THEN** the client SHALL set the draft to "in-progress\n\npulled"

#### Scenario: Pull on out-of-range index emits error, no draft change
- **WHEN** `bridgeFollowUp` is `[]`
- **AND** the bridge receives `pull_followup_to_editor { index: 0 }`
- **THEN** the bridge SHALL NOT emit `queue_update` or `followup_pulled`
- **AND** the bridge SHALL emit `command_feedback { command: "pull_followup_to_editor", status: "error" }`
- **AND** the client draft SHALL remain unchanged

### Requirement: TUI compatibility — bridge-owned follow-up is invisible to TUI

The dashboard's bridge SHALL hold dashboard-originated follow-up entries exclusively in its own `bridgeFollowUp` buffer, never mirroring them into pi's `Agent.followUpQueue` until drain time. Pi-TUI users SHALL NOT see dashboard-queued follow-ups in TUI surfaces (footer widget, alt+up recall) because pi has no knowledge of them. The bridge's `bridgeFollowUp` buffer lives in the dashboard's extension process and is NOT mirrored into pi's `Agent.followUpQueue`. Therefore:

1. TUI users SHALL NOT see dashboard-queued follow-ups in pi-TUI's footer widget (TUI reads pi's queue directly).
2. TUI users pressing `alt+up` (which calls `agent.clearAllQueues()`) SHALL clear pi's queue (their own TUI-queued items and any other pi-owned items) but SHALL NOT clear `bridgeFollowUp` (the bridge process has no hook into `clearAllQueues`).
3. Dashboard users SHALL NOT see TUI-queued follow-ups in the dashboard `QueuePanel` (the bridge's shadow has no hook into pi's queue mutations from TUI).
4. Both surfaces' messages SHALL still execute. At each `agent_end`, pi drains its own queue first (TUI items); the bridge drain runs after that.

The bridge buffer is in-memory and SHALL NOT persist across bridge restart (`/reload`, dashboard restart, pi crash). On restart, `bridgeFollowUp` initializes empty; any pending dashboard-queued items are lost.

#### Scenario: Mixed TUI + dashboard queue, both drain at agent_end
- **WHEN** TUI sends follow-up "look at logs" via `pi.sendUserMessage(_, {deliverAs:"followUp"})`
- **AND** dashboard sends follow-up "run tests" (buffered in `bridgeFollowUp`)
- **AND** the agent finishes its current turn, firing `agent_end`
- **THEN** pi SHALL drain its own queue first ("look at logs" runs as continuation)
- **AND** a subsequent `agent_end` fires after that turn
- **AND** the bridge drain SHALL fire `pi.sendUserMessage("run tests")` for the dashboard item
- **AND** both messages execute in order: TUI item first, dashboard item second

#### Scenario: TUI alt+up does not clear dashboard buffer
- **WHEN** TUI has queued "X" in pi's queue
- **AND** dashboard has buffered "Y" in `bridgeFollowUp`
- **AND** the TUI user presses alt+up
- **THEN** `pi.Agent.followUpQueue` SHALL be cleared (text "X" returns to TUI editor)
- **AND** `bridgeFollowUp` SHALL remain `["Y"]`
- **AND** dashboard `QueuePanel` SHALL continue showing "Y"

#### Scenario: Bridge restart loses bridgeFollowUp
- **WHEN** dashboard has buffered "important task" in `bridgeFollowUp`
- **AND** the bridge process restarts (e.g. `/reload`)
- **THEN** `bridgeFollowUp` SHALL initialize to `[]` on the new bridge instance
- **AND** "important task" SHALL be lost (user must re-type)
- **AND** the QueuePanel SHALL render nothing for that session until the user re-queues
