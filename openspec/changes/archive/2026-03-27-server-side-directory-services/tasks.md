## 1. Move shared functions to `src/shared/`

- [x] 1.1 Move `pollOpenSpec()` from `src/extension/openspec-poller.ts` to `src/shared/openspec-poller.ts` (pure function, no bridge deps)
- [x] 1.2 Move `replayEntriesAsEvents()` from `src/extension/state-replay.ts` to `src/shared/state-replay.ts` (pure function, no bridge deps)
- [x] 1.3 Update bridge imports to use new shared paths, verify bridge still works

## 2. Create `DirectoryService` on server

- [x] 2.1 Create `src/server/directory-service.ts` with interface: `knownDirectories()`, `discoverSessions(cwd)`, `loadSessionEvents(sessionId, sessionFile)`, `getOpenSpecData(cwd)`, `refreshOpenSpec(cwd)`, `startPolling()`, `stopPolling()`, `onDirectoryAdded(cwd)`
- [x] 2.2 Implement known directories computation: union of pinned dirs from `StateStore` and cwds from `SessionManager.listAll()`
- [x] 2.3 Implement `discoverSessions(cwd)`: call `SessionManager.list(cwd)` from `@mariozechner/pi-coding-agent`, return session metadata, with try/catch + graceful fallback
- [x] 2.4 Implement `loadSessionEvents(sessionId, sessionFile)`: call `SessionManager.open(file).getBranch()`, convert via `replayEntriesAsEvents()`, with try/catch for missing/corrupt files
- [x] 2.5 Implement OpenSpec polling loop: poll each known directory every 30s, cache results per cwd, emit change callback when data differs
- [x] 2.6 Implement `onDirectoryAdded(cwd)`: discover sessions + poll openspec immediately for newly added directory
- [x] 2.7 Write tests for `DirectoryService` (mock `SessionManager` import, mock `spawnSync` for openspec CLI)

## 3. Integrate `DirectoryService` into server

- [x] 3.1 Instantiate `DirectoryService` in `createServer()`, pass `stateStore` and `sessionManager`
- [x] 3.2 Call `discoverSessions()` for all known directories on server startup (async, after HTTP listening)
- [x] 3.3 Insert discovered historical sessions into `sessionManager` with `status: "ended"`, `hidden: true`, broadcast `session_added` to browsers
- [x] 3.4 Hook `DirectoryService.onDirectoryAdded()` into pinned directory add flow and session register flow (when cwd is new)
- [x] 3.5 Start OpenSpec polling on server startup, broadcast `openspec_update { cwd, data }` to browsers on change

## 4. Update browser gateway for per-directory OpenSpec

- [x] 4.1 Change `openspec_update` in `browser-protocol.ts` from `sessionId`-keyed to `cwd`-keyed
- [x] 4.2 Send cached OpenSpec data for all known directories on browser WebSocket connect
- [x] 4.3 Handle `openspec_refresh { cwd }` from browser: call `DirectoryService.refreshOpenSpec(cwd)` and broadcast result
- [x] 4.4 Remove `openspec_update` forwarding from extension message handler in `server.ts`
- [x] 4.5 Remove `openspec_refresh` forwarding to bridge in `browser-gateway.ts`

## 5. Replace bridge-mediated session loading with direct reads

- [x] 5.1 In `browser-gateway.ts` subscribe handler, replace bridge `load_session_events` routing with direct `DirectoryService.loadSessionEvents()` call
- [x] 5.2 Add simple dedup (Set of in-progress sessionIds) to prevent concurrent loads of the same session
- [x] 5.3 Remove `pending-load-manager.ts` and all references
- [x] 5.4 Remove `load_session_events`, `load_session_events_result`, `load_session_events_error` from `protocol.ts`

## 6. Remove openspec/history responsibilities from bridge

- [x] 6.1 Delete `src/extension/openspec-poller.ts` (now in shared, and bridge no longer calls it)
- [x] 6.2 Delete `src/extension/session-history.ts`
- [x] 6.3 Remove `load_session_events` handling from `src/extension/command-handler.ts`
- [x] 6.4 Remove openspec polling timer, `sendOpenSpecIfChanged()`, `sendOpenSpecNow()` from `bridge.ts`
- [x] 6.5 Remove `openspec_refresh` message handling from bridge
- [x] 6.6 Remove `OpenSpecUpdateMessage`, `OpenSpecRefreshMessage`, `SessionHistorySyncMessage` from `protocol.ts` (extension→server direction)
- [x] 6.7 Remove `session_history_sync` handler from `server.ts`
- [x] 6.8 Update bridge tests and command-handler tests to remove deleted functionality

## 7. Update client to consume per-directory OpenSpec data

- [x] 7.1 Update `App.tsx` WebSocket handler: store OpenSpec data in `Map<cwd, OpenSpecData>` instead of `Map<sessionId, OpenSpecData>`
- [x] 7.2 Update `openspec_refresh` message sent from browser: include `cwd` instead of `sessionId`
- [x] 7.3 Pass per-directory OpenSpec data to components (currently `openspecMap` uses sessionId keys — change to cwd keys)
- [x] 7.4 Remove `openspecData` field from `DashboardSession` type (no longer per-session)

## 8. Clean up and verify

- [x] 8.1 Remove `openspecData` field from session persistence (no longer stored per-session)
- [x] 8.2 Run full test suite, fix any broken tests
- [ ] 8.3 Manual smoke test: pinned directory with no sessions shows OpenSpec data and historical sessions
- [ ] 8.4 Manual smoke test: directory with active sessions shows same OpenSpec data as before
- [x] 8.5 Update `docs/architecture.md`, `AGENTS.md`, and `README.md` with new data flow
