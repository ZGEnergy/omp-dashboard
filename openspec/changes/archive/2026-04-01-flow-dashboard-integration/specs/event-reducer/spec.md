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
