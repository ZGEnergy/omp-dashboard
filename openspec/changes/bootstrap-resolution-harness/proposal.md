## Why

The Electron app's bootstrap — "where is pi? where is node? is the bridge extension registered?" — is fragile. Path drift (spaces, unicode, case), HOME drift ($HOME vs USERPROFILE vs os.homedir), install-location drift (global npm vs managed vs bare-import vs electron-bundled), and bridge-registration drift (pi installed but no bridge, stale bridge, malformed settings.json, AppImage temp paths) combine into a state space of ~200+ cells. Today the code relies on implicit assumptions across ~15 files (`tool-registry/*`, `dependency-detector.ts`, `managed-paths.ts`, `bridge-register.ts`, `server-lifecycle.ts`), and regressions are only caught by running the Docker e2e test or a manual QA VM — both slow and single-scenario per run.

Users currently hit the fragility in specific, reproducible ways:

1. `npm i -g pi-dashboard` on Windows → pi-dashboard on PATH but pi absent → dashboard starts, no sessions ever appear. (User reports needing to `npm i -g @mariozechner/pi` by hand.)
2. pi installed before pi-dashboard → bridge extension not in `settings.json` → dashboard has to self-register on boot. If `findBundledExtension` returns null (AppImage, npm-global layout without sibling extension dir), registration silently fails.
3. HOME drift on Windows (`$HOME` set by Git Bash vs `USERPROFILE` used by `os.homedir()`) → settings.json written to one location, read from another.
4. `~/.pi-dashboard/` has stale pi from an old install → `managed` strategy resolves a version that doesn't match what the dashboard expects.

A memory-filesystem based test harness would catch ~80% of this fragility in milliseconds per scenario, runs in CI on every commit, and makes the install-mechanics matrix explicit and maintainable.

## What Changes

- **NEW capability** `bootstrap-testing`: a pure-in-memory harness for testing the dashboard's bootstrap resolution (ToolRegistry + settings.json + environment) across a declared scenario matrix.
- **Fail-closed scenario cube**: every combination of `platform × dash-location × pi-state × settings-state × env-drift` is either a test OR an explicit `.skip("reason")`. Adding a new install mechanic without categorizing its cells breaks CI — a forcing function.
- **Trail snapshot assertions**: the primary assertion is `toMatchSnapshot()` on the `Resolution.trail` produced by `ToolRegistry.resolve(tool)`. Locks in strategy order, failure reasons, and the `toArgv` output (Windows `node.exe` prepend for `.js` targets). Strategy-order regressions surface immediately.
- **settings.json mutation snapshots**: capture the before/after of `registerBridgeExtension()` per scenario. Locks in non-destructive cleanup behavior, AppImage rejection, and stale-path removal.
- **~25 curated scenario cells** initially, across families: electron-packaged, npm-global-full, npm-global-dash-only (the Windows bug), dev-monorepo, override-valid, override-broken, stale-managed, cwd-with-spaces, cwd-unicode, HOME-drift, Windows-cmd-shim, Windows-AppData-roaming, Windows-ProgramFiles-cwd.
- **Harness primitives** made injectable where not already: `bareImportStrategy`'s `createRequire` becomes a `resolveModule(id, from)` dependency; `managed-paths.ts` constants become getters `getManagedDir({ homedir })`; a `PlatformEnv` context threads through registry creation.
- **No behavior change** — this change only captures current state. Follow-up proposals (`unified-bootstrap-install`, `single-dashboard-per-home`) fix the bugs the harness exposes.

### Out of scope

- Fixing the `npm i -g pi-dashboard` → no-pi bug. The harness captures it as a scenario; the fix lives in `unified-bootstrap-install`.
- Per-HOME lock-file scenarios. Deferred to `single-dashboard-per-home` where the lock is introduced.
- Real Electron IPC testing (Xvfb). Deferred — out of scope for this thread.
- Docker/VM integration. Existing layers remain; this is a fourth, faster layer.

## ⚠ Precondition: v3 Merge

**This proposal assumes `merge-windows-integration-linear` has landed on `develop`.** Before starting implementation:

1. Verify `develop` HEAD includes the v3 merge commit (look for `platform/spawn.ts`, `platform/process.ts`, `tool-registry/strategies.ts` with `StrategyDeps` injection).
2. Re-run `openspec show bootstrap-resolution-harness` against current `develop` and confirm scenario assumptions still hold:
   - Windows `.cmd` + Node-script → `toArgv` prepends `node.exe` (v3 behavior).
   - `isDashboardRunning()` is identity-verified (v3 behavior).
   - Vitest globalSetup tripwire exists (v3 behavior).
   - Test-env-guard no-op under `VITEST=true` + real HOME (v3 behavior).
3. If any assumption has shifted, update `design.md` before task 1.

If v3 has NOT merged, do not start — proposal (2) and (3) have higher blast-radius conflicts and this proposal is only useful atop v3's primitives.

## Impact

### Specs affected

- `bootstrap-testing` — NEW capability (added in `specs/bootstrap-testing/spec.md` of this change).
- `tool-registry` — MODIFIED: adds a `PlatformEnv` context parameter to registry construction (backwards-compatible default = live environment). Delta in this change's `specs/tool-registry/`.
- No spec amendments to `bridge-extension` or `dependency-installation` — those land in proposals (2) and (3).

### Code surface

- **New**: `packages/shared/src/__tests__/bootstrap/` (harness, fixtures, scenarios, assertions). Placed in `shared` because both server and electron consume the registry.
- **Modified**: `packages/shared/src/tool-registry/strategies.ts` (add `resolveModule` to `StrategyDeps`), `packages/shared/src/managed-paths.ts` (export `getManagedDir`/`getManagedBin` getters alongside constants), `packages/shared/src/bridge-register.ts` (accept optional `homedir` param — already reads `$HOME || USERPROFILE || os.homedir()` at call time, just plumb through).
- **Unchanged**: all production call sites continue to use live constants via the default-export path; only tests pass the injected values.

### Migration, compatibility, rollback

- **Migration**: none. No runtime behavior change.
- **Compatibility**: fully backwards-compatible. The new `PlatformEnv` context and `resolveModule` dep have live defaults identical to current behavior.
- **Rollback**: `git revert` the landing commits. No persistent state, no user-facing change.

### Validation

- All new tests green under `npm test`.
- Snapshot files committed; CI validates no unreviewed snapshot diffs.
- Existing test suite remains green (no production code path changes behavior).
- Fail-closed check: add a cube-enumeration test that fails if a platform × install × pi-state combination exists without a matching `.test.ts` or `.skip(...)` marker.
