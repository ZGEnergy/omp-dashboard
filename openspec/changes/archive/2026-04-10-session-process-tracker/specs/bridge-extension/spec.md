## MODIFIED Requirements

### Requirement: Command routing in send_prompt handler
The bridge extension's command handler SHALL parse `send_prompt` text for `!`, `!!`, and `/` prefixes and route them to the appropriate pi APIs instead of always calling `sendUserMessage()`.

Routing order:
1. `!!<cmd>` → silent bash via `pi.exec()`, forward `bash_output` event
2. `!<cmd>` → bash via `pi.exec()`, forward `bash_output` event + send to LLM
3. `/compact [args]` → `ctx.compact()` with optional custom instructions
4. `/` prefixed → `session.prompt(text)` for extension commands, skills, templates
5. Default → `pi.sendUserMessage(text)`

The command handler SHALL also handle `kill_process` messages by calling `killProcessByPgid(pgid)` from the process-scanner module.

#### Scenario: Kill process command received
- **WHEN** the command handler receives a `kill_process` message with a valid PGID
- **THEN** it SHALL call `killProcessByPgid(pgid)` and log the result

#### Scenario: Kill process for wrong session ignored
- **WHEN** the command handler receives a `kill_process` message with a sessionId that does not match the current session
- **THEN** it SHALL ignore the message

## ADDED Requirements

### Requirement: Bridge wires process scanner timer
The bridge extension SHALL start a process scanner timer during session initialization (alongside existing heartbeat and git poll timers). The timer SHALL call `scanChildProcesses(process.pid)` every 10 seconds. The timer SHALL be added to the bridge state's `timers` array for cleanup on disconnect.

#### Scenario: Timer starts on session init
- **WHEN** the bridge connects and registers a session
- **THEN** a 10-second interval timer for process scanning SHALL be started

#### Scenario: Timer cleared on cleanup
- **WHEN** the bridge disconnects or the session ends
- **THEN** the process scan timer SHALL be cleared via the timers array cleanup

### Requirement: Bridge sends process_list only on change
The bridge SHALL maintain the previous process scan result (array of PIDs). After each scan, it SHALL compare the current PID set to the previous one. A `process_list` message SHALL only be sent when the sets differ.

#### Scenario: First scan with active processes
- **WHEN** the first scan returns two processes
- **THEN** a `process_list` message SHALL be sent (previous was empty)

#### Scenario: Subsequent scan unchanged
- **WHEN** the scan returns the same PIDs as the previous scan
- **THEN** no `process_list` message SHALL be sent

#### Scenario: Process exits between scans
- **WHEN** a previously reported process is no longer in the scan
- **THEN** a `process_list` message SHALL be sent with the updated list
