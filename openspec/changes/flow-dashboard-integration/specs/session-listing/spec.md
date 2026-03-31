## ADDED Requirements

### Requirement: Session cards display flow activity badge
The `SessionCard` component SHALL render a `FlowActivityBadge` below the `OpenSpecActivityBadge` when the session has an active or recently completed flow.

#### Scenario: Flow badge rendered for active flow
- **WHEN** a session has `activeFlowName` set
- **THEN** the session card SHALL display a flow activity badge with the flow name and progress

#### Scenario: No badge without flow
- **WHEN** a session has no `activeFlowName`
- **THEN** no flow activity badge SHALL be rendered

### Requirement: Session cards display flow launcher section
The `SessionCard` component SHALL render a flow launcher section when the session has available flow commands detected from the commands list.

#### Scenario: Flow launcher rendered
- **WHEN** the session's commands list contains flow commands
- **THEN** the session card SHALL display a flow launcher section below the OpenSpec actions

#### Scenario: No launcher without flows
- **WHEN** the session has no flow commands in its commands list
- **THEN** no flow launcher section SHALL be rendered

### Requirement: DashboardSession includes flow fields
The `DashboardSession` type SHALL include optional fields: `activeFlowName?: string`, `flowAgentsDone?: number`, `flowAgentsTotal?: number`, `flowStatus?: "running" | "success" | "error" | "aborted"`.

#### Scenario: Flow fields in session updates
- **WHEN** the server processes flow events for a session
- **THEN** the `session_updated` message SHALL include the flow fields
