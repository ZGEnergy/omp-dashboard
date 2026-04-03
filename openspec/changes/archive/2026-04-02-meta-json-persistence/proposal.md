## Why

The dashboard persists session state across three separate files (`sessions.json`, `state.json`, and per-session `.meta.json`), leading to architectural fragmentation: `hidden` is duplicated between `state.json` and `sessions.json`, `hiddenSessions` in `state.json` grows unboundedly (currently 220 orphaned IDs, never garbage-collected), and every session change triggers a full rewrite of all sessions into one monolithic file. Consolidating per-session data into the existing `.meta.json` sidecar pattern and splitting out global preferences simplifies the persistence model, eliminates stale data accumulation, and reduces write amplification.

## What Changes

- **Enrich `.meta.json` sidecar** with all dashboard-owned per-session state: `name`, `attachedProposal`, `hidden`, `source`, plus cached stats (`model`, `cost`, `tokens*`, `status`, `startedAt`, `endedAt`, `contextTokens`, `contextWindow`, `firstMessage`, `cwd`). Each `.meta.json` is written independently with debounced atomic writes.
- **BREAKING: Remove `sessions.json`**. Session discovery at startup scans `~/.pi/agent/sessions/*/` directories, reading `.meta.json` files for cached data. Falls back to `.jsonl` header + `extractSessionStats()` for sessions without a `.meta.json`, then writes one for next time.
- **BREAKING: Remove `state.json`**. Split its contents:
  - `hiddenSessions` → moved to per-session `.meta.json` (`hidden` field). No more unbounded ID list.
  - `sessionOrder` and `pinnedDirectories` → moved to new `~/.pi/dashboard/preferences.json`.
- **Add `preferences.json`** for global UI state that is not session-scoped: `pinnedDirectories` and `sessionOrder`.
- **Add migration utility** (`migrate-persistence.ts`) that reads existing `sessions.json` + `state.json`, writes enriched `.meta.json` for each session, creates `preferences.json`, and renames old files to `.bak`.

## Capabilities

### New Capabilities
- `meta-json-session-cache`: Per-session `.meta.json` sidecar stores all dashboard-owned state and cached stats, with independent debounced atomic writes per session.
- `persistence-migration`: One-time migration utility converts `sessions.json` + `state.json` to enriched `.meta.json` files + `preferences.json`, preserving all current state.
- `global-preferences`: Global UI preferences (`pinnedDirectories`, `sessionOrder`) stored in `~/.pi/dashboard/preferences.json`.

### Modified Capabilities
- `session-persistence`: Sessions are no longer persisted to a monolithic `sessions.json`. Startup discovers sessions by scanning `~/.pi/agent/sessions/*/` and reading `.meta.json` sidecars.
- `json-file-persistence`: `state.json` is eliminated. Hidden state moves to `.meta.json`, global preferences to `preferences.json`.

## Impact

- **Server** (`src/server/`): `session-persistence.ts` rewritten to write per-session `.meta.json` instead of monolithic file. `state-store.ts` replaced by `preferences-store.ts` (no more `hiddenSessions`). `server.ts` startup flow changes from "read manifest" to "scan directories". `memory-session-manager.ts` no longer delegates hidden state to `StateStore`.
- **Shared** (`src/shared/`): `session-meta.ts` schema expanded with stats and dashboard fields. Read/write helpers updated.
- **Extension** (`src/extension/`): `source-detector.ts` reads from expanded `.meta.json` — no change needed (already reads `source` field).
- **Client**: No changes — the client receives session data via WebSocket, unaware of server-side persistence.
- **Files eliminated**: `~/.pi/dashboard/sessions.json`, `~/.pi/dashboard/state.json`
- **Files added**: `~/.pi/dashboard/preferences.json`
- **Backward compatibility**: Migration utility runs automatically on first startup when old files are detected. Old files renamed to `.bak`.
