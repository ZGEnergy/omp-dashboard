## MODIFIED Requirements

### Requirement: Remove OpenSpec activity detection from bridge
The bridge extension SHALL NOT call `detectOpenSpecActivity()` or track OpenSpec state (`currentOpenSpecPhase`, `currentOpenSpecChange`). It SHALL NOT send `openspec_activity_update` protocol messages. The `tool_execution_start` and `agent_end` events SHALL be forwarded as raw `event_forward` messages without OpenSpec processing.

#### Scenario: tool_execution_start forwarded without OpenSpec detection
- **WHEN** a `tool_execution_start` event fires
- **THEN** the bridge SHALL forward it as an `event_forward` and SHALL NOT run `detectOpenSpecActivity()`

#### Scenario: agent_end forwarded without OpenSpec clear
- **WHEN** an `agent_end` event fires
- **THEN** the bridge SHALL forward it as an `event_forward` and SHALL NOT send `openspec_activity_update`

### Requirement: Remove stats_update message send from bridge
The bridge extension SHALL NOT call `extractTurnStats()` or send `stats_update` protocol messages. The `turn_end` event SHALL be forwarded as a raw `event_forward` message.

The bridge SHALL enrich `turn_end` events with `contextUsage` from `ctx.getContextUsage()` before forwarding, since this data is only available via the pi process API.

#### Scenario: turn_end forwarded with contextUsage enrichment
- **WHEN** a `turn_end` event fires
- **THEN** the bridge SHALL attach `contextUsage` (from `ctx.getContextUsage()`) to the event data and forward it as `event_forward`

#### Scenario: No stats_update message sent
- **WHEN** a `turn_end` event fires
- **THEN** the bridge SHALL NOT send a `stats_update` protocol message

### Requirement: Remove redundant model_update send after model_select
The bridge's `model_select` handler SHALL NOT call `sendModelUpdateIfChanged()`. The event is already enriched with `thinkingLevel` and forwarded — the server extracts model/thinkingLevel via `extractSessionUpdates()`.

The `model_update` protocol message type is retained for state sync on reconnect (sent from `sendStateSync`), not removed.

#### Scenario: model_select does not trigger model_update
- **WHEN** a `model_select` event fires
- **THEN** the bridge SHALL enrich it with `thinkingLevel`, forward as `event_forward`, and SHALL NOT call `sendModelUpdateIfChanged()`
