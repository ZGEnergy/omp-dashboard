## MODIFIED Requirements

### Requirement: Extension-to-server WebSocket message types
The system SHALL define TypeScript types for all messages sent between the bridge extension and the dashboard server over WebSocket. Messages SHALL be JSON-serializable and include a `type` discriminator field.

The following message types SHALL be defined for extension → server:
- `session_register`: session metadata on connect (piSessionId, cwd, source, model, thinkingLevel, sessionName, entries for state sync)
- `session_unregister`: session disconnect
- `session_heartbeat`: periodic liveness signal
- `event_forward`: forwarded pi event (wraps any pi event type with sessionId)
- `commands_list`: available slash commands for autocomplete
- `extension_ui_event`: extension UI interaction (method, title, status, result)
- `stats_update`: accumulated token/cost stats, per-turn usage breakdown, and context window usage
- `files_list`: response to a file listing request (sessionId, query, files)
- `openspec_update`: openspec change data for the session's project (sessionId, data: OpenSpecData)
- `session_name_update`: session display name change (sessionId, name)
- `models_list`: available models for the session (sessionId, models: Array<{provider, id}>)
- `session_history_sync`: array of historical session metadata from pi's local session files (id, cwd, name, startedAt, firstMessage, sessionFile, sessionDir)

The `openspec_update` message SHALL include:
- `data.initialized`: boolean indicating whether openspec is initialized
- `data.changes`: array of `OpenSpecChange` objects with name, status, task counts, and artifact status

The `session_register` message SHALL include an optional `name` field for the initial session display name.

The `stats_update` message SHALL include:
- `stats.tokensIn`: accumulated input tokens (number)
- `stats.tokensOut`: accumulated output tokens (number)
- `stats.cost`: accumulated cost (number)
- `stats.turnUsage?`: per-turn breakdown `{ input, output, cacheRead, cacheWrite }` (optional, present when usage data is available on the turn)
- `stats.contextUsage?`: current context window state `{ tokens: number | null, contextWindow: number }` (optional, present when `ctx.getContextUsage()` returns data)

#### Scenario: Extension sends session history sync
- **WHEN** the bridge extension has local session history to sync
- **THEN** it SHALL send a `session_history_sync` message with `sessions` array, each containing `id` (string), `cwd` (string), `name` (string, optional), `startedAt` (number), `firstMessage` (string, optional), `sessionFile` (string, optional), `sessionDir` (string, optional)
