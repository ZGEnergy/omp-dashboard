## 0. Precondition check

- [x] 0.1 Verify `merge-windows-integration-linear` has landed on `develop`. Run `git log develop --grep="windows-integration-v3" --oneline` and confirm the merge commit exists. If not, STOP — this proposal requires v3's `platform/` + `tool-registry/` primitives. **Confirmed at commit `422bf5d Windows integration v3 (#10)`; `packages/shared/src/platform/` present.**
- [x] 0.2 Re-read `design.md §10` against current `packages/shared/src/tool-registry/strategies.ts` and confirm `StrategyDeps` still has the expected shape. If `resolveModule` has been added by another change, skip task 2.1. **StrategyDeps had `exists`, `which`, `npmRootGlobal` only; no `resolveModule` — task 1.1 proceeded.**
- [x] 0.3 Re-read `design.md §13` and confirm the Windows `npm i -g` bug still reproduces (see proposal 2's pre-work). If it's already fixed, update scenario B1's expected outcome to "resolves via managed" and note in the PR description. **Not reproducible on macOS dev host; assumed present per code review (the `npm i -g pi-dashboard` install layout still has no `packages/extension/` sibling in `node_modules/`, and the Unix pi strategy chain has no module fallback). Reverify on Windows VM before scenario B1 snapshot is captured.**

## 1. Refactor prerequisites

- [x] 1.1 Add `resolveModule(id: string, from: string): string | null` to `StrategyDeps` in `packages/shared/src/tool-registry/strategies.ts`. Default implementation uses `createRequire(from).resolve(id)`.
- [x] 1.2 Update `bareImportStrategy` to call `deps.resolveModule(pkgName, anchorPath)` instead of inline `createRequire(...).resolve(...)`. Confirm existing tests still pass.
- [x] 1.3 Add `getManagedDir(env?: { homedir?: string })` and `getManagedBin(env?: { homedir?: string })` functions to `packages/shared/src/managed-paths.ts`. Keep `MANAGED_DIR` and `MANAGED_BIN` constants for back-compat (they delegate to the getters with no arg → live env). `getPiSettingsPath` added alongside.
- [x] 1.4 Update `managedBinStrategy` and `managedModuleStrategy` to call `getManagedBin(ctx.env)` / `getManagedDir(ctx.env)` when `ctx.env` is provided; fall back to constants otherwise.
- [x] 1.5 Thread an optional `env: PlatformEnv` parameter through `ToolRegistry` constructor and `resolve()` method. Live default = `{ homedir: os.homedir(), platform: process.platform, cwd: () => process.cwd() }`. `StrategyCtx.env` added too.
- [x] 1.6 Add optional `homedir?: string` parameter to `registerBridgeExtension(extensionPath, { homedir? })` in `packages/shared/src/bridge-register.ts`. Keep current `$HOME || USERPROFILE || os.homedir()` as default.

## 2. Harness foundation

- [x] 2.1 Add `memfs` as a dev dependency of `packages/shared/`.
- [x] 2.2 Create `packages/shared/src/__tests__/bootstrap/harness.ts` with `withFakeEnv({ platform, homedir, cwd, env, fs }, async (ctx) => ...)` — builds a `memfs` volume, produces a `createRegistry()` function wired with fake `exists`/`which`/`npmRootGlobal`/`resolveModule`, returns the computed `PlatformEnv`. Includes `FakeOverridesStore` and `toMemfsPath` helper for win32 path translation. Smoke tests in `harness.smoke.test.ts` (12 tests green).
- [x] 2.3 Implement `ctx.which(name)` lookup over the fake PATH: iterate PATH entries, check `${entry}/${name}` and (on win32) `${entry}/${name}.cmd`, `${entry}/${name}.exe`. Also tries `.bat`.
- [x] 2.4 Implement `ctx.resolveModule(id, from)` over the fake fs: walk `from`'s ancestor `node_modules/` dirs, return path to `${dir}/node_modules/${id}/package.json` if it exists. Reads `main` field to derive entry; defaults to `index.js`.
- [x] 2.5 Implement `ctx.npmRootGlobal()` — reads a configured value from the fake env; defaults to `<homedir>/.npm/lib/node_modules` on posix, `<APPDATA>/npm/node_modules` on win32.

## 3. Fixtures library

- [x] 3.1 Create `fixtures/electron-layout.ts` with `electronPackaged({ platform, appimage? })` returning fs layer mimicking `<resourcesPath>/server/packages/...` + bundled node. AppImage variant produces `/tmp/.mount_PIxxxx/...`.
- [x] 3.2 Create `fixtures/npm-global-layout.ts` with `npmGlobalUnix`, `npmGlobalWindowsAppData`, `npmGlobalWindowsProgramFiles`.
- [x] 3.3 Create `fixtures/managed-install.ts` with `managedInstall({ homedir, platform, pi?, openspec?, tsx?, piPartial? })` — populates `<homedir>/.pi-dashboard/node_modules/...` + `.bin/` shims (`.cmd` on win32). `piPartial` simulates an interrupted install (E2).
- [x] 3.4 Create `fixtures/dev-monorepo.ts` with `devMonorepo({ root, platform, pi?, openspec? })` (workspace layout with hoisted deps).
- [x] 3.5 Create `fixtures/settings-json.ts` with `settingsJson({ homedir, platform, packages?, malformed?, missing? })` and `settingsJsonPath` helper.
- [x] 3.6 Create `fixtures/pi-versions.ts` with `piPackageJson`/`openspecPackageJson` helpers for version stamping.
- [x] 3.7 `layer(...layers)` helper already implemented in `harness.ts` during task 2.2.

## 4. Assertions

- [x] 4.1 `snapshotTrail(resolution, ctx)` normalizes paths via `normalizePath` (replaces `<HOME>`/`<NPM_ROOT>`, flips backslashes). Applies to both the resolved `path` field AND every `tried[].result` reason string so snapshots are stable cross-OS.
- [x] 4.2 `snapshotSettings(settings, ctx)` emits a sorted package list with normalized paths.
- [x] 4.3 `snapshotSettingsDelta(before, after, ctx)` shows added/removed/preserved with normalized paths.

## 5. Scenario registration + cube

- [x] 5.1 `scenarios.ts` with `REGISTERED_SCENARIOS` (Map<key, tag>) and `SKIPPED_SCENARIOS` (Map<key, reason>). `register()`, `skip()`, `skipPattern()`, `enumerateCube()`, `cellKey()`, `parseCellKey()`. Canonical axes exported (`PLATFORMS`, `DASH_LOCATIONS`, `PI_STATES`, `SETTINGS_STATES`, `ENV_STATES`).
- [x] 5.2 `cube.ts` with `sweepCube()` and `formatUnclassifiedError()`. Cube shape: 3 platforms × 5 dash-locations × 6 pi-states × 4 settings-states × 3 env-states = 1080 cells.
- [x] 5.3 `cube.test.ts` fails if any cell is neither registered nor skipped. `scenarios-skipped.ts` provides bulk-skip manifest so the test passes on day 1 (all cells skipped with reasons); family files replace skip with registration as they land. `families/index.ts` barrel ensures registration runs before sweep (avoids vitest module-graph isolation issues).

Note: one family scaffold landed alongside (Family A1+A2 × 3 platforms = 6 registered cells). Remaining family tasks below populate the cube.

## 6. Family A — electron-packaged

- [ ] 6.1 `a1-electron-fresh.test.ts` — scenario A1 for platforms win/mac/lin. Assert pi unresolved (all strategies miss), trail snapshot captures the chain.
- [ ] 6.2 `a2-electron-prewarmed.test.ts` — A2. Assert pi resolves to `managed`, openspec to `managed`, bridge registered matches bundled path.
- [ ] 6.3 `a3-electron-global-pi.test.ts` — A3. Assert strategy order prefers managed over npm-g per current definitions.ts (verify — this may be wrong direction; snapshot captures whatever today's order is).
- [ ] 6.4 `a4-electron-appimage-fresh.test.ts` — linux only. Assert `findBundledExtension` returns null, warning logged, settings.json unchanged.

## 7. Family B — npm-global

- [x] 7.1 `b-npm-global.test.ts` B1 — ⚠ captures the Windows bug across all 3 platforms (npm-g dash only, no pi). Trail snapshot locked in. `FIXED-BY: unified-bootstrap-install` marker in test.
- [x] 7.2 B2 — pi + openspec resolve via system (Unix) / npm-global (Windows). win32 variant asserts `source === "npm-global"`.
- [x] 7.3 B3 — pi present, bridge NOT in settings. Input-side assertion (fixture correctly produces bridge-less settings.json). Full round-trip pending bridge-register fs injection (cross-proposal future task).

## 8. Family C — dev monorepo

- [x] 8.1 `c-dev-monorepo.test.ts` C1 — mac/linux. Captures the real limitation: pi's Unix chain has no bare-import, so workspace layout alone doesn't resolve pi on Unix. Trail snapshot locks in current behavior.
- [x] 8.2 C2 — win32 bare-import resolves pi via workspace node_modules; `source === "bare-import"`. Uses a custom `resolveModule` anchor to point at the workspace root.

## 9. Family D — overrides

- [x] 9.1 `d-overrides.test.ts` D1 — override set in FakeOverridesStore; pi resolves to override path; `source === "override"`.
- [x] 9.2 D2 — override points to non-existent file; falls through to managed strategy; trail shows `invalid: ...` reason.

## 10. Family E — stale / broken managed

- [x] 10.1 `e-stale-partial.test.ts` E1 — managed pi v0.0.1. Today strategies don't version-gate; resolves normally. Snapshot will shift when `unified-bootstrap-install` adds version-skew detection downstream.
- [x] 10.2 E2 — managed install has package.json but no dist/cli.js and no .bin shim. Strategy returns not-found; falls through to `where`.

## 11. Family F — cwd variants

- [x] 11.1 `f-cwd-variants.test.ts` F1 — cwd with spaces (linux + `Program Files (x86)` on win32). Resolution unaffected — invariant locked in.
- [x] 11.2 F2 — Greek + Cyrillic + emoji in cwd. Resolution unaffected.

## 12. Family G — Windows specifics

- [x] 12.1 `g-windows-specifics.test.ts` G1 — pi.cmd found via managed-bin; trail snapshot proves `.cmd` resolution path.
- [x] 12.2 G2 — npm-g at `%APPDATA%\Roaming\npm`; `source === "npm-global"`.
- [x] 12.3 G3 — covered by F1-win (Program Files (x86) cwd). No standalone file.
- [x] 12.4 G4 — node.exe at `C:\Program Files\nodejs\node.exe`; resolution finds it via PATH walk.

## 13. Family H — HOME drift

- [x] 13.1 `h-home-drift.test.ts` H1 — win32, `$HOME=/c/Users/R` vs `USERPROFILE=C:\Users\R`. Harness-side assertion that `readSettings()` resolves to the canonical homedir. Full `registerBridgeExtension` override round-trip pending bridge-register fs injection.
- [ ] 13.2 H2 (home-symlink) — Deferred. memfs does not support symlinks. Documented as `SKIPPED_SCENARIOS` entry; covered by real-filesystem integration test when added.

## 14. Family I — malformed / other-packages settings

- [x] 14.1 `i-malformed-settings.test.ts` I1 — `readSettings` returns null for malformed JSON (tolerant fallback). Assertion captures current behavior; full bail-on-malformed during write pending bridge-register fs injection.
- [x] 14.2 I2 — settings with unrelated packages correctly loaded from fixture. Preservation round-trip pending bridge-register fs injection.

## 15. Family J — minimal PATH

- [x] 15.1 `j-path-gui-minimal.test.ts` J1 — linux minimal PATH (no `/usr/local/bin`). Captures a REAL current limitation: pi/openspec Unix chains lack `npm-global` strategy, so GUI-launched apps with minimal PATH can't resolve. Snapshot locks in limitation.

## 16. Family K — dashboard absent

- [x] 16.1 `k-dashboard-absent.test.ts` K1 — pi resolves normally. Dashboard's own "am I installed" concern is handled by `dependency-detector.ts:detectPiDashboardCli()`, not ToolRegistry — documented in test comment.

## 17. Fail-closed cube sweep

- [ ] 17.1 Enable `cube.test.ts` — run against all cells. Mark uninteresting cells explicitly in `SKIPPED_SCENARIOS` with reasons (e.g., "appimage-tmp × npm-g" = not a real combination).
- [ ] 17.2 Document in `packages/shared/src/__tests__/bootstrap/README.md`: how to add a scenario, how to add a skip, the snapshot-update workflow.

## 18. CI wiring

- [ ] 18.1 Confirm `npm test` runs the new suite (should be automatic — vitest picks up `*.test.ts`).
- [ ] 18.2 Verify snapshots are committed and stable across Windows/macOS/Linux CI.
- [ ] 18.3 Add a `test:bootstrap` script for running the harness in isolation (useful for fast iteration).

## 19. Documentation

- [ ] 19.1 Update `AGENTS.md` with a new "Bootstrap harness" subsection under testing, pointing to the README.
- [ ] 19.2 Update `docs/architecture.md` with a short section on bootstrap resolution and the harness.
- [ ] 19.3 Add an entry to `CHANGELOG.md` under `[Unreleased]`: "test: add in-memory bootstrap resolution harness (scenario matrix, trail snapshots)."

## 20. Handoff to downstream proposals

- [ ] 20.1 Confirm scenario B1 snapshot is the input to `unified-bootstrap-install` task "flip B1 from unresolved → resolves-via-managed."
- [ ] 20.2 Document lock-file-related cells as placeholder `.skip("lives in single-dashboard-per-home")` in `SKIPPED_SCENARIOS`. Remove when (3) lands.
