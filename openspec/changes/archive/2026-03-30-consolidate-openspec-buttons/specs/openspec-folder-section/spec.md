## MODIFIED Requirements

### Requirement: Collapsible change list in folder section
The folder OpenSpec section SHALL be collapsed by default, showing a header line with chevron, label, change count, and action buttons. The header SHALL include Refresh and Bulk Archive buttons. Clicking the header toggles expansion to show the full change list.

#### Scenario: Collapsed by default
- **WHEN** the folder OpenSpec section is first rendered
- **THEN** it SHALL show only the header line: `▶ OpenSpec (N changes)` with Refresh and Bulk Archive buttons

#### Scenario: Expand on click
- **WHEN** the user clicks the folder OpenSpec header
- **THEN** the section SHALL expand to show all changes with PDST button and task counts, chevron changes to `▼`

#### Scenario: Collapse on click
- **WHEN** the user clicks the expanded folder OpenSpec header
- **THEN** the section SHALL collapse back to the header line only

### Requirement: Change list displays all changes with status
The expanded folder OpenSpec section SHALL list all changes, sorted with in-progress first then completed.

#### Scenario: Changes sorted by status
- **WHEN** the folder has changes `["done-change" (complete), "wip-change" (in-progress)]`
- **THEN** `"wip-change"` SHALL appear before `"done-change"`

#### Scenario: Change card shows name, PDST button, session links, task count
- **WHEN** a change `"add-auth"` has artifacts `[proposal: done, design: ready]`, 2 attached sessions, and `3/8 tasks`
- **THEN** the change card SHALL show: `add-auth  [PD]  [s1] [s2]  3/8 tasks` where `[PD]` is a single button

## REMOVED Requirements

### Requirement: + New button in folder header
The `+ New` button is removed from the folder OpenSpec section header. Session-level "+ Change" in `SessionOpenSpecActions` replaces it.

**Reason**: Creating a change is a session-level action — the prompt must target a specific session.
**Migration**: Use the "+ Change" button on the session card instead.

### Requirement: + New button disabled when no active sessions
No longer applicable since the button is removed from the folder section.

**Reason**: Removed with the `+ New` button.
**Migration**: The session-level "+ Change" button only appears on active sessions, so no disabled state is needed.
