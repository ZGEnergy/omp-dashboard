## ADDED Requirements

### Requirement: Tabbed terminal container
The TerminalsView SHALL display a horizontal tab bar at the top showing all terminal sessions for the current folder. Each tab SHALL show the terminal name (PTY title or shell name). The active tab SHALL have a visual indicator. Below the tab bar, the selected terminal's xterm.js view SHALL be displayed.

#### Scenario: Multiple terminals displayed as tabs
- **WHEN** a folder has 3 terminal sessions
- **THEN** the tab bar SHALL show 3 tabs with terminal names
- **THEN** the active tab SHALL be visually highlighted
- **THEN** the content area below SHALL show the active terminal's xterm.js output

#### Scenario: Single terminal
- **WHEN** a folder has 1 terminal session
- **THEN** the tab bar SHALL show 1 tab
- **THEN** that tab SHALL be active by default

#### Scenario: No terminals
- **WHEN** a folder has no terminal sessions
- **THEN** the TerminalsView SHALL display an empty state message (e.g., "No terminals. Click + New to create one.")

### Requirement: Tab switching with keep-alive
Clicking a tab SHALL switch the displayed terminal. All terminals for the folder SHALL remain mounted (keep-alive pattern) with CSS visibility toggling, preserving scrollback and PTY state.

#### Scenario: Switch between tabs
- **WHEN** user clicks a different terminal tab
- **THEN** the previously active terminal SHALL be hidden (not unmounted)
- **THEN** the clicked terminal SHALL become visible
- **THEN** the terminal's scrollback and cursor position SHALL be preserved

### Requirement: Tab close action
Each tab SHALL have a close button (×) that kills the terminal (SIGTERM). When the active tab is closed, the next adjacent tab SHALL become active. When the last tab is closed, the empty state SHALL be shown.

#### Scenario: Close active tab with siblings
- **WHEN** user closes the active terminal tab and other tabs exist
- **THEN** the terminal SHALL receive SIGTERM
- **THEN** the tab SHALL be removed
- **THEN** the adjacent tab SHALL become active

#### Scenario: Close last tab
- **WHEN** user closes the only remaining terminal tab
- **THEN** the terminal SHALL receive SIGTERM
- **THEN** the empty state message SHALL be displayed

### Requirement: Tab rename action
Each tab SHALL support renaming via double-click or a rename action. The rename SHALL use an inline text input (existing InlineRenameInput pattern).

#### Scenario: Rename terminal tab
- **WHEN** user double-clicks a terminal tab name
- **THEN** an inline text input SHALL appear
- **WHEN** user confirms the new name
- **THEN** the tab SHALL display the new name
- **THEN** the terminal's `manuallyRenamed` flag SHALL be set

### Requirement: New terminal button in tab bar
The TerminalsView SHALL have a `[+ New]` button in the tab bar area that creates a new terminal in the folder's cwd and activates its tab.

#### Scenario: Create terminal from tab bar
- **WHEN** user clicks [+ New] in the TerminalsView
- **THEN** a new terminal SHALL be created with cwd matching the folder
- **THEN** the new terminal's tab SHALL become active

### Requirement: Tab close button visibility
Each terminal tab SHALL display a close (X) button that becomes visible on hover. The tab container element MUST have the `group` CSS class so that child elements using `group-hover:` utility classes respond to hover state.

#### Scenario: Hovering over a terminal tab shows close button
- **WHEN** the user hovers over a terminal tab in the tab bar
- **THEN** the close (X) button becomes visible (opacity transitions from 0 to 1)

#### Scenario: Close button hidden when not hovering
- **WHEN** the user is not hovering over a terminal tab
- **THEN** the close (X) button is hidden (opacity 0)

### Requirement: Terminal creation navigates to tab view
When a new terminal is created (via `terminal_created` event), the client SHALL navigate to the tabbed terminals view at `/folder/:encodedCwd/terminals` with the new terminal's ID as the active tab. The client SHALL NOT navigate to the legacy `/terminal/:id` fullscreen route.

#### Scenario: New terminal opens in tab view
- **WHEN** a `terminal_created` event is received from the server
- **THEN** the client navigates to `/folder/<encodedCwd>/terminals`
- **AND** the newly created terminal is the active tab

#### Scenario: Terminal button opens tab view
- **WHEN** the user clicks the terminal button in the session sidebar
- **THEN** the tabbed terminals view opens (no change — already correct)

### Requirement: Folder path header
The TerminalsView SHALL display the folder's absolute path in a header above the tab bar.

#### Scenario: Header shows folder path
- **WHEN** the TerminalsView is displayed for `/Users/robson/Project/foo`
- **THEN** a header SHALL show the path `/Users/robson/Project/foo`
