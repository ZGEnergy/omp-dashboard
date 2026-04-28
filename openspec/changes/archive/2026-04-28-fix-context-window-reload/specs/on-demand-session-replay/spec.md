## ADDED Requirements

### Requirement: Replay accepts a caller-supplied contextWindow override
The system SHALL allow callers of `replayEntriesAsEvents(sessionId, entries, knownContextWindow?)` to supply an optional `knownContextWindow` value. When provided, every synthesized `stats_update.contextUsage.contextWindow` field SHALL be set to that value; when omitted, the system SHALL fall back to `inferContextWindow(currentModel)`.

The server's on-demand replay path (`directoryService.loadSessionEvents`) SHALL forward `session.contextWindow` (loaded from `.meta.json`) as `knownContextWindow` so synthesized events surface the persisted value rather than the model-id heuristic.

Rationale: pi's `.jsonl` has no persisted `contextUsage`, so without the override every replayed `stats_update` for a Claude session reports `200_000` even when the live session ran on a 1M variant. This causes a visible flicker from `1M` → `200k` whenever a browser opens an ended session, until the next live `turn_end` arrives.

#### Scenario: Replay uses knownContextWindow when provided
- **GIVEN** an ended session with persisted `contextWindow: 1_000_000` in `.meta.json`
- **WHEN** the server's `loadSessionEvents` calls `replayEntriesAsEvents(sessionId, entries, 1_000_000)`
- **THEN** every emitted `stats_update.contextUsage.contextWindow` SHALL equal `1_000_000`

#### Scenario: Replay falls back to inference when override is undefined
- **GIVEN** a caller that does not supply `knownContextWindow`
- **WHEN** `replayEntriesAsEvents` synthesizes a `stats_update` for an assistant message with `usage.totalTokens > 0` after a `model_change` to `claude-sonnet-4-20250514`
- **THEN** the emitted `stats_update.contextUsage.contextWindow` SHALL equal `inferContextWindow("claude-sonnet-4-20250514")` (`200_000`)

#### Scenario: Server forwards persisted contextWindow through subscription replay
- **GIVEN** a browser subscribes to an ended session whose `Session.contextWindow` is `1_000_000`
- **WHEN** `subscription-handler` invokes `directoryService.loadSessionEvents(sessionId, sessionFile, session.contextWindow)`
- **THEN** every synthesized `stats_update` event delivered to the browser SHALL carry `contextUsage.contextWindow: 1_000_000`
