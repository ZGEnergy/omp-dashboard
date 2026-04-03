## ADDED Requirements

### Requirement: Flow launcher in session card
When a session has available flows, the session card SHALL display a flow launcher section allowing the user to select and start a flow.

#### Scenario: Flows detected from flows_list
- **WHEN** the session's `flows` array (from `flows_list` message) contains one or more entries
- **THEN** the session card SHALL show a flow launcher section

#### Scenario: No flows available
- **WHEN** the session's `flows` array is empty or absent
- **THEN** no flow launcher section SHALL be displayed

### Requirement: Task input dialog before launch
Selecting a flow to run SHALL open a dialog with a text input for the task/context. The dialog SHALL show the flow name and description. Submitting the dialog SHALL dispatch `send_prompt` with `/<flow-name> <task>`.

#### Scenario: Launch flow with task
- **WHEN** the user selects a flow and enters a task in the dialog
- **THEN** a `send_prompt` message SHALL be sent with text `/<flowName> <task>`

#### Scenario: Launch flow without task
- **WHEN** the user selects a flow and submits with empty task
- **THEN** a `send_prompt` message SHALL be sent with text `/<flowName>` (pi-flows will prompt for task if `task_required` is set)

#### Scenario: Cancel flow launch
- **WHEN** the user cancels the task input dialog
- **THEN** no message SHALL be sent

### Requirement: Flow launcher also available in content area header
The flow launcher SHALL also be accessible from the session content area header via a "▶ Flow" button. Clicking it SHALL open the same `SearchableSelectDialog` followed by the `FlowLaunchDialog`.

#### Scenario: Launch from content header
- **WHEN** the user clicks the "▶ Flow" button in the session header
- **AND** the session's `flows` array contains one or more entries
- **THEN** a searchable flow picker dialog SHALL appear, followed by a task input dialog on selection

#### Scenario: Flow button hidden when no flows
- **WHEN** the session's `flows` array is empty or absent
- **THEN** the "▶ Flow" button SHALL NOT be displayed
