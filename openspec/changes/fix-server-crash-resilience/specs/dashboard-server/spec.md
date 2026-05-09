# Dashboard Server — Delta

## ADDED Requirements

### Requirement: Process-level crash safety net SHALL prevent plugin faults from killing the host

The dashboard server process MUST install handlers for both `unhandledRejection` and `uncaughtException` events at startup, before any plugin or route is loaded. The handlers MUST log the offending error (stack preferred, message fallback) with a stable `[crash-safety]` prefix and MUST NOT call `process.exit()`.

The handler is the host's last line of defence against single-point-of-failure plugin code. It does not silence well-handled errors — every well-formed `try/catch` and route handler still surfaces errors normally; only otherwise-fatal async faults are suppressed.

#### Scenario: Plugin throws an unhandled promise rejection

- **WHEN** a loaded plugin (e.g. `honcho`) makes an async call whose rejection is not awaited / `.catch()`-ed
- **THEN** the dashboard server process logs `[crash-safety] unhandledRejection (suppressed): <stack>` to `~/.pi/dashboard/server.log`
- **AND** the process keeps running; `/api/health` continues to return 200
- **AND** open WebSocket connections remain open

#### Scenario: Plugin throws a synchronous uncaught exception

- **WHEN** a plugin's listener / timer callback throws synchronously outside any `try/catch`
- **THEN** the dashboard server process logs `[crash-safety] uncaughtException (suppressed): <stack>`
- **AND** the process keeps running

#### Scenario: Suppressed errors are diagnosable

- **WHEN** an operator inspects `~/.pi/dashboard/server.log` after a "stuck" or unexpected behaviour report
- **THEN** they can `grep crash-safety` to see every suppressed fault with full stack
- **AND** the prefix is stable across releases so log filters keep working
