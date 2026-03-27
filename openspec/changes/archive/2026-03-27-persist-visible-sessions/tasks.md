## 1. Session Persistence Module

- [x] 1.1 Create `src/server/session-persistence.ts` with `SessionPersistence` interface: `load()`, `save(sessions)`, `flush()`, `dispose()`
- [x] 1.2 Write tests for session-persistence: load from empty/missing file, save non-hidden sessions, exclude hidden sessions, debounced writes, flush on demand

## 2. Integration with Server

- [x] 2.1 In `server.ts`, load persisted sessions on startup and register them in session manager with `dataUnavailable: true`
- [x] 2.2 Hook session manager changes (register, unregister, update) to trigger persistence saves
- [x] 2.3 Call `flush()` and `dispose()` on server shutdown

## 3. Verification

- [x] 3.1 Integration test: sessions survive simulated restart (save → create new manager → load → verify sessions present with `dataUnavailable: true`)
- [x] 3.2 Integration test: hidden sessions are excluded from persistence
- [x] 3.3 Verify existing tests still pass
