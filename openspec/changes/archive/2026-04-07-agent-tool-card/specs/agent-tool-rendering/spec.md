## ADDED Requirements

### Requirement: Structured partialResult handling in event reducer
The event reducer SHALL detect when `tool_execution_update.partialResult` is an object (not a string). When it is an object, it SHALL extract `details` into a `toolDetails` field on the `ChatMessage`, and use `content[0].text` (or JSON.stringify of `content`) as the `result` string.

#### Scenario: Agent tool streams structured partialResult
- **WHEN** a `tool_execution_update` event arrives with `partialResult` as an object `{ content, details }`
- **THEN** the corresponding `ChatMessage` SHALL have `toolDetails` set to the `details` object and `result` set to the text content

#### Scenario: Non-agent tool streams string partialResult
- **WHEN** a `tool_execution_update` event arrives with `partialResult` as a string
- **THEN** the behavior SHALL be unchanged — `result` is set to the truncated string, `toolDetails` remains undefined

### Requirement: Agent tool renderer displays live progress card
The `Agent` tool renderer SHALL display a card showing the agent's current state based on `toolDetails` (cast as `AgentDetails`).

#### Scenario: Foreground agent running
- **WHEN** the Agent tool has status `running` and `toolDetails.status` is `"running"`
- **THEN** the card SHALL show: display name, description, elapsed time (live ticking), current activity, tool use count, turn count with max turns, model name (if different from parent), and config tags

#### Scenario: Foreground agent completed
- **WHEN** the Agent tool has status `complete` and `toolDetails.status` is `"completed"` or `"steered"`
- **THEN** the card SHALL show: display name, description, duration, token stats, tool use count, turn count, prompt text, and result rendered as markdown (always visible, not collapsible)

#### Scenario: Background agent launched
- **WHEN** the Agent tool has status `complete` and `toolDetails.status` is `"background"`
- **THEN** the card SHALL show: display name, description, agent ID, and a "running in background" indicator

#### Scenario: Agent error
- **WHEN** the Agent tool has status `error` or `toolDetails.status` is `"error"` or `"aborted"`
- **THEN** the card SHALL show: display name, description, error message, and duration

#### Scenario: No toolDetails available (fallback)
- **WHEN** the Agent tool has no `toolDetails` (e.g. replayed from older session data)
- **THEN** the renderer SHALL fall back to displaying args (prompt, description) and result as markdown (not raw JSON)

### Requirement: get_subagent_result tool renderer
The `get_subagent_result` tool renderer SHALL display the agent ID, and the result text when complete.

#### Scenario: Result retrieved
- **WHEN** `get_subagent_result` completes with a result
- **THEN** the card SHALL show the agent ID from args, and the result text

#### Scenario: Agent still running
- **WHEN** `get_subagent_result` completes with a "still running" message
- **THEN** the card SHALL show the agent ID and a "still running" indicator

### Requirement: steer_subagent tool renderer
The `steer_subagent` tool renderer SHALL display the agent ID and the steering message.

#### Scenario: Steer message sent
- **WHEN** `steer_subagent` completes successfully
- **THEN** the card SHALL show the agent ID from args and the steering message text

### Requirement: Shared AgentCardShell component
The system SHALL provide a reusable `AgentCardShell` component extracted from `FlowAgentCard` that encapsulates the common agent card visual pattern: status icon, name, status-based border coloring, and stat formatting helpers.

#### Scenario: FlowAgentCard uses AgentCardShell
- **WHEN** `FlowAgentCard` renders
- **THEN** it SHALL delegate to `AgentCardShell` for the card container, status icon, and header row, passing flow-specific content (recent tools, blocked-by) as children

#### Scenario: AgentToolRenderer uses AgentCardShell
- **WHEN** the `Agent` tool renderer renders
- **THEN** it SHALL use `AgentCardShell` for the card container, status icon, and header row, passing agent-specific content (activity, prompt, result) as children

#### Scenario: Shared formatting helpers
- **WHEN** any component needs to format agent tokens or duration
- **THEN** it SHALL use shared `formatTokens` and `formatDuration` helpers from a common module instead of duplicating them

### Requirement: Agent tool collapsed summary
The `ToolCallStep` collapsed summary for Agent-related tools SHALL be descriptive.

#### Scenario: Agent tool summary
- **WHEN** an `Agent` tool call is displayed in collapsed mode
- **THEN** the summary SHALL show the agent type and description (e.g. "▸ Explore: Fix auth bug")

#### Scenario: get_subagent_result summary
- **WHEN** a `get_subagent_result` tool call is displayed in collapsed mode
- **THEN** the summary SHALL show "Get result: {agent_id}"

#### Scenario: steer_subagent summary
- **WHEN** a `steer_subagent` tool call is displayed in collapsed mode
- **THEN** the summary SHALL show "Steer: {agent_id}"

### Requirement: Agent tool auto-expand while running
The `ToolCallStep` SHALL default to expanded state for `Agent` tool calls that have status `running`.

#### Scenario: Running Agent auto-expands
- **WHEN** an `Agent` tool call is added with status `running`
- **THEN** the `ToolCallStep` SHALL render in expanded state

#### Scenario: Completed Agent stays collapsed
- **WHEN** an `Agent` tool call arrives already complete (e.g. during replay)
- **THEN** the `ToolCallStep` SHALL render in collapsed state (default behavior)
