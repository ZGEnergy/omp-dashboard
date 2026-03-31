## ADDED Requirements

### Requirement: Session card flow launcher section
When a session has available flow commands, the session card SHALL display a flow launcher action section below the OpenSpec actions section.

#### Scenario: Flow launcher visible
- **WHEN** the session's commands list contains flow commands
- **THEN** the session card SHALL show a flow launcher with a combo box or button listing available flows

#### Scenario: Flow launcher hidden
- **WHEN** the session has no flow commands
- **THEN** no flow launcher section SHALL be displayed

### Requirement: Flow command detection
Flow commands SHALL be detected from the session's `commands` list by filtering commands where `source` is `"extension"` or `"prompt"` and the name does not start with reserved prefixes (`flows:`, `provider`, `roles`, `catalog`). This captures auto-registered flow slash commands.

#### Scenario: Flow commands filtered correctly
- **WHEN** the commands list contains `[{name: "research", source: "extension"}, {name: "flows:new", source: "extension"}, {name: "provider", source: "extension"}, {name: "model", source: "builtin"}]`
- **THEN** only `"research"` SHALL be identified as a launchable flow command

### Requirement: Flow launcher opens task dialog
Selecting a flow from the launcher SHALL open a dialog with the flow name, optional description, and a text input for the task/context.

#### Scenario: Open task dialog
- **WHEN** the user clicks a flow in the launcher
- **THEN** a dialog SHALL appear with the flow name and a text input for the task

#### Scenario: Submit launches flow
- **WHEN** the user enters a task and submits the dialog
- **THEN** a `send_prompt` message SHALL be sent with `/<flowName> <task>`
