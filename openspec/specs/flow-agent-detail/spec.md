## ADDED Requirements

### Requirement: Agent detail replaces chat view
Clicking an agent card SHALL replace the chat view content area with a `FlowAgentDetail` component showing the full history for that agent. The flow card grid SHALL remain visible (sticky top). A back button SHALL return to the chat view.

#### Scenario: Navigate to agent detail
- **WHEN** the user clicks an agent card in the flow dashboard
- **THEN** the content area SHALL render `FlowAgentDetail` for that agent instead of `ChatView`

#### Scenario: Back button returns to chat
- **WHEN** the user clicks the back button in the agent detail view
- **THEN** the content area SHALL return to rendering `ChatView`

### Requirement: Agent detail shows tool call history
The agent detail view SHALL display all tool calls for the agent in chronological order. Each tool call entry SHALL show: tool name, input preview (path for read/write/edit, command for bash, pattern for grep), output (collapsible), error status, and duration if available.

#### Scenario: Tool call with file path
- **WHEN** a tool call for `read` with `{ path: "src/foo.ts" }` is displayed
- **THEN** the entry SHALL show "read · src/foo.ts"

#### Scenario: Tool call with error
- **WHEN** a tool call has `isError: true`
- **THEN** the entry SHALL be visually marked as an error (red accent)

### Requirement: Agent detail shows assistant text and thinking
The agent detail view SHALL display assistant text blocks and thinking traces interleaved with tool calls in chronological order.

#### Scenario: Assistant text displayed
- **WHEN** `flow_assistant_text` events exist for the agent
- **THEN** assistant text blocks SHALL be rendered as markdown content

#### Scenario: Thinking traces displayed
- **WHEN** `flow_thinking_text` events exist for the agent
- **THEN** thinking blocks SHALL be rendered in a collapsible section with a "Thinking" label

### Requirement: Agent detail header shows agent metadata
The agent detail header SHALL show the agent name, status, model role, token usage, and duration.

#### Scenario: Running agent header
- **WHEN** viewing detail for a running agent
- **THEN** the header SHALL show the agent name, a running indicator, and model role

#### Scenario: Complete agent header
- **WHEN** viewing detail for a completed agent
- **THEN** the header SHALL show agent name, ✓ status, tokens (↑in ↓out), and duration
