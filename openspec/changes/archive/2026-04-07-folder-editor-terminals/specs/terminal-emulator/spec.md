## MODIFIED Requirements

### Requirement: Spawn terminal from folder group
The system SHALL provide a `+Terminal` button in the folder action bar. Clicking it SHALL create a new terminal session with cwd set to that folder's directory AND navigate to the TerminalsView content area for that folder.

#### Scenario: User spawns a terminal
- **WHEN** user clicks the +Terminal button in the folder action bar
- **THEN** a new terminal session is created with cwd matching the folder
- **THEN** the content area navigates to `/folder/:encodedCwd/terminals`
- **THEN** the newly created terminal is the active tab in the TerminalsView

#### Scenario: Multiple terminals per folder
- **WHEN** user clicks the +Terminal button multiple times in the same folder
- **THEN** each click creates an independent terminal session
- **THEN** all terminal sessions appear as tabs in the TerminalsView

## REMOVED Requirements

### Requirement: Terminal card display
**Reason**: Terminal cards are replaced by tabs in the TerminalsView content area. Terminals no longer appear as individual cards in the sidebar.
**Migration**: Use the Terminals(N) button in the folder action bar to view terminals. Individual terminals appear as tabs in the TerminalsView.

### Requirement: Terminal card ordering and drag-and-drop
**Reason**: Terminal cards no longer exist in the sidebar. Terminal tabs are ordered by creation time within the TerminalsView.
**Migration**: Terminals are displayed as tabs in the TerminalsView, ordered by creation time.

## MODIFIED Requirements

### Requirement: Terminal view rendering
When a terminal tab is selected in the TerminalsView, the tab content area SHALL display a full terminal emulator using xterm.js with ANSI color support, scrollback, and resize handling.

#### Scenario: Select terminal tab
- **WHEN** user clicks a terminal tab in the TerminalsView
- **THEN** the tab content area displays the xterm.js terminal view
- **THEN** the terminal is interactive (accepts keyboard input)
- **THEN** ANSI colors and escape sequences render correctly

#### Scenario: Scrollback
- **WHEN** terminal output exceeds the visible area
- **THEN** user can scroll back using mouse wheel or Shift+PageUp/PageDown
- **THEN** at least 10,000 lines of scrollback are available
