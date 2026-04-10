## MODIFIED Requirements

### Requirement: Session heartbeat protocol
The bridge extension SHALL send `session_heartbeat` messages at a fixed interval (15 seconds) to keep the session alive on the server. The server SHALL maintain a heartbeat timeout (45 seconds) per connected session. If no heartbeat is received within the timeout, the server SHALL unregister the session.

The server SHALL implement sleep-aware heartbeat detection: if the elapsed wall-clock time since the timer was set exceeds 2× the expected timeout (indicating system sleep/wake), the server SHALL grant one grace period (reset the timer) instead of immediately unregistering.

Extension → Server:
- `session_heartbeat`: keepalive signal. Fields: `sessionId` (string), optional `metrics` (ProcessMetrics).

#### Scenario: Normal heartbeat
- **WHEN** the bridge sends heartbeats every 15 seconds
- **THEN** the server SHALL keep the session registered

#### Scenario: Heartbeat timeout
- **WHEN** no heartbeat is received for 45 seconds (and no sleep detected)
- **THEN** the server SHALL unregister the session

#### Scenario: Sleep-wake grace period
- **WHEN** the heartbeat timer fires after system wake (elapsed time > 2× timeout)
- **THEN** the server SHALL reset the timer once, giving the bridge time to reconnect

#### Scenario: Grace period exhausted
- **WHEN** the timer fires again after the grace period and still no heartbeat
- **THEN** the server SHALL unregister the session

## ADDED Requirements

### Requirement: Process list message from extension to server
The protocol SHALL define a `process_list` message type for ExtensionToServerMessage. Fields: `type: "process_list"`, `sessionId` (string), `processes` (array of `{ pid: number, pgid: number, command: string, elapsedMs: number }`).

#### Scenario: Message type definition
- **WHEN** the protocol types are compiled
- **THEN** `ProcessListMessage` SHALL be a valid TypeScript interface in the `ExtensionToServerMessage` union

#### Scenario: Empty process list
- **WHEN** no child processes are active
- **THEN** the `processes` array SHALL be empty

### Requirement: Kill process message from server to extension
The protocol SHALL define a `kill_process` message type for ServerToExtensionMessage. Fields: `type: "kill_process"`, `sessionId` (string), `pgid` (number).

#### Scenario: Message type definition
- **WHEN** the protocol types are compiled
- **THEN** `KillProcessMessage` SHALL be a valid TypeScript interface in the `ServerToExtensionMessage` union

### Requirement: Process list update message from server to browser
The browser protocol SHALL define a `process_list_update` message type for ServerToBrowserMessage. Fields: `type: "process_list_update"`, `sessionId` (string), `processes` (array of `{ pid: number, pgid: number, command: string, elapsedMs: number }`).

#### Scenario: Message type definition
- **WHEN** the browser protocol types are compiled
- **THEN** `ProcessListUpdateMessage` SHALL be a valid TypeScript interface in the `ServerToBrowserMessage` union

### Requirement: Kill process request message from browser to server
The browser protocol SHALL define a `kill_process` message type for BrowserToServerMessage. Fields: `type: "kill_process"`, `sessionId` (string), `pgid` (number).

#### Scenario: Message type definition
- **WHEN** the browser protocol types are compiled
- **THEN** `KillProcessRequestMessage` SHALL be a valid TypeScript interface in the `BrowserToServerMessage` union
