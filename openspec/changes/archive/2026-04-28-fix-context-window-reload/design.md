# Design

## Problem

A session's context window flips back from `1M` to `200k` whenever the dashboard reloads or a browser opens an ended session for replay. The persisted value in `.meta.json` is correct; two server-side paths overwrite it with a hardcoded heuristic.

## Constraints

- **Pi's persisted JSONL has no `turn_end` / `contextUsage` entries.** Only `message`, `model_change`, `thinking_level_change`, `session`, and `custom_message`. Verified against a live session file.
- **The 1M value reaches the dashboard only via live `turn_end` events** emitted by the bridge at runtime. Once written to `.meta.json`, that value is the **only** reliable source of truth.
- **`inferContextWindow(modelId)` is necessarily lossy** — it pins any Claude model to `200_000` and has no way to detect 1M variants from the id alone. Treat it as a last-resort fallback, not a refresh source.
- **Backwards compatibility**: existing `.meta.json` files (some with no `contextWindow` field) must still load. The bridge's `session-sync.ts` replay path must keep working without the new override.

## Decision

**Persisted value beats inference.** Two surgical changes, both with a model-equality guard so the persisted value is only trusted while it still applies:

### Decision 1: Stale-cache merge preserves `meta.contextWindow` when model unchanged

`session-scanner.ts`'s stale-cache branch previously did:

```ts
contextWindow: stats.contextWindow,  // always overwrites
```

After the fix:

```ts
const effectiveModel = stats.model ?? meta.model;
const preserveContextWindow =
  meta.contextWindow !== undefined && effectiveModel === meta.model;
contextWindow: preserveContextWindow ? meta.contextWindow : stats.contextWindow,
```

**Why the model-equality guard?** If the user switched models since the last cache write, the persisted value no longer applies — a Sonnet 1M → GPT-4o switch must adopt the new model's `128k` value, not retain `1_000_000`. The guard makes the rule semantically correct: "preserve when still applicable; otherwise re-infer."

### Decision 2: Replay accepts a caller-supplied `knownContextWindow` override

`replayEntriesAsEvents(sessionId, entries)` synthesizes `stats_update` events whose `contextUsage.contextWindow` was always `inferContextWindow(currentModel)`. Adding an optional 3rd arg:

```ts
replayEntriesAsEvents(sessionId, entries, knownContextWindow?)
```

Inside, the synthesis becomes `knownContextWindow ?? inferContextWindow(currentModel)`. The server's lazy-load path (`directoryService.loadSessionEvents` → `subscription-handler:160`) forwards `session.contextWindow` (which fix #1 keeps correct in `.meta.json`).

**Why optional, not required?** The bridge's `session-sync.ts:76` caller has no easy access to a persisted value at sync time. Live `turn_end` events arrive shortly after sync and overwrite the seeded value within one turn, so the bridge replay's flicker is negligible — not worth a wider refactor.

## Alternatives Considered

| Option | Verdict |
|---|---|
| **Fix `inferContextWindow` to recognise 1M variants** (e.g., parse `1m` suffix) | Rejected. Brittle vs. real `turn_end` data and adds a maintenance burden every time a model adds a long-context beta. The persisted value is already authoritative. |
| **Store contextWindow as a per-session override field separate from `meta.contextWindow`** | Rejected. Two fields where one suffices; reload merge logic gets harder, not simpler. |
| **Make `replayEntriesAsEvents` read `.meta.json` itself** | Rejected. Couples `packages/shared` (pure replay) to filesystem I/O. The caller-supplied override keeps replay pure. |
| **Persist `turn_end` into pi's JSONL** | Out of scope — pi-side change, not dashboard's call. |

## Migration & Rollback

- **Schema**: zero change. `.meta.json` already has an optional `contextWindow` field; existing files keep working.
- **API surface**: `replayEntriesAsEvents`'s new arg is optional → bridge code (and any external caller) keeps compiling and behaves exactly as before.
- **Rollback**: revert four files (`session-scanner.ts`, `state-replay.ts`, `directory-service.ts`, `subscription-handler.ts`) plus the test file. No data migration. No config flag. No protocol bump.

## Verified end-to-end behaviour after fix

1. **Live**: 1M reported by LLM → `event-wiring.ts:209` writes 1M → `metaPersistence.save` persists 1M to `.meta.json`. *(unchanged)*
2. **Server reload**: scanner reads `.meta.json` → if `mtime > cachedAt`, re-extracts stats → preserves persisted 1M when model unchanged. *(fix 1)*
3. **Browser opens ended session**: `subscription-handler` calls `directoryService.loadSessionEvents(sid, file, session.contextWindow)` → replay synthesizes `stats_update` events with `contextUsage.contextWindow: 1_000_000` → no flicker. *(fix 2)*
