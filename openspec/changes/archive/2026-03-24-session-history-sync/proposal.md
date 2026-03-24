## Why

When the dashboard database is deleted or reset, all ended/inactive session history is permanently lost. Only currently active sessions (with a running bridge extension) re-register. Users lose visibility into past sessions for a workspace, making the dashboard feel unreliable after any data recovery scenario.

## What Changes

- Bridge extension sends local session history (from pi's `SessionManager.list(cwd)`) to the server on connect
- Server deduplicates and inserts unknown sessions as `ended` + `hidden=true`
- New protocol message type `session_history_sync` (extension → server)
- Hidden historical sessions become visible when the user toggles "show hidden" in the web client (existing functionality)

## Capabilities

### New Capabilities
- `session-history-sync`: Bridge extension syncs local pi session history to the dashboard server on connect, allowing recovery of session metadata after database reset

### Modified Capabilities
- `shared-protocol`: New `session_history_sync` message type from extension to server
- `bridge-extension`: Bridge sends session history on connect using pi's `SessionManager.list(cwd)` API

## Impact

- `src/shared/protocol.ts` — new message type
- `src/extension/bridge.ts` — send history on connect
- `src/server/session-manager.ts` or `src/server/pi-gateway.ts` — handle incoming history, deduplicate, insert
- `src/server/browser-gateway.ts` — broadcast new sessions to connected browsers
- No breaking changes, no new dependencies (uses existing `SessionManager` from `@mariozechner/pi-coding-agent`)
