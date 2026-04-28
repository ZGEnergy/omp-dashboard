# Tasks

## 1. Spec deltas

- [x] 1.1 Add `meta-json-session-cache` delta: contextWindow preservation rule.
- [x] 1.2 Add `on-demand-session-replay` delta: caller-supplied `knownContextWindow` rule.

## 2. Tests (TDD — red first)

- [x] 2.1 `session-scanner.test.ts`: persisted `contextWindow=1_000_000` survives a stale-cache re-extract when stats reports the same model.
- [x] 2.2 `session-scanner.test.ts`: stats-supplied `contextWindow` wins when `stats.model !== meta.model`.
- [x] 2.3 `state-replay.test.ts`: `replayEntriesAsEvents(..., entries, 1_000_000)` produces `stats_update.contextUsage.contextWindow === 1_000_000`.
- [x] 2.4 `state-replay.test.ts`: omitting the override falls back to `inferContextWindow(currentModel)` (legacy 200k for Claude).
- [x] 2.5 `subscription-handler.test.ts`: end-to-end wiring — `handleSubscribe` on a restored ended session with persisted `contextWindow` calls `directoryService.loadSessionEvents(sid, file, contextWindow)` with all three args.

## 3. Implementation

- [x] 3.1 `session-scanner.ts`: in the stale-cache merge, preserve `meta.contextWindow` when `effectiveModel === meta.model`; otherwise adopt `stats.contextWindow`.
- [x] 3.2 `state-replay.ts`: add optional `knownContextWindow?: number` parameter; thread it into the `stats_update.contextUsage.contextWindow` field, falling back to `inferContextWindow(currentModel)` when undefined.
- [x] 3.3 `directory-service.ts`: extend `loadSessionEvents` signature with `knownContextWindow?: number`; forward into `replayEntriesAsEvents`.
- [x] 3.4 `subscription-handler.ts`: pass `session.contextWindow` into `loadSessionEvents`.

## 4. Verification

- [x] 4.1 `npm test` — all targeted tests green; no new regressions vs. `develop` baseline.
- [x] 4.2 `openspec validate fix-context-window-reload --strict`.
