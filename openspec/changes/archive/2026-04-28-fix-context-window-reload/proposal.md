## Why

A session's context window flips from `1M` (the value reported live by the LLM, e.g. Sonnet 1M beta) back to `200k` whenever the dashboard reloads or a browser opens an ended session for replay. The persisted value is correct in `.meta.json`; two paths overwrite it with a hardcoded heuristic:

1. **`session-scanner.ts` stale-cache merge** — when the `.jsonl` mtime is newer than `meta.cachedAt`, the scanner re-extracts stats and **unconditionally overwrites** `meta.contextWindow` with `stats.contextWindow`. `stats.contextWindow` is always `inferContextWindow(model)` — a hardcoded heuristic that pins any Claude model to `200_000` and ignores 1M variants.
2. **`state-replay.ts`** — when the server replays an ended session from disk for a subscribing browser, every synthesized `stats_update` carries `contextUsage.contextWindow = inferContextWindow(currentModel)` → `200_000` for Claude. The browser therefore sees `200k` until the next live `turn_end` arrives.

Pi's persisted JSONL contains only `message`/`model_change`/`thinking_level_change`/`session`/`custom_message` entries — **no `turn_end` and no `contextUsage`**. The 1M value reaches the dashboard only via live `turn_end` events emitted by the bridge at runtime; once that value is in `.meta.json`, it must not be clobbered by inference.

## What Changes

- **`meta-json-session-cache`**: codify the rule that the persisted `contextWindow` is authoritative over any value derived from `.jsonl` parsing or model-id inference. The stale-cache merge SHALL preserve `meta.contextWindow` as long as the model is unchanged, and SHALL only fall back to the inferred value when the model changes or no value was previously persisted.
- **`on-demand-session-replay`**: add an optional caller-supplied `knownContextWindow` to `replayEntriesAsEvents(...)` and require the server's `loadSessionEvents` path to forward `session.contextWindow` into replay so synthesized `stats_update` events carry the persisted value. The legacy `inferContextWindow(currentModel)` heuristic remains as a fallback for callers (notably the bridge's session-sync path) that do not yet have a persisted value.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `meta-json-session-cache`: add a requirement asserting that `meta.contextWindow` is preserved across stale-cache re-extracts when the model is unchanged, and overridden only when the model has changed or no value was previously persisted.
- `on-demand-session-replay`: add a requirement asserting that synthesized `stats_update` events use a caller-supplied `knownContextWindow` when provided, falling back to model-id inference otherwise.

## Impact

- **Code**:
  - `packages/server/src/session-scanner.ts` — stale-cache merge preserves `meta.contextWindow` when `effectiveModel === meta.model`.
  - `packages/shared/src/state-replay.ts` — `replayEntriesAsEvents` gets an optional 3rd arg `knownContextWindow?: number`.
  - `packages/server/src/directory-service.ts` — `loadSessionEvents` accepts and forwards `knownContextWindow`.
  - `packages/server/src/browser-handlers/subscription-handler.ts` — passes `session.contextWindow` into `loadSessionEvents`.
- **Tests**:
  - `packages/server/src/__tests__/session-scanner.test.ts` — two new regression tests (preserve-when-unchanged, adopt-when-model-changes).
  - `packages/client/src/__tests__/state-replay.test.ts` — two new regression tests (use-knownContextWindow, fall-back-when-undefined).
- **Compatibility**: zero schema change. `replayEntriesAsEvents`'s new arg is optional, so the bridge's `session-sync.ts` caller is unaffected. `.meta.json` files written by older versions still load — the rule is purely about whether the existing value is preserved on re-extract. Rollback = revert the diffs; no migration required.
- **Out of scope**:
  - Fixing the inference heuristic itself to recognise 1M Sonnet variants (would still be brittle vs. real `turn_end` data).
  - Plumbing `knownContextWindow` into the bridge's `session-sync.ts` replay (extension package; live `turn_end` overwrites the seeded value within one turn, so the user-visible flicker is negligible).
