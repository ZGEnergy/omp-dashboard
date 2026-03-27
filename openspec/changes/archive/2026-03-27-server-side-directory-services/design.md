## Context

The dashboard server currently depends on bridge extensions for three directory-level operations: OpenSpec polling, session history listing, and on-demand session event loading. Each bridge runs inside a pi agent process and uses pi's `SessionManager` API and the `openspec` CLI. This creates redundancy (N bridges polling the same CLI per directory) and a bootstrap gap (pinned directories with no active sessions can't show any data).

The server already knows all relevant directories from two sources: pinned directories in `state-store.ts` and cwds of registered sessions in `memory-session-manager.ts`. It can compute the union of these to drive per-directory polling.

Key existing modules being replaced or simplified:
- `src/extension/openspec-poller.ts` — bridge-side openspec CLI polling
- `src/extension/session-history.ts` — bridge-side SessionManager.list() call
- `src/extension/command-handler.ts` — handles `load_session_events` via SessionManager.open()
- `src/server/pending-load-manager.ts` — tracks in-flight bridge load requests
- `src/extension/state-replay.ts` — converts session entries to dashboard events (reused server-side)

## Goals / Non-Goals

**Goals:**
- Server polls `openspec` CLI per directory, eliminating bridge-side polling
- Server reads session history and loads session events directly via `SessionManager` import
- Pinned directories with no active sessions show OpenSpec data and historical sessions
- Single poll per directory regardless of number of active sessions
- Simplify bridge by removing openspec polling, session history sync, and event loading responsibilities

**Non-Goals:**
- Changing the OpenSpec UI layout (separate change: `openspec-folder-card-ui`)
- Adding new spawn functionality (separate change: `new-spec-spawn`)
- Moving git info polling to server (can be done later, same pattern)
- Changing activity detection — phase/change tracking stays on bridge

## Decisions

### 1. Server imports `@mariozechner/pi-coding-agent` as runtime dependency

The server imports `SessionManager` from the pi package to call `SessionManager.list(cwd)` and `SessionManager.open(file).getBranch()` directly. This is the same code the bridge uses today.

**Alternative considered:** Spawning a hidden pi agent per directory. Rejected — heavier, more complex, provides no additional value since `SessionManager` is a pure filesystem API.

**Alternative considered:** Reverse-engineering the session file format. Rejected — fragile, couples to undocumented internals. Importing the published API is the correct approach.

### 2. New `DirectoryService` module on the server

A single new module `src/server/directory-service.ts` that:
- Computes known directories = union of pinned dirs + cwds of all registered sessions
- Polls `openspec` CLI per directory every 30s (reuses `pollOpenSpec()` function moved from extension)
- Calls `SessionManager.list(cwd)` on startup and when directories change
- Calls `SessionManager.open(file).getBranch()` for on-demand session event loading
- Caches results per directory, only broadcasts on change

This centralizes all directory-scoped operations in one place.

### 3. Move `pollOpenSpec()` and `replayEntriesAsEvents()` to `src/shared/`

These are pure functions with no bridge dependencies:
- `pollOpenSpec(cwd)` → calls `openspec` CLI, returns `OpenSpecData`
- `replayEntriesAsEvents(sessionId, entries)` → converts session entries to events

Move them to shared so both server and bridge can import them. The bridge still needs `replayEntriesAsEvents` for live state replay on reconnect (replaying the current session's entries).

### 4. OpenSpec data keyed by cwd in browser protocol

Currently `openspec_update` includes `sessionId`. Change to `cwd`:

```typescript
// Before
{ type: "openspec_update", sessionId: string, data: OpenSpecData }

// After  
{ type: "openspec_update", cwd: string, data: OpenSpecData }
```

Browser stores OpenSpec data in `Map<cwd, OpenSpecData>` instead of `Map<sessionId, OpenSpecData>`.

### 5. Session event loading becomes synchronous on server

Currently: browser → server → bridge → SessionManager → bridge → server → browser (async, with pending load tracking, timeouts, bridge disconnect handling).

New: browser → server → SessionManager → server → browser (synchronous file read, no pending loads).

`pending-load-manager.ts` is removed entirely. The `dataUnavailable` state only triggers when the session file doesn't exist or is corrupted, not due to "no bridge available."

### 6. Session history sync on directory discovery

Instead of waiting for a bridge to connect and send `session_history_sync`, the server calls `SessionManager.list(cwd)` directly:
- On server startup: for all persisted session cwds and pinned dirs
- When a new pinned directory is added
- When a new session registers with a previously unknown cwd

Same dedup logic as today: skip sessions already in memory, insert new ones as `status: "ended", hidden: true`.

### 7. Bridge cleanup — remove three responsibilities

Bridge drops:
- `openspec-poller.ts` — entire file removed
- `session-history.ts` — entire file removed  
- `load_session_events` handling in `command-handler.ts` — removed
- OpenSpec polling timer in `bridge.ts` — removed
- `openspec_refresh` message handling — removed

Bridge keeps:
- Live event streaming (`event_forward`)
- Prompt routing (`send_prompt`)
- Activity detection (openspec phase/change from tool events)
- Model/thinking info
- Commands list
- State replay on reconnect (replaying current session's entries for live sessions)
- Git info polling (unchanged for now)

### 8. Protocol message cleanup

**Removed from extension→server:**
- `openspec_update` (server polls directly)
- `session_history_sync` (server reads directly)
- `load_session_events_result` / `load_session_events_error` (server reads directly)

**Removed from server→extension:**
- `openspec_refresh` (server refreshes directly)
- `load_session_events` (server reads directly)

**Removed from server→browser:**
- (none removed, but `openspec_update` changes from sessionId-keyed to cwd-keyed)

**Added to browser→server:**
- `openspec_refresh` now targets a `cwd` instead of `sessionId`

**Kept unchanged:**
- `openspec_activity_update` (bridge→server) — still per-session, still from bridge

## Risks / Trade-offs

- **[Risk] pi package version mismatch**: Server imports `@mariozechner/pi-coding-agent` — if the user's pi version has a different `SessionManager` API, it could break. → **Mitigation**: Use dynamic import with try/catch, graceful fallback to "data unavailable" state. Same approach the bridge already uses.

- **[Risk] File locking on Windows**: `SessionManager.open()` reads session files. If a pi agent is actively writing, could there be contention? → **Mitigation**: The bridge already does this today without issues. Session files use append-only JSON lines format. Read-only access is safe.

- **[Risk] Server startup time**: Calling `SessionManager.list()` for many directories on startup could be slow. → **Mitigation**: Do it asynchronously after the HTTP server is listening. Show directories with loading state initially.

- **[Trade-off] `openspec` CLI must be available on the server's PATH**: Previously only needed on the machine running pi. Now needed where the server runs. In practice this is almost always the same machine.

- **[Trade-off] Tighter coupling to pi internals**: The server now imports `@mariozechner/pi-coding-agent`. If the package changes its `SessionManager` API, the server breaks. → **Mitigation**: Pin the dependency version. The API has been stable.
