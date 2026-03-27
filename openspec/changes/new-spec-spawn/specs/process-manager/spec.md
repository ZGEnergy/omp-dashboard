## MODIFIED Requirements

### Requirement: Spawn pi session supports headless strategy
The `spawnPiSession` function SHALL accept an optional `strategy` parameter (`"tmux" | "headless"`). When `"headless"`, it SHALL spawn `pi --mode rpc` as a child process instead of using tmux. When `"tmux"` or omitted, existing tmux behavior SHALL be preserved. An optional `initialPrompt` parameter SHALL be appended as a positional argument to the pi command.

#### Scenario: Headless spawn with initial prompt
- **WHEN** `spawnPiSession(cwd, { strategy: "headless", initialPrompt: "/opsx:explore" })` is called
- **THEN** it SHALL spawn `pi --mode rpc "/opsx:explore"` with `cwd` set and `PI_DASHBOARD_SPAWNED=1` in env

#### Scenario: Tmux spawn with initial prompt
- **WHEN** `spawnPiSession(cwd, { strategy: "tmux", initialPrompt: "/opsx:explore" })` is called
- **THEN** it SHALL spawn a tmux window running `pi "/opsx:explore"` in the specified cwd

#### Scenario: Spawn without initial prompt unchanged
- **WHEN** `spawnPiSession(cwd, { strategy: "headless" })` is called without `initialPrompt`
- **THEN** behavior SHALL be identical to current implementation
