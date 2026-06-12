## ADDED Requirements

### Requirement: System-originated follow-up enqueue bypasses the streaming gate

The main dashboard bridge SHALL expose `enqueueSystemFollowup(text: string)` that pushes `text` onto the existing `bridgeFollowUp` buffer WITHOUT the `isAgentStreaming === true` gate that `bufferFollowupSend` applies, then schedules `drainFollowupQueue(0)` via `setTimeout(..., 0)`. The function SHALL respect the existing `FOLLOWUP_QUEUE_CAP` soft cap and the `isDraining` re-entrancy lock. It SHALL route the entry through the single existing `drainFollowupQueue` path so the entry is shipped to pi as a fresh-turn `sendUserMessage` (no `deliverAs`) when pi is idle.

#### Scenario: System follow-up enqueued after agent_end (gate already closed)

- **WHEN** `enqueueSystemFollowup("continue")` is called after `agent_end` has fired and `isAgentStreaming` is already `false`
- **THEN** the entry is pushed onto `bridgeFollowUp` (the closed `isAgentStreaming` gate does NOT discard it)
- **AND** `drainFollowupQueue(0)` is scheduled
- **AND** once `ctx.isIdle()` is true the entry is shipped as a fresh-turn `pi.sendUserMessage` exactly once

#### Scenario: System follow-up shares the single drain with user follow-ups

- **WHEN** a user follow-up is buffered during a goal-driven turn AND a system follow-up is enqueued at the same `agent_end`
- **THEN** both entries occupy the one `bridgeFollowUp` buffer
- **AND** `drainFollowupQueue` ships exactly one entry per `agent_end` under the `isDraining` lock
- **AND** no two `sendUserMessage` calls race the same `isIdle()` window

#### Scenario: Cap and lock are honoured

- **WHEN** `bridgeFollowUp` is already at `FOLLOWUP_QUEUE_CAP`
- **THEN** `enqueueSystemFollowup` drops the new entry with a warning (same policy as `bufferFollowupSend`)
- **AND** a re-entrant call while `isDraining` is true does not double-ship

### Requirement: Generic `dashboard:enqueue-followup` event listener

The main dashboard bridge SHALL register `pi.events.on("dashboard:enqueue-followup", handler)` where `handler` invokes `enqueueSystemFollowup(payload.text)`. The listener SHALL be generic (not goal-specific) so any plugin bridge entry can request a system-originated follow-up. When no plugin emits the event, the listener is inert and the follow-up queue behaves exactly as before.

#### Scenario: Plugin requests a continuation

- **WHEN** a plugin bridge entry calls `pi.events.emit("dashboard:enqueue-followup", { text: "<continuation prompt>" })`
- **THEN** the main bridge's listener calls `enqueueSystemFollowup("<continuation prompt>")`
- **AND** the continuation rides the existing drain path

#### Scenario: No plugin present → queue unchanged

- **WHEN** no plugin emits `dashboard:enqueue-followup`
- **THEN** `bridgeFollowUp` carries only user-originated follow-ups
- **AND** existing follow-up behaviour is unchanged
