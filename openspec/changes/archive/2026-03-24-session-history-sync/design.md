## Context

When the dashboard database is deleted or the server restarts with a fresh DB, all historical session metadata is lost. Currently, only active sessions (with a running bridge) re-register. Pi stores session history locally as JSONL files in `~/.pi/agent/sessions/`, organized by cwd. The pi SDK exports `SessionManager.list(cwd)` which returns `SessionInfo[]` with id, cwd, name, created, modified, firstMessage, messageCount, and path — without needing to parse files manually.

## Goals / Non-Goals

**Goals:**
- Recover historical session metadata after a DB reset by syncing from pi's local session files
- Use the official pi API (`SessionManager.list(cwd)`) — no direct filesystem scanning
- Inserted sessions are `hidden=true` so they don't clutter the default view but appear with "show hidden"
- Deduplication: sessions already in the DB are skipped

**Non-Goals:**
- Replaying event logs for historical sessions (no events, just metadata)
- Recovering token/cost/model data (not available from `SessionInfo`)
- Syncing sessions from other workspaces (only current cwd)
- Continuous polling — this is a one-time sync on connect

## Decisions

### 1. Use `SessionManager.list(cwd)` from pi SDK
**Rationale:** The pi SDK exports `SessionManager` with a static `list(cwd)` method that returns `SessionInfo[]`. This is the official API, avoids filesystem assumptions, and extracts metadata efficiently. Alternative: scanning JSONL files directly — rejected because it couples to pi's internal storage format.

### 2. Send history as a single `session_history_sync` message
**Rationale:** One message with an array of session summaries is simpler than sending N individual messages. The bridge sends this once after `session_register` on connect. The server processes the batch, inserts unknown sessions, and broadcasts additions to browsers.

### 3. Insert as `ended` + `hidden=true`
**Rationale:** Historical sessions are not active. Marking them `hidden=true` keeps the default session list clean. Users see them when toggling "show hidden" in the web client — this existing UI feature requires no changes.

### 4. Source defaults to `"tui"` for historical sessions
**Rationale:** `SessionInfo` doesn't include the session source. Since most pi sessions are TUI-based, defaulting to `"tui"` is a reasonable approximation. Alternative: omitting source — rejected because the type system requires it.

## Risks / Trade-offs

- **[Missing metadata]** Historical sessions won't have model, cost, or token data → Acceptable; the purpose is visibility and resume capability, not full analytics
- **[Large session lists]** A workspace with hundreds of sessions could produce a large sync message → Mitigated by sending only metadata (no events); even 100 sessions is a small JSON payload
- **[Race condition]** Current session might appear in `SessionManager.list()` results → Server deduplicates by ID, so the already-registered active session is skipped
