## ADDED Requirements

### Requirement: Flow launcher in session card
When a session has available flow commands, the session card SHALL display a flow launcher section allowing the user to select and start a flow.

#### Scenario: Flows detected from commands list
- **WHEN** the session's commands list contains commands registered by pi-flows (flow commands auto-registered from `.pi/flows/flows/`)
- **THEN** the session card SHALL show a flow launcher section

#### Scenario: No flows available
- **WHEN** the session's commands list contains no flow commands
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

### Requirement: Flow launcher also available in content area
The flow launcher SHALL also be accessible from the session content area header (not only the sidebar card), allowing flow launch when viewing a session.

#### Scenario: Launch from content header
- **WHEN** the user clicks a "Run Flow" button in the session header
- **THEN** the same flow picker and task input dialog SHALL appear
