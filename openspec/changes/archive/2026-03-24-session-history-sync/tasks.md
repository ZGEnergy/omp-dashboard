## 1. Protocol

- [x] 1.1 Add `SessionHistorySyncMessage` type to `src/shared/protocol.ts` with fields: `type: "session_history_sync"`, `sessions: Array<{ id, cwd, name?, startedAt, firstMessage?, sessionFile?, sessionDir? }>`
- [x] 1.2 Add `SessionHistorySyncMessage` to the `ExtensionToServerMessage` union type

## 2. Server Handling

- [x] 2.1 Handle `session_history_sync` in `src/server/pi-gateway.ts`: for each session, check if ID exists in session manager, skip if so, otherwise register as `ended` + `hidden=true` with source `"tui"`
- [x] 2.2 Broadcast `session_added` to browser clients for each newly inserted historical session

## 3. Bridge Extension

- [x] 3.1 Import `SessionManager` from `@mariozechner/pi-coding-agent` in `src/extension/bridge.ts`
- [x] 3.2 Add async `sendSessionHistory()` function that calls `SessionManager.list(process.cwd())`, maps results to the protocol format, and sends `session_history_sync` (with try/catch for silent error handling)
- [x] 3.3 Call `sendSessionHistory()` after `sendStateSync()` in the connection `onOpen` handler (both initial connect and reconnect)

## 4. Tests

- [x] 4.1 Add protocol type test verifying `session_history_sync` is a valid `ExtensionToServerMessage`
- [x] 4.2 Add server test: receiving `session_history_sync` with unknown session IDs inserts them as `ended` + `hidden=true`
- [x] 4.3 Add server test: receiving `session_history_sync` with already-known session IDs skips them
- [x] 4.4 Add bridge test: `sendSessionHistory()` sends correct message format
- [x] 4.5 Add bridge test: `sendSessionHistory()` silently handles errors from `SessionManager.list()`
