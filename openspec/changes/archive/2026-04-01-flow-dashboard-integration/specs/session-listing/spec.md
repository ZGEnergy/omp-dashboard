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
The `SessionCard` component SHALL render a flow launcher section when the session has available flow commands detected from the commands list. The section SHALL be labeled "Flows:" to distinguish it from other sections.

#### Scenario: Flow launcher rendered
- **WHEN** the session's commands list contains flow commands
- **THEN** the session card SHALL display a "Flows:" labeled section with a "▶ Run Flow..." button below the OpenSpec actions

#### Scenario: No launcher without flows
- **WHEN** the session has no flow commands in its commands list
- **THEN** no flow launcher section SHALL be rendered

### Requirement: OpenSpec attach section labeled
The `SessionOpenSpecActions` component SHALL display an "OpenSpec:" label before the attach button to distinguish it from other card sections.

#### Scenario: OpenSpec label visible
- **WHEN** OpenSpec changes are available
- **THEN** the session card SHALL show "OpenSpec:" followed by the "Attach change..." button

### Requirement: OpenSpec attach uses searchable dialog
The OpenSpec attach button SHALL open a `SearchableSelectDialog` instead of a native `<select>` dropdown. Each change option SHALL display the change name, lifecycle state description (Planning / Ready to implement / Implementing — N/M tasks / Complete — N/M tasks), artifact list, and a status badge.

#### Scenario: Open attach picker
- **WHEN** the user clicks "Attach change..."
- **THEN** a searchable dialog SHALL appear listing all available changes with descriptions

#### Scenario: Filter changes by typing
- **WHEN** the user types in the search field
- **THEN** the list SHALL filter to changes whose name or description contains the query

#### Scenario: Change description shows lifecycle detail
- **WHEN** a change is in "IMPLEMENTING" state with 3/12 tasks and artifacts [proposal, design, specs, tasks]
- **THEN** the description SHALL show "Implementing — 3/12 tasks · proposal, design, specs, tasks"

### Requirement: DashboardSession includes flow fields
The `DashboardSession` type SHALL include optional fields: `activeFlowName?: string`, `flowAgentsDone?: number`, `flowAgentsTotal?: number`, `flowStatus?: "running" | "success" | "error" | "aborted"`.

#### Scenario: Flow fields in session updates
- **WHEN** the server processes flow events for a session
- **THEN** the `session_updated` message SHALL include the flow fields
