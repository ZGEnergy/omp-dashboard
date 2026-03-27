## Why

The dashboard currently relies on bridge extensions (running inside pi agents) for all directory-level operations: OpenSpec polling, session history listing, and session event loading. This creates a bootstrap problem — pinned directories with no active sessions have zero visibility into their OpenSpec state or historical sessions. It also means N sessions in the same directory produce N redundant polls of the same CLI tools. Moving these directory-scoped operations to the server eliminates the bridge dependency, enables zero-session directories, and removes redundant work.

## What Changes

- Server imports `@mariozechner/pi-coding-agent` to call `SessionManager.list(cwd)` and `SessionManager.open(file).getBranch()` directly, removing the need for bridge-mediated session history sync and on-demand session loading.
- Server polls `openspec` CLI per known directory (pinned dirs + dirs with active sessions) instead of each bridge polling independently.
- **BREAKING**: Bridge no longer sends `session_history_sync`, `openspec_update`, or handles `load_session_events` / `openspec_refresh` messages. These protocol messages are removed or repurposed.
- OpenSpec data is keyed by directory (cwd) in the server and browser protocol, not by session.
- Browser receives `openspec_update` messages keyed by cwd instead of sessionId.
- Bridge retains: live event streaming, prompt routing, activity detection (phase/change), model info, commands list.

## Capabilities

### New Capabilities
- `server-session-reader`: Server reads pi session history and session events directly via `SessionManager` import, without requiring a bridge connection.
- `server-openspec-polling`: Server polls `openspec` CLI per directory on a timer, broadcasting results keyed by cwd to browsers.

### Modified Capabilities
- `openspec-polling`: **BREAKING** — Polling moves from bridge to server, keyed by directory instead of session. Bridge no longer polls or responds to refresh requests.
- `session-history-sync`: **BREAKING** — Server reads session history directly instead of receiving it from bridge. Bridge no longer sends `session_history_sync`.
- `on-demand-session-replay`: **BREAKING** — Server loads session events directly via `SessionManager.open().getBranch()` instead of requesting from bridge. `load_session_events` / `load_session_events_result` protocol messages removed.

## Impact

- **Server** (`src/server/`): New modules for direct SessionManager access and per-directory OpenSpec polling. Changes to `server.ts`, `browser-gateway.ts` for new data flow. `pending-load-manager.ts` simplified or removed (no more bridge-mediated loads).
- **Bridge** (`src/extension/`): Remove `openspec-poller.ts`, `session-history.ts`, and `load_session_events` handling from `command-handler.ts`. Remove openspec polling timer from `bridge.ts`. Significant simplification.
- **Protocol** (`src/shared/`): `protocol.ts` loses `OpenSpecUpdateMessage`, `OpenSpecRefreshMessage`, `SessionHistorySyncMessage`, `LoadSessionEventsMessage` and related types. `browser-protocol.ts` changes `openspec_update` from session-keyed to cwd-keyed.
- **Client** (`src/client/`): `event-reducer.ts` and components consume OpenSpec data per-directory instead of per-session. `App.tsx` WebSocket handling updated.
- **Dependencies**: `@mariozechner/pi-coding-agent` becomes a runtime dependency of the server (currently only used by the extension).
