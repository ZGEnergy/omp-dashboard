## ADDED Requirements

### Requirement: Spawn errors propagate to the browser
When `spawnPiSession` throws or returns `{ success: false }`, the server-side session-action handler (`handleSpawnSession`) SHALL emit a `spawn_error` message to the requesting browser client carrying `{ requestId, cwd, strategy, message, stderr? }`. The message SHALL be part of the `ServerToBrowserMessage` union so esbuild preserves the switch case in production builds.

#### Scenario: Spawn throws a native error
- **WHEN** `spawnPiSession(cwd, { strategy: "headless" })` throws `ENOENT: pi not found`
- **THEN** the handler SHALL emit `{ type: "spawn_error", requestId, cwd, strategy: "headless", message: "ENOENT: pi not found" }` to the browser

#### Scenario: Spawn returns failure result
- **WHEN** `spawnPiSession` returns `{ success: false, message: "tmux unavailable" }`
- **THEN** the handler SHALL emit the corresponding `spawn_error` message with the returned message text

#### Scenario: Stderr captured for diagnostics
- **WHEN** the underlying child process writes to stderr before failing (e.g. `wt.exe` install error)
- **THEN** up to 2 KB of stderr tail SHALL be included in the `spawn_error.stderr` field

### Requirement: Windows spawn falls back from wt to headless when Windows Terminal is absent
On Windows (`process.platform === "win32"`), before spawning via the `wt` mechanism, `selectMechanism` (or its caller) SHALL probe for `wt.exe` presence using `ToolResolver.which("wt")`. If `wt.exe` is not found on PATH, the spawn SHALL automatically degrade to the `headless` mechanism and log the degradation exactly once per server run with a hint pointing to Windows Terminal's install page.

#### Scenario: wt.exe present
- **WHEN** the server spawns a session on Windows and `wt.exe` is on PATH
- **THEN** `wt` mechanism SHALL be used as before (no change)

#### Scenario: wt.exe absent, first session
- **WHEN** the server spawns a session on Windows and `wt.exe` is NOT on PATH
- **THEN** the mechanism SHALL degrade to `headless` and the server log SHALL emit one informational line: `"wt.exe not found on PATH — falling back to headless spawn. Install Windows Terminal: <url>"`

#### Scenario: wt.exe absent, subsequent sessions in same server run
- **WHEN** a second session is spawned after the fallback has already logged
- **THEN** the fallback SHALL occur silently (no repeated log line)

#### Scenario: Fallback reported to client
- **WHEN** the mechanism is demoted from `wt` to `headless` for a spawn request
- **THEN** the resulting session metadata SHALL carry `strategy: "headless"` (not `"wt"`) so the client renders the correct state
