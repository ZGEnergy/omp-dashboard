## ADDED Requirements

### Requirement: Spawn terminal from folder group
The system SHALL provide a terminal spawn button in each folder group header. Clicking it SHALL create a new terminal session with cwd set to that folder's directory.

#### Scenario: User spawns a terminal
- **WHEN** user clicks the terminal button in a folder group header
- **THEN** a new terminal session is created with cwd matching the folder
- **THEN** the terminal card appears at the top of the folder group
- **THEN** the terminal view is automatically selected and displayed

#### Scenario: Multiple terminals per folder
- **WHEN** user clicks the terminal button multiple times in the same folder
- **THEN** each click creates an independent terminal session
- **THEN** all terminal cards appear in the folder group, each independently selectable

### Requirement: Terminal card display
Terminal sessions SHALL appear as cards in the sidebar, visually distinct from agent session cards. Terminal cards SHALL have a cyan left border accent and a console icon (`>_`).

#### Scenario: Visual distinction from agent cards
- **WHEN** the sidebar contains both agent and terminal sessions in the same folder group
- **THEN** terminal cards display a cyan left border accent
- **THEN** terminal cards display a console icon instead of the robot icon
- **THEN** agent cards remain unchanged in appearance

#### Scenario: Terminal card information
- **WHEN** a terminal card is displayed
- **THEN** it shows the terminal name (from PTY title or shell name)
- **THEN** it shows the working directory

### Requirement: Terminal card ordering and drag-and-drop
Terminal cards SHALL be mixed with agent session cards in the same folder group and support the same drag-and-drop reordering. New terminals SHALL be inserted at the top of their folder group.

#### Scenario: New terminal ordering
- **WHEN** a new terminal is created in a folder group
- **THEN** its card appears at the top of the group (before existing agent and terminal cards)

#### Scenario: Drag-and-drop reorder
- **WHEN** user drags a terminal card to a new position within a folder group
- **THEN** the card moves to the new position
- **THEN** the order is persisted and survives page reload

### Requirement: Terminal view rendering
When a terminal card is selected, the main area SHALL display a full terminal emulator using xterm.js with ANSI color support, scrollback, and resize handling.

#### Scenario: Select terminal card
- **WHEN** user clicks a terminal card in the sidebar
- **THEN** the main area displays the xterm.js terminal view
- **THEN** the terminal is interactive (accepts keyboard input)
- **THEN** ANSI colors and escape sequences render correctly

#### Scenario: Terminal header
- **WHEN** a terminal view is displayed
- **THEN** a minimal header shows the terminal name and a close button
- **THEN** no CommandInput, StatusBar, or TokenStatsBar is shown

#### Scenario: Scrollback
- **WHEN** terminal output exceeds the visible area
- **THEN** user can scroll back using mouse wheel or Shift+PageUp/PageDown
- **THEN** at least 10,000 lines of scrollback are available

### Requirement: Terminal resize
The terminal SHALL automatically resize to fill its container. When the browser window or sidebar resizes, the terminal SHALL send updated dimensions to the server and the PTY SHALL be resized accordingly.

#### Scenario: Window resize
- **WHEN** the browser window is resized
- **THEN** xterm.js recalculates columns and rows via FitAddon
- **THEN** the new dimensions are sent to the server
- **THEN** the server resizes the PTY
- **THEN** the shell receives SIGWINCH and redraws

#### Scenario: Sidebar resize
- **WHEN** the resizable sidebar width changes
- **THEN** the terminal container width changes
- **THEN** the terminal recalculates and resizes accordingly

### Requirement: Binary WebSocket transport
Each terminal SHALL communicate via a dedicated binary WebSocket at `/ws/terminal/:id`. Binary frames carry terminal I/O data. Text frames carry JSON control messages (resize, title).

#### Scenario: Terminal data flow
- **WHEN** user types in the terminal
- **THEN** keystrokes are sent as binary WebSocket frames to the server
- **THEN** the server writes them to the PTY
- **THEN** PTY output is sent as binary WebSocket frames to the client
- **THEN** xterm.js renders the output

#### Scenario: Resize control message
- **WHEN** the terminal needs to resize
- **THEN** a text frame with `{ "type": "resize", "cols": N, "rows": N }` is sent
- **THEN** the server resizes the PTY to match

### Requirement: Server-side PTY management
The server SHALL spawn PTY processes using node-pty with the user's default shell (detected from `$SHELL` environment variable). Each PTY SHALL have an associated 256KB ring buffer for output replay.

#### Scenario: Shell detection
- **WHEN** a terminal is created
- **THEN** the server uses the value of `$SHELL` to determine the shell binary
- **THEN** if `$SHELL` is not set, it falls back to `/bin/bash`

#### Scenario: PTY spawn
- **WHEN** a terminal creation request is received
- **THEN** the server spawns a PTY with node-pty in the requested cwd
- **THEN** the PTY inherits the server's environment variables
- **THEN** the terminal is assigned an ID with `term-` prefix

### Requirement: Output buffering and replay
The server SHALL maintain a 256KB ring buffer of raw PTY output per terminal. When a new WebSocket client connects to a terminal, the server SHALL replay the buffer contents before streaming live output.

#### Scenario: Reconnect replay
- **WHEN** a new WebSocket connects to an existing terminal
- **THEN** the server sends the entire ring buffer contents as binary frames
- **THEN** subsequent PTY output is streamed live
- **THEN** the client renders the replay followed by live output seamlessly

#### Scenario: Buffer overflow
- **WHEN** PTY output exceeds 256KB
- **THEN** oldest bytes are discarded from the ring buffer
- **THEN** newest bytes are retained

### Requirement: Terminal instance keep-alive
xterm.js terminal instances SHALL remain mounted in the DOM when navigating away from a terminal. Visibility SHALL be toggled via CSS (`display: none/flex`) rather than mount/unmount.

#### Scenario: Switch away and back
- **WHEN** user selects an agent session (navigating away from a terminal)
- **THEN** the terminal xterm.js instance remains in the DOM (hidden)
- **WHEN** user selects the terminal again
- **THEN** the terminal is shown instantly with full scrollback preserved
- **THEN** no replay flicker occurs

### Requirement: Terminal naming
Terminal names SHALL be derived from PTY title escape sequences. The shell name (e.g., "zsh") SHALL be used as default. Users SHALL be able to manually rename terminals.

#### Scenario: Default name
- **WHEN** a terminal is first created
- **THEN** the card displays the shell name (e.g., "zsh", "bash")

#### Scenario: PTY title update
- **WHEN** the shell sends a title escape sequence (ESC ]0;title BEL)
- **THEN** xterm.js fires a title event
- **THEN** the terminal card name updates to reflect the new title

#### Scenario: Manual rename
- **WHEN** user renames a terminal card
- **THEN** the name is updated and the PTY title no longer overrides it

### Requirement: Terminal lifecycle and cleanup
When the shell process exits or the user closes a terminal, the system SHALL send SIGTERM to the PTY, clean up server resources, close the WebSocket, and remove the card from the sidebar.

#### Scenario: Shell exit
- **WHEN** user types `exit` or the shell process terminates
- **THEN** the server detects the PTY exit event
- **THEN** the server closes the terminal WebSocket
- **THEN** the server broadcasts terminal removal to all browser clients
- **THEN** the terminal card is removed from the sidebar
- **THEN** if the terminal was selected, the view navigates away

#### Scenario: User closes terminal via UI
- **WHEN** user clicks the close button on a terminal card or header
- **THEN** the server sends SIGTERM to the PTY process
- **THEN** cleanup proceeds as in the shell exit scenario

### Requirement: Theme matching
The xterm.js terminal theme SHALL match the dashboard's current theme. Theme colors SHALL be derived from the dashboard's CSS variables.

#### Scenario: Theme applied
- **WHEN** a terminal view is rendered
- **THEN** the xterm.js background, foreground, cursor, and ANSI palette colors match the dashboard theme

#### Scenario: Theme change
- **WHEN** the user switches the dashboard theme
- **THEN** all terminal instances update their theme to match

### Requirement: Terminal routing
Terminal views SHALL be accessible via URL routing at `/terminal/:id`, separate from agent session routing at `/session/:id`.

#### Scenario: Direct URL access
- **WHEN** user navigates to `/terminal/term-abc`
- **THEN** the terminal view for that terminal is displayed
- **THEN** the corresponding terminal card is highlighted in the sidebar

#### Scenario: Invalid terminal URL
- **WHEN** user navigates to `/terminal/:id` for a non-existent terminal
- **THEN** the view redirects to the landing page
