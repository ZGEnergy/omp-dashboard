## ADDED Requirements

### Requirement: SQLite event store
The dashboard server SHALL persist all events in a SQLite database at the configured path (default `~/.pi/dashboard/dashboard.db`) using `better-sqlite3` (native file-based SQLite binding). The database SHALL be created automatically on first run with the required schema. WAL journal mode SHALL be enabled on database open.

Each event record SHALL contain: id (autoincrement), sessionId, seq (per-session sequence number), eventType, payload (JSON string), createdAt (unix timestamp ms).

#### Scenario: Event storage
- **WHEN** an event arrives from a bridge extension
- **THEN** the server SHALL assign the next sequence number for that session, serialize the payload to JSON, and insert into SQLite. The write SHALL be persisted to disk immediately (no periodic flush needed).

#### Scenario: Database creation on first run
- **WHEN** the dashboard server starts and no database file exists
- **THEN** it SHALL create the database file and run all migrations to create the schema

#### Scenario: Database in custom location
- **WHEN** the server is configured with a custom `dbPath`
- **THEN** the database SHALL be created at that path, including any parent directories

#### Scenario: WAL mode enabled
- **WHEN** the database is opened
- **THEN** the server SHALL enable WAL journal mode via `PRAGMA journal_mode=WAL`

### Requirement: Per-session sequence numbers
Each event SHALL receive a monotonically increasing sequence number scoped to its session. Sequence numbers SHALL start at 0 for each session and increment by 1.

#### Scenario: Sequence number assignment
- **WHEN** three events arrive for session "abc"
- **THEN** they SHALL be assigned seq 0, 1, 2 respectively

#### Scenario: Independent sequences per session
- **WHEN** events arrive for sessions "abc" and "def"
- **THEN** each session SHALL maintain its own independent sequence counter

### Requirement: Event replay for reconnection
The server SHALL support replaying events from a given sequence number for browser catch-up after reconnection.

#### Scenario: Full replay
- **WHEN** a browser subscribes with `lastSeq: -1` (or omitted)
- **THEN** the server SHALL replay ALL events for that session from seq 0

#### Scenario: Partial replay
- **WHEN** a browser subscribes with `lastSeq: 100`
- **THEN** the server SHALL replay only events with seq > 100

#### Scenario: Large replay batching
- **WHEN** a replay involves more than 200 events
- **THEN** the server SHALL send them in batches of 200 via `event_replay` messages to avoid blocking the WebSocket

### Requirement: Content split for lazy loading
The event store SHALL support fetching the full payload of a specific event by sessionId and sequence number. This enables the chat view to lazy-load tool call content.

#### Scenario: Fetch event content
- **WHEN** a browser requests `GET /api/events/:sessionId/:seq`
- **THEN** the server SHALL return the full event payload from SQLite

#### Scenario: Fetch non-existent event
- **WHEN** a browser requests an event that doesn't exist
- **THEN** the server SHALL return a 404 error

### Requirement: 30-day retention policy
The event store SHALL automatically delete events older than 30 days (configurable via `retentionDays`). Cleanup SHALL run once per day (on server start and every 24 hours thereafter).

Session records with status `ended` whose last event is older than the retention period SHALL also be deleted.

#### Scenario: Daily cleanup
- **WHEN** the cleanup job runs
- **THEN** it SHALL delete all events with `createdAt` older than 30 days and ended sessions with no remaining events

#### Scenario: Custom retention period
- **WHEN** the server is configured with `retentionDays: 7`
- **THEN** the cleanup SHALL delete events older than 7 days

#### Scenario: Active session events not deleted
- **WHEN** an active session has events older than 30 days (long-running session)
- **THEN** those events SHALL still be deleted (retention is absolute, not session-relative) but the session record SHALL be preserved

### Requirement: Session persistence
Session metadata (workspace assignment, status, stats, model info, session file, session dir, hidden flag) SHALL be persisted in SQLite across server restarts.

The sessions table SHALL include the following columns added via ALTER migrations:
- `session_file TEXT` — path to the pi session JSONL file
- `session_dir TEXT` — path to the pi session directory
- `hidden INTEGER DEFAULT 0` — whether the session is hidden from the sidebar (0 = visible, 1 = hidden)
- `first_message TEXT` — text of the first user message, used as fallback display name

#### Scenario: Server restart preserves sessions
- **WHEN** the server restarts
- **THEN** it SHALL load all session records from SQLite including `session_file`, `session_dir`, and `hidden` fields

#### Scenario: Active sessions after restart
- **WHEN** the server restarts and pi sessions reconnect
- **THEN** their session records SHALL be updated (not duplicated) based on pi session ID matching, with `hidden` set to `false` and `status` set to `active`

#### Scenario: Stale sessions marked hidden on restart
- **WHEN** the server restarts and finds sessions with status `active` or `streaming` in SQLite
- **THEN** it SHALL mark them as `status = "ended"` and `hidden = true` (they are stale, not actually connected)

#### Scenario: Session file persisted on register
- **WHEN** a bridge extension sends `session_register` with `sessionFile` and `sessionDir`
- **THEN** the server SHALL persist these in the session record

#### Scenario: Hidden flag persisted on unregister
- **WHEN** a session is unregistered
- **THEN** the server SHALL set `hidden = true` in SQLite

### Requirement: Workspace persistence
Workspace records SHALL be persisted in SQLite across server restarts.

#### Scenario: Workspaces survive restart
- **WHEN** the server restarts
- **THEN** all workspace records SHALL be loaded from SQLite and displayed in the workspace bar

### Requirement: OpenSpec data persistence
The server SHALL persist OpenSpec data as a JSON string in the `openspec_data` column of the `sessions` table. When an `openspec_update` message arrives from a bridge extension, the server SHALL store `JSON.stringify(data)` via `sessionManager.update()` in addition to forwarding it to subscribed browsers.

#### Scenario: OpenSpec data stored on update
- **WHEN** the server receives an `openspec_update` from a bridge extension
- **THEN** it SHALL persist the data as a JSON string in the session's `openspec_data` column and forward it to subscribed browsers

#### Scenario: OpenSpec data hydrated on subscribe
- **WHEN** a browser subscribes to a session that has stored `openspecData`
- **THEN** the server SHALL immediately send an `openspec_update` message to the browser with the parsed stored data

#### Scenario: OpenSpec data missing for active session on subscribe
- **WHEN** a browser subscribes to an active session that has no stored `openspecData`
- **THEN** the server SHALL send an `openspec_refresh` to the bridge extension to force a poll, which will result in an `openspec_update` being stored and forwarded

#### Scenario: OpenSpec data missing for ended session on subscribe
- **WHEN** a browser subscribes to an ended session that has no stored `openspecData`
- **THEN** the server SHALL NOT attempt to refresh (the extension is offline) and no `openspec_update` is sent

#### Scenario: OpenSpec data survives server restart
- **WHEN** the server restarts
- **THEN** previously stored OpenSpec data SHALL be hydrated from SQLite and available for browser subscribers without requiring a fresh poll from the extension

### Requirement: Database migrations
The database schema SHALL use versioned migrations. Each migration SHALL be idempotent. The server SHALL check the current schema version on startup and apply any pending migrations.

The following ALTER migrations SHALL be added:
- `ALTER TABLE sessions ADD COLUMN session_file TEXT`
- `ALTER TABLE sessions ADD COLUMN session_dir TEXT`
- `ALTER TABLE sessions ADD COLUMN hidden INTEGER DEFAULT 0`
- `ALTER TABLE sessions ADD COLUMN first_message TEXT`

#### Scenario: Migration on upgrade
- **WHEN** the server starts with a database from an older version
- **THEN** it SHALL apply pending migrations to update the schema without data loss

#### Scenario: Existing sessions default to not hidden
- **WHEN** the `hidden` column is added to an existing database
- **THEN** all existing sessions SHALL default to `hidden = 0` (visible)


