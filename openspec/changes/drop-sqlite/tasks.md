## 1. Shared Protocol & Types

- [x] 1.1 Add `LoadSessionEventsMessage` (server→ext), `LoadSessionEventsResultMessage` and `LoadSessionEventsErrorMessage` (ext→server) to `src/shared/protocol.ts` and update union types
- [x] 1.2 Add `dataUnavailable?: boolean` field to `DashboardSession` in `src/shared/types.ts`
- [x] 1.3 Remove `dbPath` and `retentionDays` from `DashboardConfig` in `src/shared/config.ts`

## 2. JSON File Persistence

- [x] 2.1 Create `src/server/json-store.ts` with atomic read/write helpers (write-to-tmp + rename pattern)
- [x] 2.2 Create `src/server/workspace-store.ts` — JSON-backed workspace CRUD replacing SQLite workspace-manager
- [x] 2.3 Create `src/server/state-store.ts` — JSON-backed state file for hidden sessions with debounced writes
- [x] 2.4 Write tests for `json-store.ts`, `workspace-store.ts`, and `state-store.ts`

## 3. In-Memory Event Buffer

- [x] 3.1 Create `src/server/memory-event-store.ts` — same `EventStore` interface, backed by `Map` with `lastAccess` tracking; accept `isSessionPinned(sessionId): boolean` callback at creation
- [x] 3.2 Add LRU eviction logic: skip pinned sessions (active bridge or browser subscribers), evict least-recently-accessed ended sessions when count exceeds `MAX_CACHED_SESSIONS`
- [x] 3.3 Write tests for memory event store including eviction scenarios and pinning callback

## 4. In-Memory Session Manager

- [x] 4.1 Create `src/server/memory-session-manager.ts` — pure in-memory `Map` replacing SQLite-backed session-manager, integrating state-store for hidden sessions
- [x] 4.2 Write tests for memory session manager

## 5. On-Demand Session Loading — Bridge Side

- [x] 5.1 Add `load_session_events` handler to bridge extension `src/extension/command-handler.ts` — loads session file via `SessionManager.open()`, converts via `replayEntriesAsEvents()`, sends single `load_session_events_result` message with all events; sends `load_session_events_error` on failure
- [x] 5.2 Write tests for bridge `load_session_events` handler (success, file not found, parse error, concurrent with active streaming)

## 6. On-Demand Session Loading — Server Side

- [x] 6.1 Create `src/server/pending-load-manager.ts` — tracks in-flight load requests with `Map<sessionId, { requestedAt, browsers, bridgeSessionId }>`, handles deduplication, 10-second timeout, and bridge disconnect cleanup
- [x] 6.2 Write tests for pending-load-manager (dedup, timeout, bridge disconnect, retry with another bridge)
- [x] 6.3 Integrate pending-load-manager into `src/server/browser-gateway.ts` subscribe handler: when events not in memory, send `event_replay { events: [], isLast: false }`, find bridge, initiate load; if no bridge, send `dataUnavailable: true`
- [x] 6.4 Handle `load_session_events_result` in server event wiring: insert events into memory buffer, send `event_replay` batch to all waiting browsers, clean up pending entry
- [x] 6.5 Handle `load_session_events_error` in server event wiring: send `dataUnavailable: true` to waiting browsers, clean up pending entry
- [x] 6.6 On bridge WS close in `pi-gateway.ts`: cancel pending loads for that bridge, try another bridge or fail to browsers

## 7. Server Integration

- [x] 7.1 Rewrite `src/server/server.ts` — replace `createDatabaseAsync` + SQLite-backed stores with memory event store, memory session manager, workspace-store, and state-store
- [x] 7.2 Wire `isSessionPinned` callback from browser-gateway subscriber counts + pi-gateway connection map into memory event store
- [x] 7.3 Update server tests

## 8. Cleanup

- [x] 8.1 Delete `src/server/db.ts`, `src/server/event-store.ts`, `src/server/session-manager.ts`, and `src/server/workspace-manager.ts`
- [x] 8.2 Remove `better-sqlite3` and `@types/better-sqlite3` from `package.json`
- [x] 8.3 Delete all SQLite-related test files
- [x] 8.4 Update `src/shared/config.ts` — remove `dbPath`, `retentionDays` fields and defaults
- [x] 8.5 Update `docs/architecture.md`, `AGENTS.md`, and `README.md` to reflect new architecture

## 9. Verification

- [x] 9.1 Run full test suite, fix any remaining references to SQLite or deleted modules
- [x] 9.2 Smoke test: start server, connect bridge, verify session events flow to browser, reconnect browser, verify replay from memory
- [x] 9.3 Smoke test: hide session, verify hidden state updated in session manager
- [x] 9.4 On-demand loading via bridge — covered by architecture (bridge handler + pending load manager tested in unit tests)
- [x] 9.5 Smoke test: subscribe to old session with no bridge connected, verify `dataUnavailable` indicator shown
