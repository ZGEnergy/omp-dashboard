## 1. Expand SessionMeta Schema

- [x] 1.1 Expand `SessionMeta` interface in `src/shared/session-meta.ts` with all dashboard-owned fields (name, attachedProposal, hidden, cwd, status, startedAt, endedAt, model, thinkingLevel, tokensIn, tokensOut, cacheRead, cacheWrite, cost, contextTokens, contextWindow, firstMessage) — all optional
- [x] 1.2 Update `readSessionMeta` and `writeSessionMeta` to handle the expanded schema (merge on write, preserve unknown fields)
- [x] 1.3 Add tests for expanded read/write/merge behavior

## 2. Per-Session Meta Persistence

- [x] 2.1 Create `src/server/meta-persistence.ts` — per-session debounced writer that writes individual `.meta.json` files using atomic writes (reuse `json-store.ts` pattern), with `saveMeta(sessionFile, meta)`, `flushAll()`, and `dispose()` methods
- [x] 2.2 Add tests for debounced per-session writes, flush, and atomic write behavior

## 3. Preferences Store

- [x] 3.1 Create `src/server/preferences-store.ts` — stores `pinnedDirectories` and `sessionOrder` in `~/.pi/dashboard/preferences.json` with debounced atomic writes. Same API surface as current `StateStore` minus `hiddenSessions`/`isHidden`/`setHidden`/`getHiddenSessions`
- [x] 3.2 Add tests for preferences read/write/debounce

## 4. Session Scanner

- [x] 4.1 Create `src/server/session-scanner.ts` — scans `~/.pi/agent/sessions/*/` at startup, pairs `.meta.json` with `.jsonl` files, returns `DashboardSession[]` from cached meta. Falls back to `.jsonl` header + `extractSessionStats()` + `firstMessage` extraction for sessions without `.meta.json`, then writes `.meta.json` for next time
- [x] 4.2 For sessions restored from `.meta.json` cache, compare `.jsonl` mtime against a `cachedAt` timestamp in `.meta.json`. If `.jsonl` is newer (session changed while dashboard was down), re-extract stats from `.jsonl` and update `.meta.json`
- [x] 4.3 Add tests for scan (cached meta, missing meta fallback, orphaned meta ignored, session ID extracted from filename, stale cache re-extraction)

## 5. Migration Utility

- [x] 5.1 Create `src/server/migrate-persistence.ts` — reads `sessions.json` + `state.json`, writes enriched `.meta.json` per session, writes `preferences.json`, renames old files to `.bak`. Handles: merge with existing `.meta.json`, hidden ID matching by UUID scan, idempotent re-runs
- [x] 5.2 Add tests for migration (full migration, partial files, idempotent re-run, orphaned hidden IDs skipped, merge with existing meta)

## 6. Server Integration

- [x] 6.1 Change `SessionManager.onChange` signature from `() => void` to `(sessionId: string) => void`. Update `register()`, `unregister()`, and `update()` to pass the affected session ID. Wire to per-session meta persistence (write only the changed session's `.meta.json`)
- [x] 6.2 Replace `state-store.ts` usage in `server.ts`, `memory-session-manager.ts`, and `browser-gateway.ts` — swap with `preferences-store.ts`. Move `hidden` tracking to session object + `.meta.json` (remove `stateStore.isHidden`/`setHidden` delegation). Update `browser-gateway.ts` pin/unpin/reorder calls to use `PreferencesStore`
- [x] 6.3 Replace startup session restoration — swap `sessionPersistence.load()` with `sessionScanner.scan()`. Run migration first if old files detected. Make `restore()` trigger `onChange` so discovered/restored sessions get their `.meta.json` written (enabling stat cache updates for sessions that changed while dashboard was down)
- [x] 6.4 Update `createMemorySessionManager` — remove `StateStore` dependency for hidden state. Hidden is just a field on `DashboardSession` persisted via meta
- [x] 6.5 Update `createDirectoryService` — replace `StateStore` param with `PreferencesStore` for pinned directories
- [x] 6.6 Update `createSessionOrderManager` — replace `StateStore` param with `PreferencesStore`
- [x] 6.7 Wire shutdown: flush all per-session meta writers + preferences store on server close

## 7. Cleanup

- [x] 7.1 Remove `src/server/session-persistence.ts` and its tests
- [x] 7.2 Remove `src/server/state-store.ts` and its tests
- [x] 7.3 Update existing tests that depend on `StateStore` or `SessionPersistence` interfaces
- [x] 7.4 Run full test suite, fix any breakage
- [x] 7.5 Update AGENTS.md key files table (remove session-persistence.ts, state-store.ts; add meta-persistence.ts, preferences-store.ts, session-scanner.ts, migrate-persistence.ts)
- [x] 7.6 Update docs/architecture.md persistence section
