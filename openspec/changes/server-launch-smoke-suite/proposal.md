## Why

Change `unify-server-launch-ts-loader` collapsed five duplicate dashboard-server spawn sites into one shared `launchDashboardServer` primitive. Unit coverage is comprehensive (launcher tests, `ToolResolver.resolveJiti` tests, `buildNodeImportArgvParts` URL-wrap pin tests, lint allow-list pinned to two files), but unit tests cannot prove the migrated runtime sites actually start a real dashboard server end-to-end. Per-starter smoke tests were carved out of `unify-server-launch-ts-loader` (its tasks §3.1.3, §3.2.3, §3.3.3, §3.4.3, §8.3) so the implementation could be archived; this proposal captures those smoke checks as a single ongoing capability.

The risk this addresses is migration-regression on the hot path: a typo in env merge, a missed argv URL-wrap, or a forgotten `detach` flag would not trip any unit test but would brick the server for one starter. The smoke suite is the only place this surface is exercised against a real server process.

## What Changes

### New scripted smoke suite
- Add `qa/smoke/server-launch/` directory containing one shell script per starter:
  - `bridge-smoke.sh` — patches the bridge auto-spawn path, asserts `/api/health.starter === "Bridge"`, asserts `reportedPid` matches `~/.pi/dashboard/dashboard.pid`.
  - `cli-cold-smoke.sh` — fresh-state `pi-dashboard start`, asserts `/api/health.starter === "Standalone"`, asserts `~/.pi/dashboard/server.log` header line matches `^\[<ISO>\] Standalone launch \(parent pid \d+, port 8000, cli .+\)$`.
  - `cli-warm-smoke.sh` — second invocation while server is already running, asserts the short-circuit message and identical PID.
  - `electron-cold-smoke.sh` — Forge-built Electron app launched headlessly with `DASHBOARD_PREFER_SOURCE` set to each `LaunchSource` (`devMonorepo`, `piExtension`, `npmGlobal`, `extracted`), asserts `/api/health.starter === "Electron"` for each and the cliPath matches the source.
  - `electron-v1-smoke.sh` — same Electron build with `LAUNCH_SOURCE_V2=false`, asserts the legacy `launchServer` path reaches health-ok.
  - `restart-smoke.sh` — `POST /api/restart`, asserts the new server returns 200 from `/api/health` with a different PID than the old.
- Each script is self-contained: kills any prior server on the test port, sets a unique HOME (`mktemp -d`), runs the starter, polls `/api/health` with a 60 s budget, asserts the contract, and tears down.

### Make targets
- Add `make -C qa smoke-server-launch` orchestrator that runs every script in sequence and prints a single PASS / FAIL summary.
- Add `make -C qa smoke-server-launch-<starter>` per-script targets for narrow re-runs.
- Existing per-platform Makefile targets (`test-linux-x86`, etc.) gain a `smoke-server-launch` step in their post-install phase so cross-OS QA runs already exercise this surface.

### CI gate
- New GitHub Actions job `server-launch-smoke` in `.github/workflows/publish.yml`, gated to run only on `release/*` branches and tag pushes. Three OS matrix entries (ubuntu-latest, macos-latest, windows-latest); each runs `qa/smoke/server-launch/cli-cold-smoke.sh` (the cheapest starter, exercises the same `launchDashboardServer` codepath as the others). Electron smoke remains manual-only — it requires Forge artifacts that are produced later in the same workflow.

### Documentation
- Add `qa/smoke/server-launch/README.md` listing each script's contract, its expected runtime, and the failure modes it catches (e.g. "missed env merge → `DASHBOARD_STARTER` defaults to undefined → `/api/health.starter` is null").
- Cross-link from `docs/architecture.md` near the section that describes the unified launcher.

## Capabilities

### Modified Capabilities
- `server-launch`: every existing requirement keeps its current SHALL wording; this proposal adds an SHALL on top — every starter MUST be covered by a runnable smoke script that asserts `/api/health.starter` matches the expected literal.

## Impact

- **Files (new)**:
  - `qa/smoke/server-launch/bridge-smoke.sh`
  - `qa/smoke/server-launch/cli-cold-smoke.sh`
  - `qa/smoke/server-launch/cli-warm-smoke.sh`
  - `qa/smoke/server-launch/electron-cold-smoke.sh`
  - `qa/smoke/server-launch/electron-v1-smoke.sh`
  - `qa/smoke/server-launch/restart-smoke.sh`
  - `qa/smoke/server-launch/README.md`
- **Files (modified)**:
  - `qa/Makefile` — orchestrator + per-script targets.
  - `.github/workflows/publish.yml` — new `server-launch-smoke` matrix job, release-only.
  - `docs/architecture.md` — pointer to the smoke-suite README.
- **No source changes**. This proposal only adds tests + CI wiring.
- **Risk**: Low. Failure of a smoke script blocks the release pipeline but cannot regress runtime behaviour.
- **Sequencing**: independent of any code change. Can ship before, after, or alongside any future server-launch refactor.
