## ADDED Requirements

### Requirement: Architect sessions render as single-card flow dashboard
When `/flows:new` or `/flows:edit` is executed, pi-flows spawns the Flow Architect as a single-agent flow. The dashboard SHALL render this using the same `FlowDashboard` component with a single agent card.

#### Scenario: Architect flow started
- **WHEN** a `flow_started` event arrives with a single architect agent step
- **THEN** the flow dashboard SHALL render with one agent card showing the architect's progress

### Requirement: Architect tool calls visible in card
The architect card SHALL show tool call activity (`agent_catalog`, `agent_write`, `flow_write`, `flow_preview`, `skill_read`) as they happen, using the same recent-tools display as regular agent cards.

#### Scenario: Architect writes a flow
- **WHEN** the architect calls `flow_write` tool
- **THEN** the card SHALL show "▸ flow_write <name>" in the recent tools list

### Requirement: Architect decisions forwarded via UI proxy
Save/replan/cancel decisions in the architect are presented via `ui.select()`. The existing UI proxy SHALL forward these to the dashboard as `extension_ui_request` messages, allowing the user to respond from the web dashboard.

#### Scenario: Save or replan decision
- **WHEN** the architect presents a save/replan/cancel choice
- **THEN** the dashboard SHALL display an interactive select dialog for the user to respond

### Requirement: Agent detail available for architect
Clicking the architect card SHALL open the agent detail view showing the architect's full tool call history, assistant text, and thinking traces.

#### Scenario: View architect detail
- **WHEN** the user clicks the architect card
- **THEN** the content area SHALL show `FlowAgentDetail` with the architect's history
