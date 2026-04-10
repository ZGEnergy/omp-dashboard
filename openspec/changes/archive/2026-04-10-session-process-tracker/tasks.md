## 1. Process Scanner Module

- [x] 1.1 Create `src/extension/process-scanner.ts` with `parseEtime()` helper that converts ps ETIME format (`mm:ss`, `hh:mm:ss`, `dd-hh:mm:ss`) to milliseconds. Write tests first.
- [x] 1.2 Implement `scanChildProcesses(parentPid, minElapsedMs?)` using `pgrep -P` + one-level grandchild recursion + `ps`. Returns `ChildProcessInfo[]`. Platform guard returns `[]` on Windows. Write tests with mocked spawnSync.
- [x] 1.3 Implement `killProcessByPgid(pgid)` using `process.kill(-pgid, SIGTERM)` with ESRCH handling. Returns boolean. Platform guard returns `false` on Windows. Write tests.

## 2. Protocol Types

- [x] 2.1 Add `ProcessInfo` type to `src/shared/protocol.ts`: `{ pid: number, pgid: number, command: string, elapsedMs: number }`
- [x] 2.2 Add `ProcessListMessage` to `ExtensionToServerMessage` union in `src/shared/protocol.ts`
- [x] 2.3 Add `KillProcessMessage` to `ServerToExtensionMessage` union in `src/shared/protocol.ts`
- [x] 2.4 Add `ProcessListUpdateMessage` to `ServerToBrowserMessage` union in `src/shared/browser-protocol.ts`
- [x] 2.5 Add `KillProcessRequestMessage` to `BrowserToServerMessage` union in `src/shared/browser-protocol.ts`

## 3. Bridge Integration

- [x] 3.1 Wire process scan timer (10s interval) in `src/extension/bridge.ts` alongside heartbeat/git timers. Track previous PID set, only send `process_list` on change.
- [x] 3.2 Add `kill_process` case to command handler in `src/extension/command-handler.ts` that calls `killProcessByPgid`.

## 4. Server Forwarding

- [x] 4.1 Forward `process_list` events from pi-gateway to subscribed browsers as `process_list_update` in `src/server/event-wiring.ts`
- [x] 4.2 Forward `kill_process` requests from browser-gateway to the target session's extension connection

## 5. Client UI

- [x] 5.1 Add `processes` field to DashboardSession in types.ts, handle `process_list_update` in useMessageHandler field to session state in `src/client/lib/event-reducer.ts`, handle `process_list_update` messages
- [x] 5.2 Create `src/client/components/ProcessList.tsx` — compact list with truncated command, elapsed badge, red ✕ kill button
- [x] 5.3 Render `ProcessList` in session card when processes array is non-empty
- [x] 5.4 Wire kill button to send `kill_process` WebSocket message with sessionId and pgid
