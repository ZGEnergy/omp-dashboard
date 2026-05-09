# server-launch (MODIFIED)

## ADDED Requirements

### Requirement: Per-starter smoke coverage

Every dashboard-server starter (Bridge, Standalone CLI, Electron-V2 per LaunchSource, Electron-V1 legacy, restart-helper) SHALL have a runnable shell script under `qa/smoke/server-launch/` that:

- spawns or triggers the starter against an isolated `HOME` (`mktemp -d`),
- polls `GET /api/health` with a 60 s budget,
- asserts `data.starter` matches the expected literal (`"Bridge"` / `"Standalone"` / `"Electron"`),
- asserts `data.pid` is a positive integer,
- tears down the server and any auxiliary processes on exit (trap on EXIT).

#### Scenario: Bridge auto-spawn smoke

- **WHEN** `qa/smoke/server-launch/bridge-smoke.sh` runs against a clean `HOME`
- **THEN** the script triggers the bridge auto-spawn path (no other server running on the configured port)
- **AND** asserts `/api/health.starter === "Bridge"`
- **AND** asserts `data.pid` equals the value in `~/.pi/dashboard/dashboard.pid`

#### Scenario: Standalone CLI cold + warm

- **WHEN** `qa/smoke/server-launch/cli-cold-smoke.sh` runs (no server on port)
- **THEN** `pi-dashboard start` returns success
- **AND** `/api/health.starter === "Standalone"`
- **AND** `~/.pi/dashboard/server.log` ends with a header line matching `^\[<ISO 8601>\] Standalone launch \(parent pid \d+, port \d+, cli .+\)$`
- **AND WHEN** `qa/smoke/server-launch/cli-warm-smoke.sh` runs immediately after
- **THEN** the second `pi-dashboard start` short-circuits with `already running` and exits 0
- **AND** the reported PID matches the cold-start PID

#### Scenario: Electron V2 per LaunchSource

- **WHEN** `qa/smoke/server-launch/electron-cold-smoke.sh` runs against a Forge-built Electron app
- **THEN** for each value of `DASHBOARD_PREFER_SOURCE` in `["devMonorepo", "piExtension", "npmGlobal", "extracted"]` the launched server reaches health-ok
- **AND** `/api/health.starter === "Electron"` for every variant
- **AND** the script tears down the Electron process between variants so the next variant starts from a clean state

#### Scenario: Electron legacy V1

- **WHEN** `qa/smoke/server-launch/electron-v1-smoke.sh` runs with `LAUNCH_SOURCE_V2=false`
- **THEN** `ensureServer` → `launchServer` (the legacy V1 path) reaches health-ok
- **AND** `/api/health.starter === "Electron"`
- **AND** the run is gated behind a `--with-v1` flag so it is skipped by default once V1 is removed

#### Scenario: Restart helper

- **WHEN** `qa/smoke/server-launch/restart-smoke.sh` runs against a running server
- **THEN** `POST /api/restart` returns 200
- **AND** within 30 s `/api/health` returns `data.pid` different from the pre-restart PID
- **AND** the new starter matches the prior starter (orchestrator preserves mode)

### Requirement: Smoke orchestrator

`qa/Makefile` SHALL expose:

- `make smoke-server-launch` — runs every script under `qa/smoke/server-launch/` in sequence, fails fast on first failure, prints a single summary line.
- `make smoke-server-launch-<starter>` — runs exactly one script for narrow re-runs (`<starter>` ∈ `bridge|cli-cold|cli-warm|electron-cold|electron-v1|restart`).

#### Scenario: Sequential run on green path

- **WHEN** `make smoke-server-launch` runs against a clean checkout with `npm run build` already complete
- **THEN** every script exits 0
- **AND** the summary line reads `OK: 6/6 server-launch smoke scripts passed`

#### Scenario: Fail-fast on red

- **WHEN** any single script exits non-zero
- **THEN** the orchestrator exits with that script's status
- **AND** subsequent scripts do not run
- **AND** the failing script's last 50 lines of stdout/stderr are printed for diagnosis

### Requirement: CI gate on release branches

The GitHub Actions workflow `.github/workflows/publish.yml` SHALL include a `server-launch-smoke` matrix job that:

- triggers on `release/*` branch pushes and `v*` tag pushes only (never on `develop`),
- runs on `[ubuntu-latest, macos-latest, windows-latest]`,
- executes only `qa/smoke/server-launch/cli-cold-smoke.sh` (the cheapest representative starter — Electron smoke is run manually via `manual-<platform>` Make targets),
- blocks the publish job on failure.

#### Scenario: Release-branch push triggers the matrix

- **WHEN** a commit lands on `release/0.6.0` and CI runs
- **THEN** `server-launch-smoke` runs three jobs (one per OS)
- **AND** the publish job is gated by `needs: server-launch-smoke`
- **AND** a failure on any OS aborts the release

#### Scenario: Develop-branch push skips the matrix

- **WHEN** a commit lands on `develop`
- **THEN** `server-launch-smoke` is skipped
- **AND** the existing `test` job remains the only gate

### Requirement: Smoke documentation

`qa/smoke/server-launch/README.md` SHALL exist and document:

- one bullet per script with: purpose, expected runtime budget, the env vars it reads, and the failure mode it catches (one concrete failure example per script).
- prerequisites (`npm run build` complete, `pi-dashboard` on PATH, etc.).
- how to run a single script versus the full suite.
- known flake patterns and their root causes (e.g. AV-scanner-induced cold-start delays on Windows).

#### Scenario: README cross-linked from architecture doc

- **WHEN** a reader visits `docs/architecture.md` at the section describing the unified server launcher
- **THEN** the section contains a link to `qa/smoke/server-launch/README.md`
- **AND** the link text identifies the smoke suite as the runtime-coverage layer for the launcher
