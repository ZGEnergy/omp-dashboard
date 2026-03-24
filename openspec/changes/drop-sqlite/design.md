## Context

The dashboard server currently uses SQLite (via `better-sqlite3`) for three purposes:
1. **Events** — buffering bridge events for browser replay
2. **Sessions** — persisting session metadata across restarts
3. **Workspaces** — storing user-defined workspace groupings

However, pi session files on disk (`~/.pi/agent/sessions/`) are the true source of truth. The bridge already replays full session history on every connect via `replayEntriesAsEvents()`, and the server wipes SQLite events on each `session_register`. This makes SQLite a redundant middleman.

Current dependencies: `better-sqlite3` (native C++ addon) causes platform/build issues and adds ~15MB to installs.

## Goals / Non-Goals

**Goals:**
- Remove SQLite and `better-sqlite3` entirely
- Events served from in-memory buffer with LRU eviction
- Sessions served from in-memory Map, hydrated from bridge connections
- Workspaces persisted in a lightweight JSON file
- User preferences (hidden sessions) persisted in a lightweight JSON file
- Old sessions loadable on demand via bridge's `SessionManager.open()`
- No behavioral change for active sessions — browsers see the same events

**Non-Goals:**
- Offline browsing of old sessions when no bridge is connected (accepted trade-off)
- Migrating existing SQLite data (it's redundant with pi session files)
- Changing the browser↔server or extension↔server WebSocket protocol fundamentals

## Decisions

### 1. In-memory event buffer replaces SQLite events table

**Choice:** `Map<sessionId, { events: StoredEvent[], lastAccess: number }>` with same `EventStore` interface.

**Why:** Events are already transient — deleted on every `session_register`. SQLite was just a cache between bridge replay and browser subscribe. An in-memory Map is faster and simpler.

**LRU eviction policy:**
- **Pinned:** sessions with active bridge OR active browser subscribers — never evicted
- **Evictable:** ended sessions with zero subscribers
- **Trigger:** check on every insert; evict when total session count exceeds `MAX_CACHED_SESSIONS` (default 100)
- **Order:** evict least-recently-accessed first (by `lastAccess` timestamp)
- On eviction, just delete the entry — bridge can reload from pi session file on demand

**Subscriber-count awareness:** The event store SHALL receive an `isSessionPinned(sessionId): boolean` callback at creation. The browser gateway exposes subscriber counts per session. The callback checks: has active bridge connection OR has browser subscribers > 0.

**Alternatives considered:**
- Keep SQLite for events only → still has native dep, still redundant
- No buffer at all (bridge replays per browser) → adds latency, complex routing

### 2. On-demand session loading via bridge

**Choice:** New protocol message `load_session_events` (server→extension) asks any connected bridge in the same workspace to load a session file and replay its events.

**Flow:**
1. Browser subscribes to session not in memory
2. Server sends immediate `event_replay { events: [], isLast: false }` so browser knows loading is in progress
3. Server finds a connected bridge whose `cwd` overlaps the session's `cwd`
4. Server sends `load_session_events { sessionId, sessionFile }` to bridge
5. Bridge calls `SessionManager.open(sessionFile).getBranch()`
6. Bridge uses `replayEntriesAsEvents()` to convert and sends a single `load_session_events_result` message containing all events back to the server
7. Server stores events in memory buffer and sends `event_replay` batch to all waiting browsers

**If no bridge is available:** server sends `event_replay { events: [], isLast: true }` and `session_updated { dataUnavailable: true }`.

**Pending load tracking:** Server maintains `pendingLoads: Map<sessionId, { requestedAt: number, browsers: Set<WebSocket>, bridgeSessionId: string }>`. This enables:
- **Deduplication:** if a second browser subscribes to the same session while a load is in flight, it joins the pending set instead of triggering a new bridge request
- **Timeout:** a 10-second timer fires per pending load; on timeout, treat as failure, send `dataUnavailable: true` to waiting browsers, clean up pending entry
- **Bridge disconnect handling:** when a bridge WS closes, cancel all pending loads associated with that bridge; try another bridge or fail to browsers

**Key design choice — batch vs streaming replay:** The bridge sends ALL loaded events in a single `load_session_events_result` message (not individual `event_forward` messages). This prevents on-demand replay events from being confused with live events and allows the server to do a clean batch insert + `event_replay` to browsers.

**Alternatives considered:**
- Server reads pi session files directly → couples server to pi internals, requires file access
- Bridge sends individual `event_forward` for replayed events → server can't distinguish from live events, causes broadcasting to wrong subscribers

### 3. Workspaces persisted in JSON file

**Choice:** `~/.pi/dashboard/workspaces.json` — array of workspace objects, read on startup, written on every mutation.

**Why:** Workspaces are small (typically <20 entries), rarely mutated. A JSON file is trivial to implement and human-readable.

**Format:**
```json
[
  { "id": "uuid", "name": "My Project", "path": "/home/user/project", "sortOrder": 0, "createdAt": 1234567890 }
]
```

**Write strategy:** atomic write (write to `.tmp`, rename). Prevents corruption on crash.

### 4. User preferences in JSON state file

**Choice:** `~/.pi/dashboard/state.json` — stores hidden session IDs and any future user preferences.

**Format:**
```json
{
  "hiddenSessions": ["session-id-1", "session-id-2"]
}
```

**Why:** Only `hidden` flag needs persistence. Token stats and other transient data are rebuilt from bridge connections. Hidden is a user action that should survive restarts.

**Write strategy:** same atomic write pattern. Debounced (max once per second) to avoid excessive disk writes when hiding multiple sessions.

### 5. Session manager becomes pure in-memory

**Choice:** `Map<sessionId, DashboardSession>` with no SQLite backing. Populated from:
- Bridge `session_register` messages (active sessions)
- Bridge `session_history_sync` messages (historical sessions in workspace)
- On-demand loading (when browser requests a session)

**On server restart:** Map is empty. As bridges reconnect, they re-register and replay. Historical sessions appear after `session_history_sync`.

**Stale session handling:** No longer needed — there's nothing to mark as stale on startup. Sessions only exist when bridges report them.

### 6. Config cleanup

**Choice:** Remove `dbPath` and `retentionDays` from `DashboardConfig` — no longer relevant.

## Risks / Trade-offs

- **[Memory growth]** → Mitigated by LRU eviction with configurable max. Typical session is 50-500KB; 100 sessions ≈ 5-50MB.
- **[Old sessions unavailable without bridge]** → Accepted. Dashboard shows clear indicator. Users can start a pi session in the workspace to load history.
- **[Server restart loses all state]** → Acceptable. Bridges reconnect within seconds and replay everything. Workspaces and hidden prefs are in JSON files.
- **[Race condition on JSON writes]** → Mitigated by atomic write (tmp+rename) and debouncing.
- **[No migration path for existing SQLite data]** → Acceptable. All data is redundant with pi session files. Users may delete `dashboard.db` manually.
- **[On-demand load timeout]** → 10-second timeout prevents hanging when bridge disconnects mid-load.
- **[Bridge reconnect during pending load]** → Pending loads cancelled on bridge WS close; retried with new bridge or failed to browser.
