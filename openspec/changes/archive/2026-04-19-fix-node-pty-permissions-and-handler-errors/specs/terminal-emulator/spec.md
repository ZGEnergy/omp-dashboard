## ADDED Requirements

### Requirement: Terminal creation succeeds on fresh install

After a fresh `npm install` on a supported platform (macOS, Linux, Windows), creating a new terminal via the dashboard UI or the `create_terminal` WebSocket message SHALL succeed without manual filesystem fix-ups. In particular, native `node-pty` prebuild artifacts required for spawning (notably the `spawn-helper` executable on macOS/Linux) SHALL have the execute bit set after install completes.

#### Scenario: spawn-helper is executable after install on macOS/Linux
- **WHEN** the project's `npm install` has completed on macOS or Linux
- **THEN** the file at the `node-pty` prebuild path for the current platform (`<node-pty-root>/prebuilds/<platform>/spawn-helper`) exists
- **AND** its file mode has at least one execute bit set (`mode & 0o111 !== 0`)

#### Scenario: User creates a first terminal from the Terminals view
- **WHEN** the Terminals view is open for a folder with zero existing terminals
- **AND** the user clicks the "+ New Terminal" button
- **THEN** the server spawns a PTY without throwing `posix_spawnp failed.`
- **AND** the server broadcasts a `terminal_added` message
- **AND** the Terminals view displays the new terminal as the active tab

#### Scenario: node-pty is hoisted by workspace tooling
- **WHEN** `node-pty` is installed at the workspace root's `node_modules/node-pty/` (hoisted by npm workspaces) rather than inside a specific package's `node_modules/`
- **THEN** the permission-fix step SHALL still locate and chmod the prebuild's `spawn-helper`
