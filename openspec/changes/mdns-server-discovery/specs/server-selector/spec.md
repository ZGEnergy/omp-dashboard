## ADDED Requirements

### Requirement: Server selector in dashboard header
The dashboard header SHALL include a server selector dropdown showing all discovered dashboard servers (local and remote).

#### Scenario: Single localhost server (default)
- **WHEN** only one localhost server is discovered
- **THEN** the selector SHALL show the server hostname and a green connected indicator
- **AND** the dropdown SHALL be available but show only the single server

#### Scenario: Multiple servers discovered
- **WHEN** both local and remote servers are discovered
- **THEN** the dropdown SHALL list all servers with hostname, port, and a "Local" or "Remote" badge

#### Scenario: Remote server appears
- **WHEN** a new remote server is discovered via mDNS while the dashboard is open
- **THEN** it SHALL appear in the server selector dropdown with an "Available" status

### Requirement: Server switching
Selecting a different server in the dropdown SHALL re-establish the WebSocket connection and reload session data from the new server.

#### Scenario: Switch to remote server
- **WHEN** the user selects a remote server from the dropdown
- **THEN** the dashboard SHALL close the current WebSocket connection
- **AND** open a new WebSocket to the selected server's address
- **AND** re-subscribe to sessions from the new server

#### Scenario: Switch back to localhost
- **WHEN** the user selects the localhost server after being connected to a remote server
- **THEN** the dashboard SHALL reconnect to localhost and reload session data

#### Scenario: Selected server becomes unreachable
- **WHEN** the currently connected server disappears from mDNS
- **THEN** the selector SHALL show a disconnected indicator
- **AND** the dashboard SHALL attempt reconnection with existing backoff logic

### Requirement: Persist last-used server
The last-used server address SHALL be persisted so the dashboard reconnects to it on next launch.

#### Scenario: Client persists in localStorage
- **WHEN** the user switches to a server
- **THEN** the server address SHALL be saved in `localStorage` under `pi-dashboard-last-server`

#### Scenario: Client reconnects to last-used server
- **WHEN** the dashboard loads and `localStorage` has a saved server address
- **THEN** the dashboard SHALL attempt to connect to the saved server first
- **AND** fall back to localhost discovery if the saved server is unreachable

### Requirement: Server discovery via WebSocket message
The server SHALL broadcast discovered peer servers to connected browsers so the web client can populate the selector without needing mDNS in the browser.

#### Scenario: Server sends peer list
- **WHEN** a browser connects to the dashboard server
- **THEN** the server SHALL send a `servers_discovered` message with the list of all mDNS-discovered peer servers

#### Scenario: Server sends peer update
- **WHEN** a new peer server appears or disappears on the network
- **THEN** the server SHALL broadcast a `servers_updated` message to all connected browsers
