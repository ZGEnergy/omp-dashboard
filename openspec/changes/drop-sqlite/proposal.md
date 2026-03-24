## Why

The dashboard server currently duplicates pi's session data into SQLite (events, session metadata). But pi session files on disk (`~/.pi/agent/sessions/`) are already the true persistent source of truth, and the bridge extension can replay any session on demand via `SessionManager.open()`. Removing SQLite eliminates a redundant persistence layer, simplifies the server architecture, and removes the `better-sqlite3` native dependency (which causes build/platform issues).

## What Changes

- **BREAKING**: Remove SQLite database entirely — no more `~/.pi/dashboard/dashboard.db`
- **BREAKING**: Remove `better-sqlite3` dependency
- Replace event persistence with in-memory event buffer (`Map<sessionId, StoredEvent[]>`) with LRU eviction
- Replace session registry SQLite backing with pure in-memory Map, hydrated from bridge connections
- Add on-demand session loading: when a browser subscribes to a session not in memory, server asks a connected bridge to load it from pi's session file via `SessionManager.open(path).getBranch()`
- Add new protocol messages: `load_session_events` (server→extension) and response flow
- Move workspace persistence from SQLite to lightweight JSON file (`~/.pi/dashboard/workspaces.json`)
- Move user preferences (hidden sessions, etc.) to lightweight JSON file (`~/.pi/dashboard/state.json`)
- Old sessions unavailable when no bridge is connected to that workspace (acceptable trade-off for a monitoring tool)

## Capabilities

### New Capabilities
- `in-memory-event-buffer`: In-memory event storage with LRU eviction replacing SQLite events table
- `on-demand-session-replay`: Bridge loads old session files on demand when browsers request them
- `json-file-persistence`: Lightweight JSON file persistence for workspaces and user preferences (hidden sessions, etc.)

### Modified Capabilities
- `event-persistence`: **BREAKING** — Remove SQLite event store entirely, replace with in-memory buffer
- `dashboard-server`: **BREAKING** — Remove SQLite dependency from server initialization, session registry becomes pure in-memory
- `workspace-management`: Storage backend changes from SQLite to JSON file
- `bridge-extension`: Add handler for `load_session_events` requests to load old session files
- `shared-protocol`: Add new message types for on-demand session loading

## Impact

- **Server**: `db.ts`, `event-store.ts` deleted. `session-manager.ts`, `server.ts`, `browser-gateway.ts`, `pi-gateway.ts` rewritten to remove SQLite references
- **Extension**: `bridge.ts` and `command-handler.ts` gain new message handler for loading session files
- **Shared**: `protocol.ts` and `browser-protocol.ts` gain new message types
- **Dependencies**: Remove `better-sqlite3` from package.json
- **Config**: New JSON files under `~/.pi/dashboard/` for workspaces and state
- **Tests**: All tests referencing SQLite, db, or event-store need rewriting
- **Migration**: Users' existing `dashboard.db` becomes unused (no migration needed — data is redundant with pi session files)
