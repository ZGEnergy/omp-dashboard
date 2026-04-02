## Purpose

Client-side state machine that converts a stream of `DashboardEvent` objects into `SessionState` for rendering the chat view. Pure function: `(state, event) → newState`.

## ADDED Requirements

### Requirement: Session state structure
The `SessionState` SHALL contain: `messages` (array of `ChatMessage`), `toolCalls` (Map of in-flight tool states), `streamingText` and `streamingThinking` (current assistant output), `isStreaming` (boolean), `model`, `thinkingLevel`, token counters (`tokensIn`, `tokensOut`, `cacheRead`, `cacheWrite`, `cost`), `currentTool`, `status`, `turnStats` (per-turn token breakdown array, max 50), `contextUsage`, and `pendingPrompt`.

### Requirement: User message rendering
A `message_start` event with role `"user"` SHALL create a new `ChatMessage` with `role: "user"`. Text content parts SHALL be concatenated. Image content parts SHALL be extracted into the `images` array.

#### Scenario: User sends text message
- **WHEN** a `message_start` event with `role: "user"` and text content arrives
- **THEN** a new user ChatMessage SHALL be added to `messages`

#### Scenario: User sends message with images
- **WHEN** a `message_start` event with image content parts arrives
- **THEN** the ChatMessage SHALL include the images in its `images` array

#### Scenario: Pending prompt cleared
- **WHEN** a `message_start` with `role: "user"` or `agent_start` arrives
- **THEN** `pendingPrompt` SHALL be cleared to `undefined`

### Requirement: Assistant message streaming
A `message_update` event SHALL accumulate assistant text into `streamingText` and thinking content into `streamingThinking`. A `message_end` event SHALL finalize the message, moving streaming content into a permanent `ChatMessage` and clearing streaming state.

#### Scenario: Streaming text accumulates
- **WHEN** successive `message_update` events arrive with text content
- **THEN** `streamingText` SHALL contain the full accumulated text

#### Scenario: Thinking content tracked separately
- **WHEN** a `message_update` contains a `thinking` content part
- **THEN** `streamingThinking` SHALL accumulate the thinking text

#### Scenario: Message finalized
- **WHEN** a `message_end` event arrives
- **THEN** a permanent assistant ChatMessage SHALL be added to `messages` and streaming state SHALL be cleared

### Requirement: Tool call state machine
A `tool_execution_start` event SHALL create a `ToolCallState` entry with `status: "running"`. A `tool_execution_end` event SHALL update the entry to `status: "complete"` (or `"error"` if `isError` is true) and store the result text.

#### Scenario: Tool starts running
- **WHEN** a `tool_execution_start` event arrives
- **THEN** a new ToolCallState SHALL be created with `status: "running"`, `toolName`, and `args`

#### Scenario: Tool completes successfully
- **WHEN** a `tool_execution_end` event arrives with `isError: false`
- **THEN** the ToolCallState SHALL update to `status: "complete"` with the result

#### Scenario: Tool completes with error
- **WHEN** a `tool_execution_end` event arrives with `isError: true`
- **THEN** the ToolCallState SHALL update to `status: "error"` with the error result

### Requirement: Stats accumulation
A `stats_update` event SHALL add per-turn token usage to the running totals and append a `TurnStat` entry (capped at 50 entries). If `contextUsage` is present, it SHALL update the session's context usage.

#### Scenario: Turn stats recorded
- **WHEN** a `stats_update` event with `turnUsage` arrives
- **THEN** a TurnStat SHALL be appended to `turnStats` and totals SHALL be incremented

#### Scenario: Turn stats capped
- **WHEN** `turnStats` exceeds 50 entries
- **THEN** the oldest entry SHALL be removed

### Requirement: Session compact handling
A `session_compact` event SHALL clear all messages and tool call state, resetting the chat view. This occurs when pi compacts the session history to reclaim context window space.

#### Scenario: Session compacted
- **WHEN** a `session_compact` event arrives
- **THEN** `messages` SHALL be cleared, `toolCalls` SHALL be cleared, and streaming state SHALL be reset

### Requirement: Full replay state reset
When an `event_replay` message is received whose first event has `seq === 1`, the reducer SHALL reset session state to `createInitialState()` before applying the replayed events. This prevents duplicate messages when re-subscribing to a previously-loaded session (e.g. switching back to a session card or reconnecting after a WebSocket drop).

#### Scenario: Full replay resets state
- **WHEN** an `event_replay` arrives with events starting at `seq: 1`
- **THEN** the session state SHALL be reset to `createInitialState()` before reducing the replayed events

#### Scenario: Incremental replay preserves state
- **WHEN** an `event_replay` arrives with events starting at a `seq > 1`
- **THEN** the existing session state SHALL be preserved and the new events SHALL be reduced on top of it

#### Scenario: Empty replay preserves state
- **WHEN** an `event_replay` arrives with an empty events array
- **THEN** the existing session state SHALL be preserved (no reset)

### Requirement: Model select handling
A `model_select` event SHALL update `model` and `thinkingLevel` on the session state.

#### Scenario: Model changed
- **WHEN** a `model_select` event arrives with `model: { provider: "anthropic", id: "claude-4" }`
- **THEN** `model` SHALL be set to `"anthropic/claude-4"`
## ADDED Requirements

### Requirement: Flow state tracked in SessionState
The `SessionState` SHALL include a `flowState` field of type `FlowState | null`. `FlowState` SHALL contain: `flowName`, `task`, `status` (running/success/error/aborted), `autonomousMode`, `agents` (ordered map of agent name → `FlowAgentState`), and `flowResult` (set on completion).

#### Scenario: Initial state has no flow
- **WHEN** `createInitialState()` is called
- **THEN** `flowState` SHALL be `null`

### Requirement: Reducer processes flow_started event
When a `flow_started` event is received, the reducer SHALL create a new `FlowState` with the flow name, task, status `"running"`, and pre-populated agent entries (from the `steps` array) in pending status with their `blockedBy` dependencies.

#### Scenario: Flow started creates flow state
- **WHEN** a `flow_started` event with `{ flowName: "research", task: "Find bugs", steps: [{id: "r", agent: "researcher", blockedBy: []}, {id: "d", agent: "developer", blockedBy: ["r"]}] }` is processed
- **THEN** `flowState` SHALL be set with `flowName: "research"`, two agents in pending status, and `developer` SHALL have `blockedBy: ["r"]`

### Requirement: Reducer processes flow_agent_started event
When a `flow_agent_started` event is received, the reducer SHALL update the agent's status to `"running"` and store the config metadata (label, model, card role).

#### Scenario: Agent starts running
- **WHEN** a `flow_agent_started` event with `{ agentName: "researcher", config: { model: "@research", card: { label: "Research" } } }` is processed
- **THEN** the agent's status SHALL be `"running"` and label SHALL be `"Research"`

### Requirement: Reducer processes flow_agent_complete event
When a `flow_agent_complete` event is received, the reducer SHALL update the agent's status to `"complete"` or `"error"` based on the result, and store tokens, duration, summary, and files.

#### Scenario: Agent completes successfully
- **WHEN** a `flow_agent_complete` event with `{ agentName: "researcher", result: { success: true, status: "complete", tokens: { input: 3000, output: 1000 }, duration: 12000 } }` is processed
- **THEN** the agent's status SHALL be `"complete"` with the token and duration values

### Requirement: Reducer processes flow tool call events
When `flow_tool_call` and `flow_tool_result` events are received, the reducer SHALL append them to the agent's `toolHistory` array and update the `recentTools` list (last 3 tool calls).

#### Scenario: Tool call recorded
- **WHEN** a `flow_tool_call` event with `{ agentName: "researcher", toolName: "read", input: { path: "src/foo.ts" } }` is processed
- **THEN** the agent's `toolHistory` SHALL include the entry and `recentTools` SHALL show "read · src/foo.ts"

### Requirement: Reducer processes flow_assistant_text and flow_thinking_text
When `flow_assistant_text` or `flow_thinking_text` events are received, the reducer SHALL append them to the agent's `detailHistory` array for display in the agent detail view.

#### Scenario: Assistant text recorded
- **WHEN** a `flow_assistant_text` event with `{ agentName: "researcher", text: "I found..." }` is processed
- **THEN** the agent's `detailHistory` SHALL include a text entry

### Requirement: Reducer processes flow_loop_iteration event
When a `flow_loop_iteration` event is received, the reducer SHALL update the target agent's `loopIteration` and `loopMax` values.

#### Scenario: Loop iteration tracked
- **WHEN** a `flow_loop_iteration` event with `{ loopTarget: "developer", iteration: 2, maxIterations: 3 }` is processed
- **THEN** the `developer` agent SHALL have `loopIteration: 2` and `loopMax: 3`

### Requirement: Reducer processes flow_complete event
When a `flow_complete` event is received, the reducer SHALL update `flowState.status` to the result status and store the `FlowResult` data for the summary view.

#### Scenario: Flow completes
- **WHEN** a `flow_complete` event with `{ status: "success", flowName: "research", results: {...} }` is processed
- **THEN** `flowState.status` SHALL be `"success"` and `flowState.flowResult` SHALL contain the results
