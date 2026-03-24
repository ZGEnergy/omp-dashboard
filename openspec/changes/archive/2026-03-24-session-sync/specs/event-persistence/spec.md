## MODIFIED Requirements

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
