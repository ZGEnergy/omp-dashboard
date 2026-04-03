## MODIFIED Requirements

### Requirement: Flow launcher in session card
When a session has available flows, the session card SHALL display a flow launcher section allowing the user to select and start a flow.

#### Scenario: Flows detected from flows_list
- **WHEN** the session's `flows` array (from `flows_list` message) contains one or more entries
- **THEN** the session card SHALL show a flow launcher section

#### Scenario: No flows available
- **WHEN** the session's `flows` array is empty or absent
- **THEN** no flow launcher section SHALL be displayed

### Requirement: Flow launcher also available in content area header
The flow launcher SHALL also be accessible from the session content area header via a "▶ Flow" button. Clicking it SHALL open the same `SearchableSelectDialog` followed by the `FlowLaunchDialog`.

#### Scenario: Launch from content header
- **WHEN** the user clicks the "▶ Flow" button in the session header
- **AND** the session's `flows` array contains one or more entries
- **THEN** a searchable flow picker dialog SHALL appear, followed by a task input dialog on selection

#### Scenario: Flow button hidden when no flows
- **WHEN** the session's `flows` array is empty or absent
- **THEN** the "▶ Flow" button SHALL NOT be displayed
