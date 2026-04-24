## MODIFIED Requirements

### Requirement: Server switching
Selecting a different server in the dropdown SHALL perform a transactional switch: a staging WebSocket connection is opened to the target while the current ("live") connection remains active, and the switch is committed only after the staging connection reaches the `OPEN` state. If the staging connection fails or times out, the switch is aborted and the live connection is preserved with no state loss.

#### Scenario: Switch to reachable remote server
- **WHEN** the user selects a reachable remote server from the dropdown
- **THEN** the dashboard SHALL open a staging WebSocket to the selected server's address while keeping the current WebSocket open
- **AND** upon the staging WebSocket reaching `OPEN`, the dashboard SHALL close the previous WebSocket, swap in-memory session state, and re-subscribe to sessions from the new server
- **AND** only after a successful swap SHALL the new server address be persisted to `localStorage`

#### Scenario: Switch back to localhost when reachable
- **WHEN** the user selects the localhost entry after being connected to a remote server, and localhost is reachable
- **THEN** the dashboard SHALL perform the same transactional switch and reload session data from localhost

#### Scenario: Switch to unreachable server
- **WHEN** the user selects a server whose staging WebSocket does not reach `OPEN` within 5 seconds, or is rejected by the server
- **THEN** the dashboard SHALL close the staging WebSocket and keep the previous connection active
- **AND** in-memory session state SHALL NOT be cleared
- **AND** `localStorage` SHALL NOT be updated
- **AND** a toast SHALL be displayed with the message "Couldn't reach <host>"

#### Scenario: Click during in-flight switch
- **WHEN** a staging switch is already in progress and the user clicks another entry
- **THEN** the second click SHALL be ignored until the first staging attempt resolves (success or failure)

#### Scenario: Staging progress indicator
- **WHEN** a staging switch is in progress
- **THEN** the clicked dropdown entry SHALL display an inline progress indicator
- **AND** the overall connection banner SHALL NOT be shown because the live connection is still open

#### Scenario: Selected server becomes unreachable after switch
- **WHEN** the currently connected server becomes unreachable after a successful switch
- **THEN** the selector SHALL show a disconnected indicator
- **AND** the dashboard SHALL attempt reconnection with existing backoff logic

### Requirement: Persist last-used server
The last-used server address SHALL be persisted in `localStorage` so the dashboard reconnects to it on next launch, but persistence SHALL occur only after a successful `OPEN` of the new connection — never at click time.

#### Scenario: Client persists in localStorage on success
- **WHEN** a staging WebSocket reaches `OPEN` and the switch is committed
- **THEN** the server address SHALL be saved in `localStorage` under `pi-dashboard-last-server`

#### Scenario: Client does not persist on failure
- **WHEN** a staging WebSocket fails to open or times out
- **THEN** the `localStorage` value SHALL remain unchanged from its previous state

#### Scenario: Client reconnects to last-used server
- **WHEN** the dashboard loads and `localStorage` has a saved server address
- **THEN** the dashboard SHALL attempt to connect to the saved server first
- **AND** fall back to localhost discovery if the saved server is unreachable

### Requirement: Server selector in dashboard header
The dashboard header SHALL include a server selector dropdown showing known servers (persisted) plus localhost. Availability probing SHALL run once per dropdown open — not on mount, not on a timer, not while the dropdown is closed. Entries whose probes report unreachable SHALL be rendered with reduced opacity, a `disabled` attribute, and a `cursor-not-allowed` affordance; the selector SHALL NOT call `onSwitch` for unreachable entries. Clicking a reachable entry delegates to the transactional switch.

#### Scenario: Single localhost server (default)
- **WHEN** no known servers are configured
- **THEN** the selector SHALL show localhost with an indicator reflecting its most recent probe result (or no indicator before the first open)

#### Scenario: Known servers displayed
- **WHEN** the config contains known servers
- **THEN** the dropdown SHALL list localhost first, then known servers with their label, host:port, and a "Local" or "Remote" badge

#### Scenario: Manage servers shortcut
- **WHEN** the dropdown is open
- **THEN** a "Manage servers…" button SHALL appear at the top
- **AND** clicking it SHALL navigate to the Servers tab in Settings (`/settings?tab=servers`)

#### Scenario: No probe on mount
- **WHEN** the selector mounts and the dropdown is closed
- **THEN** no health-check request SHALL be issued

#### Scenario: Probe once per dropdown open
- **WHEN** the dropdown transitions from closed to open
- **THEN** each non-current entry SHALL be probed exactly once via `GET /api/health` with a 2-second timeout
- **AND** no further probes SHALL be issued until the dropdown is closed and reopened

#### Scenario: No probe while dropdown is closed
- **WHEN** the dropdown is closed
- **THEN** no periodic probe timer SHALL be running
- **AND** no background health-check requests SHALL be issued

#### Scenario: Unreachable entry is disabled
- **WHEN** an entry's probe reports unreachable
- **THEN** the entry SHALL render with reduced opacity and a `cursor-not-allowed` style
- **AND** the entry SHALL have the `disabled` attribute set
- **AND** clicking the entry SHALL NOT invoke `onSwitch`

#### Scenario: Reachable entry is clickable
- **WHEN** an entry's probe reports reachable (or no probe has run yet for this open-cycle)
- **THEN** the entry SHALL render with normal hover affordance
- **AND** clicking the entry SHALL invoke `onSwitch(host, port)`

#### Scenario: Current server probe shortcut
- **WHEN** an entry matches the currently connected server
- **THEN** its reachability SHALL be derived from the live connection state, not from a separate probe
