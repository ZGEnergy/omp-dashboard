## Purpose

Enables discovering and listing pi sessions from local session files via the bridge extension, creating dashboard records for previously unknown sessions.

## ADDED Requirements

### Requirement: List pi sessions via bridge
The bridge extension SHALL handle `list_sessions` messages by calling pi's `SessionManager.list(cwd)` static method and returning the results as a `sessions_list` message.

#### Scenario: List sessions for a directory
- **WHEN** the bridge receives a `list_sessions` message with a `cwd` field
- **THEN** it SHALL call `SessionManager.list(cwd)` and return a `sessions_list` message with session metadata for all sessions in that directory

#### Scenario: Session metadata includes required fields
- **WHEN** `SessionManager.list(cwd)` returns session info
- **THEN** each entry in the `sessions_list` SHALL include: `id`, `path` (JSONL file path), `cwd`, `name` (if set), `parentSessionPath` (if forked), `created`, `modified`, `messageCount`, and `firstMessage`

#### Scenario: No sessions found
- **WHEN** `SessionManager.list(cwd)` returns an empty array
- **THEN** the bridge SHALL return a `sessions_list` with an empty `sessions` array

#### Scenario: SessionManager.list fails
- **WHEN** `SessionManager.list(cwd)` throws an error
- **THEN** the bridge SHALL return a `sessions_list` with an empty `sessions` array (graceful degradation)

### Requirement: Server creates records for undiscovered sessions
When the server receives a `sessions_list` from the bridge, it SHALL create in-memory session records for any pi sessions not already in the session manager.

#### Scenario: New session discovered from pi listing
- **WHEN** the `sessions_list` contains a session ID not present in the session manager
- **THEN** the server SHALL register a new record with: `id` = pi session ID, `cwd` from listing, `name` from listing, `sessionFile` = path from listing, then immediately unregister it (setting `status = "ended"`)

#### Scenario: Existing session in listing
- **WHEN** the `sessions_list` contains a session ID already present in the session manager
- **THEN** the server SHALL NOT overwrite the existing record (dashboard data takes precedence)

#### Scenario: Session file path updated for existing session
- **WHEN** the `sessions_list` contains a known session ID but with a different `sessionFile`
- **THEN** the server SHALL update the `sessionFile` and `sessionDir` fields (file may have been moved)

### Requirement: Browser requests session listing
The browser SHALL be able to request a session listing for a specific cwd. The server SHALL forward the request to any connected bridge for that cwd and return the results.

#### Scenario: Browser requests session list
- **WHEN** the browser sends a `list_sessions` message with a `cwd`
- **THEN** the server SHALL forward the request to a connected bridge extension whose session cwd matches, and relay the `sessions_list` response back to the browser

#### Scenario: No bridge connected for cwd
- **WHEN** the browser requests sessions for a cwd but no bridge is connected for that directory
- **THEN** the server SHALL return sessions from the in-memory registry filtered by cwd prefix match
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
