## Purpose

Server-side OpenSpec CLI polling per directory. The server polls each known directory (pinned dirs + session cwds) every 30s and broadcasts results keyed by cwd to connected browsers, replacing the previous per-session bridge-side polling.

## ADDED Requirements

### Requirement: Server polls openspec CLI per directory
The server SHALL run `openspec list --json` and `openspec status --change <name> --json` for each known directory every 30 seconds and broadcast results keyed by cwd to connected browsers.

#### Scenario: Periodic poll for a known directory
- **WHEN** 30 seconds have elapsed since the last poll for a directory
- **THEN** the server SHALL run the openspec CLI for that directory and broadcast an `openspec_update` message with `cwd` and `data` fields if the data has changed

#### Scenario: Initial poll on server startup
- **WHEN** the server starts with known directories
- **THEN** the server SHALL poll openspec for each known directory and broadcast initial results to any connected browsers

#### Scenario: New directory becomes known
- **WHEN** a new pinned directory is added or a session registers with a new cwd
- **THEN** the server SHALL immediately poll openspec for that directory

#### Scenario: openspec CLI not available
- **WHEN** `openspec` is not installed or the directory is not an openspec project
- **THEN** the server SHALL cache `{ initialized: false, changes: [] }` for that directory

#### Scenario: Browser requests immediate refresh
- **WHEN** a browser sends `openspec_refresh` with a `cwd` field
- **THEN** the server SHALL immediately re-poll the openspec CLI for that directory and broadcast the result

### Requirement: OpenSpec data keyed by directory in browser protocol
The server SHALL send `openspec_update` messages to browsers keyed by `cwd` instead of `sessionId`.

#### Scenario: Browser receives openspec_update
- **WHEN** the server broadcasts an openspec_update
- **THEN** the message SHALL contain `{ type: "openspec_update", cwd: string, data: OpenSpecData }` with no sessionId field

#### Scenario: Browser connects and receives initial state
- **WHEN** a browser WebSocket connects
- **THEN** the server SHALL send cached `openspec_update` messages for all known directories that have initialized OpenSpec data

### Requirement: Deduplicated polling across sessions
The server SHALL poll each directory at most once per polling interval, regardless of how many sessions are registered for that directory.

#### Scenario: Multiple sessions in same directory
- **WHEN** three sessions are registered for `/project/foo`
- **THEN** the server SHALL run the openspec CLI once for `/project/foo`, not three times
