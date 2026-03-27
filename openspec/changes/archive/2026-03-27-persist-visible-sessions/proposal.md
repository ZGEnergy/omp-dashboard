## Why

Ended sessions that are still visible (not hidden by the user) disappear when the dashboard server restarts. The server uses a pure in-memory session map, so all session metadata is lost on restart. Active sessions recover when their bridge reconnects, but ended sessions are gone permanently. Users lose track of completed work unless they manually remember session details.

## What Changes

- Persist non-hidden session metadata to a JSON file on disk so they survive server restarts.
- On server start, load persisted sessions into the in-memory session manager, marked as `dataUnavailable: true` (events are loaded on-demand when the user subscribes).
- When a bridge reconnects (`session_register`), it overwrites the stale persisted entry as it already does in memory.
- When a session is hidden, remove it from the persisted file (hidden sessions don't need to survive restarts).

## Capabilities

### New Capabilities
- `session-persistence`: Persist visible session metadata to disk and restore on server startup.

### Modified Capabilities
<!-- No spec-level behavior changes to existing capabilities. The in-memory session manager gains persistence internally, but external protocol and browser behavior remain unchanged. -->

## Impact

- **Code**: `src/server/memory-session-manager.ts` — add debounced save/load of session metadata JSON file.
- **Files**: New `~/.pi/dashboard/sessions.json` created at runtime.
- **Dependencies**: None new — reuses existing `json-store.ts` helpers.
- **APIs/Protocol**: No changes — browser and bridge protocols are unaffected.
