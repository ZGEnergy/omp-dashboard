## Context

The dashboard currently generates a random UUID per bridge connection as the session ID. This ID has no relationship to pi's internal session ID or file system. Pi stores sessions as JSONL files in `~/.pi/agent/sessions/--cwd--/<timestamp>_<uuid>.jsonl` and exposes `ctx.sessionManager.getSessionId()`, `getSessionFile()`, `getSessionDir()`, and the static `SessionManager.list(cwd)` method. The dashboard has no way to map back to these, list past sessions, or spawn pi to resume one.

Sessions currently stay visible in the sidebar after ending. The user wants ended sessions hidden by default, with a toggle to reveal them for browsing and resume.

## Goals / Non-Goals

**Goals:**
- Use pi's session ID as the dashboard session ID (single identity)
- Store session file path and directory in SQLite for resume
- Hide sessions automatically when they end, show on register
- Handle `session_switch` events (pi changes session mid-connection)
- List available pi sessions for a cwd via the bridge
- Resume (continue same session) or fork (new session from old) via process-manager
- Create SQLite records for pi sessions not yet tracked by the dashboard
- Sidebar toggle to show/hide ended sessions

**Non-Goals:**
- Importing/migrating events from pi JSONL files into dashboard SQLite (later)
- Understanding pi's session tree structure (branching, forking handled by pi)
- Browsing session tree from dashboard (pi provides data over websocket when needed)
- Merging dashboard sessions on reconnect with same pi session ID

## Decisions

### Decision 1: Pi session ID replaces random UUID

The bridge `sessionId` changes from `const sessionId = crypto.randomUUID()` to `let sessionId: string` set from `ctx.sessionManager.getSessionId()` during `session_start`. This means:

- Dashboard session records use pi's UUID (e.g., `c9e247a0-23c1-46a1-899e-f4170a1e39e0`)
- The sessions table primary key is now the pi session ID
- When pi does `--session <path>` (continue), the same ID reconnects → same dashboard record updated
- When pi does `--fork <path>`, a new ID is created → new dashboard record

**Alternative considered:** Keep random UUID and add a separate `piSessionId` column. Rejected because it creates two identity systems and complicates every lookup.

### Decision 2: Mutable sessionId with session_switch

Pi fires `session_switch` when the user switches to a different session (new, resume, fork). After the event, `ctx.sessionManager.getSessionId()` returns a new ID. The bridge handles this by:

1. Sending `session_unregister` for the old ID (triggers hidden=true on server)
2. Reading the new session ID from `ctx.sessionManager.getSessionId()`
3. Sending `session_register` with the new ID (triggers hidden=false on server)
4. Running full state sync for the new session

The `session_switch` event provides `reason: "new" | "resume"` and `previousSessionFile`. The bridge does not need to interpret the reason — it always does unregister/register.

### Decision 3: Hidden lifecycle tied to register/unregister

- `register()` → `hidden = false` (session is active, show in sidebar)
- `unregister()` → `hidden = true` (session ended, hide from sidebar)
- Heartbeat timeout → same as unregister, `hidden = true`
- Never delete session records

This replaces the current behavior where ended sessions stay visible. The sidebar becomes a "live sessions" view by default.

### Decision 4: Session listing via bridge, not filesystem

The dashboard server cannot assume it shares a filesystem with pi sessions (future: remote tunnels). Instead, the bridge calls pi's `SessionManager.list(cwd)` static method when requested.

Flow: browser → server → bridge → `SessionManager.list(cwd)` → bridge → server → browser

The server creates SQLite records for any sessions returned by pi that don't exist in the database yet. These records are created with `status = "ended"`, `hidden = true`, and metadata from `SessionInfo` (id, cwd, name, path, timestamps, messageCount, firstMessage).

### Decision 5: Resume uses pi CLI flags

- **Continue:** `pi --session <session-file-path>` — same JSONL, same session ID
- **Fork:** `pi --fork <session-file-path>` — new JSONL, new session ID, old stays hidden

The process-manager's `spawnPiSession` is extended with optional `sessionFile` and `mode` parameters. The tmux command becomes:
```
cd {cwd} && PI_DASHBOARD_SPAWNED=1 pi --session {path}   # continue
cd {cwd} && PI_DASHBOARD_SPAWNED=1 pi --fork {path}      # fork
```

### Decision 6: Session file/dir as new columns

Two new columns on the sessions table: `session_file TEXT` and `session_dir TEXT`. These are populated from `ctx.sessionManager.getSessionFile()` and `ctx.sessionManager.getSessionDir()` sent in the `session_register` message. They enable the resume flow (need the file path to pass to `pi --session`).

## Risks / Trade-offs

**[Risk] Pi session ID collision on continue** — When a user does `pi --session <path>`, pi reuses the same session ID. If the dashboard still has an active record for that ID (e.g., stale heartbeat), `register()` will overwrite it. → Mitigation: `INSERT OR REPLACE` already handles this in the sessions table.

**[Risk] SessionManager.list() performance** — Listing sessions reads JSONL file headers from disk. For directories with many sessions, this could be slow. → Mitigation: Pi's `SessionManager.list()` already handles this efficiently with lazy loading. The dashboard only requests listings on user action, not on a poll interval.

**[Risk] Bridge import of SessionManager** — The bridge needs to import `SessionManager` from `@mariozechner/pi-coding-agent` to call the static `list()` method. This is a new dependency path for the bridge. → Mitigation: The bridge already imports `ExtensionAPI` from the same package. `SessionManager` is a peer export.

**[Trade-off] No event migration for discovered sessions** — Sessions created from pi listing have no events in dashboard SQLite. If a user selects one, the chat view will be empty. → Accepted: The user can resume/fork the session to see live conversation. Full import is scoped as a future enhancement.
