## Why

Pi's bash tool spawns child processes with `detached: true`, meaning they survive if the tool call times out, the session hangs, or the user aborts. Long-running commands like `npm test --watch`, `vite dev`, or stalled builds can accumulate as invisible orphans, consuming CPU/memory with no way to discover or kill them from the dashboard. Users need visibility into what each session has spawned and a way to kill stalled processes.

## What Changes

- Bridge extension periodically scans for child processes of its own pi session PID using `pgrep -P` + `ps`
- Only processes running longer than 30 seconds are reported (filters out short-lived tool executions)
- Process list is forwarded to the dashboard server and then to the browser via existing WebSocket protocol
- Session card in the UI shows active child processes with elapsed time and a red ✕ kill button
- Kill command travels back through WebSocket → server → bridge → `process.kill(-pgid, SIGTERM)`
- Unix only (macOS + Linux); Windows is skipped gracefully with a platform guard

## Capabilities

### New Capabilities
- `session-process-tracking`: Bridge-side child process scanning, protocol events, server forwarding, UI display with kill controls

### Modified Capabilities
- `shared-protocol`: New message types for process list and kill commands (extension↔server)
- `bridge-extension`: Bridge wires up periodic process scanner and kill handler

## Impact

- **Bridge extension**: New `process-scanner.ts` module, new poll interval (5-10s), new kill handler in command-handler
- **Protocol**: New `process_list` event type (extension→server), new `kill_process` message type (server→extension), new `process_list_update` message (server→browser)
- **Server**: Forward process list events to subscribed browsers, forward kill requests to bridge
- **Client**: New `ProcessList` component rendered inside session card
- **No breaking changes**: Additive protocol messages; older bridges without the scanner simply never send process list events
