## 1. Smoke scripts

- [ ] 1.1 Create `qa/smoke/server-launch/` directory + a shared `_lib.sh` exporting `assert_health(port, expected_starter)`, `wait_for_health(port, timeout_seconds)`, `cleanup_on_exit(pids…)`, `with_isolated_home(cmd…)`. Every script sources `_lib.sh` so the assertion vocabulary lives in one place.
- [ ] 1.2 `bridge-smoke.sh`: spawn a transient pi session that triggers bridge auto-spawn, poll `/api/health` until `running:true`, assert `starter === "Bridge"`, assert `pid === $(cat ~/.pi/dashboard/dashboard.pid)`, kill the pi session + server on exit.
- [ ] 1.3 `cli-cold-smoke.sh`: from clean `HOME`, run `pi-dashboard start`, poll `/api/health` until `running:true`, assert `starter === "Standalone"`, grep the last line of `~/.pi/dashboard/server.log` against the header regex `^\[.+\] Standalone launch \(parent pid [0-9]+, port [0-9]+, cli .+\)$`. Exit cleanly via `pi-dashboard stop`.
- [ ] 1.4 `cli-warm-smoke.sh`: assumes cold-smoke just ran (or runs it inline). Re-invokes `pi-dashboard start`, captures stdout, asserts the short-circuit message contains `already running` and exits 0. Asserts `/api/health.pid` is unchanged from cold start.
- [ ] 1.5 `electron-cold-smoke.sh`: locates the most recent Forge build under `packages/electron/out/`, launches it headlessly via xvfb-run (Linux) / `open -gnW` (mac) / direct exec (Windows). Loops over `DASHBOARD_PREFER_SOURCE ∈ {devMonorepo, piExtension, npmGlobal, extracted}`, asserting `/api/health.starter === "Electron"` per variant. Skips a variant with a clear message when the launch source isn't available on the current host (e.g. `npmGlobal` requires pi on PATH).
- [ ] 1.6 `electron-v1-smoke.sh`: same as 1.5 but with `LAUNCH_SOURCE_V2=false` and a single variant. Gated behind `--with-v1` flag — skipped (exit 0 with message) when the env var is unset, so the script becomes a no-op once V1 is removed.
- [ ] 1.7 `restart-smoke.sh`: assumes a server is running, captures the pre-restart PID, `POST /api/restart`, polls `/api/health` until `pid` differs and is positive, asserts the new `starter` matches the original. Exit cleanly via `pi-dashboard stop`.
- [ ] 1.8 Each script ends with `set -euo pipefail` + `trap` cleanup so a failed assertion still tears down the server, prevents zombie processes, and prints a 50-line tail of `~/.pi/dashboard/server.log` for diagnosis.

## 2. Make targets

- [ ] 2.1 Add `smoke-server-launch` orchestrator target to `qa/Makefile`. Loops over the script set, fails fast, prints a one-line summary.
- [ ] 2.2 Add per-script targets `smoke-server-launch-bridge`, `smoke-server-launch-cli-cold`, `smoke-server-launch-cli-warm`, `smoke-server-launch-electron-cold`, `smoke-server-launch-electron-v1`, `smoke-server-launch-restart`.
- [ ] 2.3 Wire `smoke-server-launch` into `test-linux-x86`, `test-windows-x86`, `test-macos-arm64` post-install phases so cross-OS QA already exercises the migrated launcher surface.

## 3. CI gate

- [ ] 3.1 Add `server-launch-smoke` matrix job in `.github/workflows/publish.yml`. Matrix: `[ubuntu-latest, macos-latest, windows-latest]`. Steps: checkout, setup-node, `npm ci`, `npm run build`, `bash qa/smoke/server-launch/cli-cold-smoke.sh`. Trigger gate: `if: startsWith(github.ref, 'refs/heads/release/') || startsWith(github.ref, 'refs/tags/v')`.
- [ ] 3.2 Make the existing publish jobs depend on `server-launch-smoke` via `needs:`, so a smoke failure aborts the release without touching npm.
- [ ] 3.3 Update `packages/shared/src/__tests__/publish-workflow-contract.test.ts` (the lint that pins workflow shape) to require `server-launch-smoke` in the `needs:` array of the publish jobs.

## 4. Documentation

- [ ] 4.1 Author `qa/smoke/server-launch/README.md` per the Documentation requirement above. Use the standard caveman style for terse prose (see Documentation Update Protocol).
- [ ] 4.2 Add a one-line pointer in `docs/architecture.md` near the launcher section linking to the smoke README.
- [ ] 4.3 Add a row to `docs/file-index-skills-misc.md` (or the closest matching split) listing each new shell script with its one-line purpose. Delegate the file-index edit to a subagent per the Documentation Update Protocol.

## 5. Validation

- [ ] 5.1 `openspec validate server-launch-smoke-suite --strict` passes.
- [ ] 5.2 `make smoke-server-launch` passes on a developer machine for at least one OS (Linux is sufficient for proposal review; the CI matrix covers the other two before release).
- [ ] 5.3 Verify the CI matrix triggers on a synthetic `release/test-smoke-gate` branch push and skips on `develop` push.
- [ ] 5.4 Cross-link this proposal from `unify-server-launch-ts-loader` in CHANGELOG so the deferred-smoke link is discoverable.
