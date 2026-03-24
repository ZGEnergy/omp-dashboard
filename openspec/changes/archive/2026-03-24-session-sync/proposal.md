## Why

The dashboard generates a random UUID for each bridge connection, losing the identity of the actual pi session. This means the dashboard cannot map sessions back to pi's JSONL files, cannot detect reconnections of the same session, cannot list past sessions for resume, and cannot spawn pi to continue or fork an old session. Sessions also remain visible in the sidebar forever after ending, cluttering the UI.

## What Changes

- **Pi session ID as dashboard session ID**: Replace `crypto.randomUUID()` in the bridge with `ctx.sessionManager.getSessionId()`. The dashboard session ID becomes the pi session ID, enabling identity tracking across reconnections.
- **Session file and directory storage**: The bridge sends `sessionFile` and `sessionDir` on registration. The server persists these in SQLite so the dashboard knows where each session's JSONL lives.
- **Hidden lifecycle**: Sessions become hidden (`hidden = true`) when they end (unregister or heartbeat timeout). Sessions become visible (`hidden = false`) when they register. The sidebar shows only active sessions by default, with a toggle to reveal hidden/ended sessions. Sessions are never deleted.
- **Session switch handling**: When pi fires `session_switch` (new session, resume, fork), the bridge unregisters the old session ID and registers the new one. The old session becomes hidden, the new one is active and visible.
- **Session listing via pi API**: A new protocol message allows the dashboard to request available sessions for a given cwd. The bridge calls pi's `SessionManager.list(cwd)` static method and returns session metadata. Sessions not yet in SQLite are created as ended + hidden records (no event migration).
- **Resume and fork**: The dashboard can spawn a new pi instance to continue (`pi --session <path>`) or fork (`pi --fork <path>`) an existing session. The process-manager is extended to accept a session file argument. For continue, the same session reconnects. For fork, a new session is created and the old one stays hidden.
- **Hidden toggle in sidebar**: The sidebar UI gets a toggle to show/hide ended sessions. When toggled on, all sessions (including pi-only sessions discovered via listing) are visible and can be resumed or forked.
- **First message as display name fallback**: The bridge extracts the first user message text from session entries and sends it on registration. The display name function uses: explicit name → first message (truncated) → cwd last segment. This makes sessions distinguishable in the sidebar without requiring explicit `/name` usage.

## Capabilities

### New Capabilities
- `session-identity`: Pi session ID tracking, session file/dir storage, hidden lifecycle, and session switch handling in the bridge and server
- `session-listing`: Listing available pi sessions for a cwd via the bridge, creating SQLite records for undiscovered sessions
- `session-resume`: Resuming (continue) or forking sessions from the dashboard via process-manager

### Modified Capabilities
- `bridge-extension`: Bridge uses pi session ID instead of random UUID, handles `session_switch` event, sends session file/dir on register, supports `list_sessions` protocol message
- `shared-protocol`: New protocol messages for session listing and resume between all three components
- `event-persistence`: Sessions table gains `session_file`, `session_dir`, `hidden` columns; unregister sets hidden; register clears hidden
- `process-manager`: Extended to accept session file path for `--session` and `--fork` spawn modes
- `session-sidebar`: Default view shows only active (non-hidden) sessions; toggle reveals hidden sessions with resume/fork actions
- `session-filtering`: Filtering must account for hidden flag

## Impact

- **Bridge extension** (`src/extension/bridge.ts`): Session ID becomes mutable (`let` not `const`), set from `ctx.sessionManager.getSessionId()`. New `session_switch` handler. New `list_sessions` handler importing `SessionManager` from pi.
- **Protocol** (`src/shared/protocol.ts`, `src/shared/browser-protocol.ts`): New messages: `list_sessions`, `sessions_list`, `resume_session`. `session_register` gains `sessionFile` and `sessionDir` fields.
- **Types** (`src/shared/types.ts`): `DashboardSession` gains `sessionFile`, `sessionDir`, `hidden` fields.
- **Database** (`src/server/db.ts`): Three new ALTER migrations for `session_file`, `session_dir`, `hidden` columns.
- **Session manager** (`src/server/session-manager.ts`): `unregister()` sets `hidden = true`. `register()` sets `hidden = false`. New persistable fields. Hydration includes new columns.
- **Process manager** (`src/server/process-manager.ts`): `spawnPiSession()` accepts optional `sessionFile` and `mode` ("continue" | "fork") parameters.
- **Browser gateway** (`src/server/browser-gateway.ts`): Handles `list_sessions` and `resume_session` messages.
- **Server** (`src/server/server.ts`): Wires up new message flows, creates session records for pi-listed sessions not in SQLite.
- **Sidebar UI** (`src/client/`): Hidden toggle, resume/fork actions on session cards.
