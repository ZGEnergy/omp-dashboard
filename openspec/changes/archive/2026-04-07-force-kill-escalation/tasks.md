## 1. Protocol & Types

- [x] 1.1 Add `pid?: number` to `SessionRegisterMessage` in `src/shared/protocol.ts`
- [x] 1.2 Add `pid?: number` to `DashboardSession` in `src/shared/types.ts`
- [x] 1.3 Add `force_kill` message type to `BrowserToServerMessage` in `src/shared/browser-protocol.ts`
- [x] 1.4 Add `force_kill_result` message type to `ServerToBrowserMessage` in `src/shared/browser-protocol.ts`

## 2. Bridge

- [x] 2.1 Include `pid: process.pid` in the `session_register` message in `src/extension/session-sync.ts`
- [x] 2.2 Add test verifying PID is included in registration message

## 3. Server

- [x] 3.1 Store `pid` from `session_register` on the session in `src/server/pi-gateway.ts` (where register is handled)
- [x] 3.2 Implement `handleForceKill` in `src/server/browser-handlers/session-action-handler.ts` — SIGTERM, wait 2s, PID safety check, SIGKILL if needed, mark session ended, force-close bridge WS
- [x] 3.3 Wire `force_kill` message to handler in `src/server/browser-gateway.ts`
- [x] 3.4 Add tests for `handleForceKill`: successful kill, no PID fallback (WS close), PID safety check skip

## 4. Client

- [x] 4.1 Add `onForceKill` callback in `src/client/hooks/useSessionActions.ts` that sends `force_kill` message
- [x] 4.2 Implement stop button state machine in `src/client/components/CommandInput.tsx`: idle → aborting → killing states, visual transitions (red → orange pulsing → disabled), reset on status change
- [x] 4.3 Add tests for CommandInput escalation: first click sends abort and transitions to force-stop, second click sends force_kill, state resets when session stops streaming

## 5. Inline Stop Button on Tool Cards

- [x] 5.1 Add `onAbort` and `onForceKill` props to `ToolCallStep` component
- [x] 5.2 Implement inline stop button with same two-click escalation state machine (idle → aborting → killing) on the tool header row, visible only when `status === "running"`
- [x] 5.3 Pass `onAbort` and `onForceKill` through ChatView to ToolCallStep
- [x] 5.4 Add tests for ToolCallStep inline stop button: shows when running, hidden when complete, escalation clicks

## 6. Collapse Repeated Tool Calls

- [x] 6.1 Create a `groupConsecutiveToolCalls` utility function that groups consecutive toolResult messages with same toolName and similar args
- [x] 6.2 Create a `CollapsedToolGroup` component that shows count badge, last result, and expands to show all calls
- [x] 6.3 Integrate grouping into ChatView's message rendering loop
- [x] 6.4 Add tests for groupConsecutiveToolCalls: groups identical calls, doesn't group different tools, handles single items, handles running last item

## 7. Documentation

- [x] 7.1 Update AGENTS.md, README.md, and docs/architecture.md with force-kill escalation details
