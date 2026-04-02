## ADDED Requirements

### Requirement: Flow summary replaces card grid after completion
When a `flow_complete` event is received, the `FlowDashboard` SHALL transition from the live card grid to a summary view showing the flow outcome.

#### Scenario: Successful flow summary
- **WHEN** `flow_complete` arrives with `status: "success"`
- **THEN** the summary SHALL show "✓ <flowName> complete · N agents · duration" with per-agent status lines

#### Scenario: Failed flow summary
- **WHEN** `flow_complete` arrives with `status: "error"`
- **THEN** the summary SHALL show "⚠ <flowName> failed" with the error summary

#### Scenario: Aborted flow summary
- **WHEN** `flow_complete` arrives with `status: "aborted"`
- **THEN** the summary SHALL show "<flowName> aborted"

### Requirement: Summary shows per-agent results
The summary SHALL list each agent with a status icon (✓ complete, ⚠ error/blocked, ○ pending), file count, and summary text extracted from the `FlowResult.results` map.

#### Scenario: Agent with files
- **WHEN** an agent result has `files` entries
- **THEN** the summary line SHALL show the file count (e.g., "(3 files)")

### Requirement: Summary is dismissable
The user SHALL be able to dismiss the summary to return to a clean chat view without the flow dashboard.

#### Scenario: Dismiss summary
- **WHEN** the user clicks a dismiss/close button on the summary
- **THEN** the flow dashboard SHALL be removed from the layout

### Requirement: Summary allows navigating to agent detail
Agent names in the summary SHALL be clickable, navigating to the agent detail view.

#### Scenario: Click agent in summary
- **WHEN** the user clicks an agent name in the summary
- **THEN** the content area SHALL show `FlowAgentDetail` for that agent
