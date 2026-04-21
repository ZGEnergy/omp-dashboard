## 0. Precondition check

- [ ] 0.1 Verify `merge-windows-integration-linear` has landed on `develop`. Run `git log develop --grep="windows-integration-v3" --oneline` and confirm the merge commit exists. If not, STOP — this proposal requires v3's `platform/` + `tool-registry/` primitives.
- [ ] 0.2 Re-read `design.md §10` against current `packages/shared/src/tool-registry/strategies.ts` and confirm `StrategyDeps` still has the expected shape. If `resolveModule` has been added by another change, skip task 2.1.
- [ ] 0.3 Re-read `design.md §13` and confirm the Windows `npm i -g` bug still reproduces (see proposal 2's pre-work). If it's already fixed, update scenario B1's expected outcome to "resolves via managed" and note in the PR description.

## 1. Refactor prerequisites

- [ ] 1.1 Add `resolveModule(id: string, from: string): string | null` to `StrategyDeps` in `packages/shared/src/tool-registry/strategies.ts`. Default implementation uses `createRequire(from).resolve(id)`.
- [ ] 1.2 Update `bareImportStrategy` to call `deps.resolveModule(pkgName, anchorPath)` instead of inline `createRequire(...).resolve(...)`. Confirm existing tests still pass.
- [ ] 1.3 Add `getManagedDir(env?: { homedir?: string })` and `getManagedBin(env?: { homedir?: string })` functions to `packages/shared/src/managed-paths.ts`. Keep `MANAGED_DIR` and `MANAGED_BIN` constants for back-compat (they delegate to the getters with no arg → live env).
- [ ] 1.4 Update `managedBinStrategy` and `managedModuleStrategy` to call `getManagedBin(ctx.env)` / `getManagedDir(ctx.env)` when `ctx.env` is provided; fall back to constants otherwise.
- [ ] 1.5 Thread an optional `env: PlatformEnv` parameter through `ToolRegistry` constructor and `resolve()` method. Live default = `{ homedir: os.homedir(), platform: process.platform, cwd: () => process.cwd() }`.
- [ ] 1.6 Add optional `homedir?: string` parameter to `registerBridgeExtension(extensionPath, { homedir? })` in `packages/shared/src/bridge-register.ts`. Keep current `$HOME || USERPROFILE || os.homedir()` as default.

## 2. Harness foundation

- [ ] 2.1 Add `memfs` as a dev dependency of `packages/shared/`.
- [ ] 2.2 Create `packages/shared/src/__tests__/bootstrap/harness.ts` with `withFakeEnv({ platform, homedir, cwd, env, fs }, async (ctx) => ...)` — builds a `memfs` volume, produces a `createRegistry()` function wired with fake `exists`/`which`/`npmRootGlobal`/`resolveModule`, returns the computed `PlatformEnv`.
- [ ] 2.3 Implement `ctx.which(name)` lookup over the fake PATH: iterate PATH entries, check `${entry}/${name}` and (on win32) `${entry}/${name}.cmd`, `${entry}/${name}.exe`.
- [ ] 2.4 Implement `ctx.resolveModule(id, from)` over the fake fs: walk `from`'s ancestor `node_modules/` dirs, return path to `${dir}/node_modules/${id}/package.json` if it exists.
- [ ] 2.5 Implement `ctx.npmRootGlobal()` — reads a configured value from the fake env; defaults to `<homedir>/.npm/lib/node_modules` on posix, `<APPDATA>/npm/node_modules` on win32.

## 3. Fixtures library

- [ ] 3.1 Create `fixtures/electron-layout.ts` with `electronPackaged({ platform, pi?, openspec? })` returning fs layer mimicking `<resourcesPath>/server/packages/...` + `node_modules/node-pty/prebuilds/...`.
- [ ] 3.2 Create `fixtures/npm-global-layout.ts` with `npmGlobalUnix({ packages })` and `npmGlobalWindows({ packages, location: "appdata" | "programfiles" })`.
- [ ] 3.3 Create `fixtures/managed-install.ts` with `managedInstall({ homedir, pi?, openspec?, tsx? })` — populates `<homedir>/.pi-dashboard/node_modules/...` + `.bin/` shims.
- [ ] 3.4 Create `fixtures/dev-monorepo.ts` mimicking workspace layout (root `node_modules/`, packages/*/node_modules/).
- [ ] 3.5 Create `fixtures/settings-json.ts` with `settingsJson({ homedir, packages, malformed? })` — writes `<homedir>/.pi/agent/settings.json` with the given package array (or broken JSON if `malformed: true`).
- [ ] 3.6 Create `fixtures/pi-versions.ts` with helper to stamp a specific version into a fixture's `pi/package.json`.
- [ ] 3.7 Create a `layer(...layers)` helper that merges fs records (later layers override earlier — useful for "managed install has stale pi, global has newer").

## 4. Assertions

- [ ] 4.1 Create `assertions.ts` with `snapshotTrail(resolution, { homedir, npmRoot })` — normalizes paths (replaces homedir/npmRoot with `<HOME>`/`<NPM_ROOT>`, backslashes → forward-slashes) and emits the format in design §8.
- [ ] 4.2 Create `snapshotSettings(ctx)` that reads the fake settings.json and emits design §9 format with `before` captured at harness-create and `after` captured at read time.
- [ ] 4.3 Add a diff-based `snapshotSettingsDelta(before, after)` showing added/removed/preserved lines — primary assertion for bridge-registration scenarios.

## 5. Scenario registration + cube

- [ ] 5.1 Create `scenarios.ts` exporting `REGISTERED_SCENARIOS` (Map of cell-key → scenario fn) and `SKIPPED_SCENARIOS` (Map of cell-key → reason string).
- [ ] 5.2 Create `cube.ts` with `enumerateCube()` producing cell-keys `<platform>/<dash>/<pi>/<bridge>/<settings>/<env>`. Unit scenarios first (only cells in the ~25 curated list); add a single expansion axis per follow-up.
- [ ] 5.3 Add `cube.test.ts` — fails if any cell is neither in `REGISTERED_SCENARIOS` nor `SKIPPED_SCENARIOS`. Error message lists unclassified cells + suggests where to add them.

## 6. Family A — electron-packaged

- [ ] 6.1 `a1-electron-fresh.test.ts` — scenario A1 for platforms win/mac/lin. Assert pi unresolved (all strategies miss), trail snapshot captures the chain.
- [ ] 6.2 `a2-electron-prewarmed.test.ts` — A2. Assert pi resolves to `managed`, openspec to `managed`, bridge registered matches bundled path.
- [ ] 6.3 `a3-electron-global-pi.test.ts` — A3. Assert strategy order prefers managed over npm-g per current definitions.ts (verify — this may be wrong direction; snapshot captures whatever today's order is).
- [ ] 6.4 `a4-electron-appimage-fresh.test.ts` — linux only. Assert `findBundledExtension` returns null, warning logged, settings.json unchanged.

## 7. Family B — npm-global

- [ ] 7.1 `b1-npm-g-dash-only.test.ts` — ⚠ captures the Windows bug. Assert pi resolution fails, trail matches snapshot. Include a comment: "FIXED-BY: unified-bootstrap-install; update this snapshot when that lands."
- [ ] 7.2 `b2-npm-g-full.test.ts` — pi + openspec resolve to npm-g. Windows variant asserts `toArgv` prepends node.exe.
- [ ] 7.3 `b3-npm-g-pi-installed-first.test.ts` — pi present, bridge NOT in settings. Call `registerBridgeExtension(bundledPath)`. Assert settings.json gains the entry; no other entries disturbed.

## 8. Family C — dev monorepo

- [ ] 8.1 `c1-dev-monorepo.test.ts` — mac/linux. Assert bare-import resolves pi via workspace layout.
- [ ] 8.2 `c2-dev-monorepo-win.test.ts` — Windows variant; assert same resolution + `toArgv` Node prepend.

## 9. Family D — overrides

- [ ] 9.1 `d1-override-valid.test.ts` — set override in fake `tool-overrides.json`. Assert resolved path = override, source = "override".
- [ ] 9.2 `d2-override-invalid.test.ts` — override path doesn't exist. Assert strategy returns `ok: false, reason: "invalid: ..."`, chain falls through to next.

## 10. Family E — stale / broken managed

- [ ] 10.1 `e1-stale-managed.test.ts` — managed pi version 0.0.1; expected >= some floor. Assert resolves anyway + warning logged. Note: version-skew check may live in dependency-detector, not strategy — adjust assertion accordingly.
- [ ] 10.2 `e2-managed-partial.test.ts` — pi package.json exists but no dist/cli.js. Assert strategy returns not-found reason, falls through.

## 11. Family F — cwd variants

- [ ] 11.1 `f1-cwd-spaces.test.ts` — all platforms. Assert resolution happens regardless of cwd. For spawn test, assert argv doesn't require cwd escaping (registry doesn't compose cwd; just verify no crash).
- [ ] 11.2 `f2-cwd-unicode.test.ts` — Greek/Cyrillic/emoji in cwd. Same assertion.

## 12. Family G — Windows specifics

- [ ] 12.1 `g1-win-cmd-shim.test.ts` — pi installed as .cmd; assert resolved path + `toArgv` = `[node.exe, cli.js]`.
- [ ] 12.2 `g2-win-appdata-roaming.test.ts` — APPDATA set; npm-g in `%APPDATA%\Roaming\npm`. Assert strategy finds.
- [ ] 12.3 `g3-win-programfiles-cwd.test.ts` — cwd = `C:\Program Files (x86)\Pi Dashboard`. Assert resolution unaffected.
- [ ] 12.4 `g4-win-programfiles-node.test.ts` — node binary at `C:\Program Files\nodejs\node.exe`. Assert `toArgv` references that path.

## 13. Family H — HOME drift

- [ ] 13.1 `h1-home-drift-git-bash.test.ts` — win32, `$HOME=/c/Users/r`, `USERPROFILE=C:\Users\r`, `os.homedir()=C:\Users\r`. Call `registerBridgeExtension()` + `detectBridgeExtension()`. Assert both hit the same settings.json path.
- [ ] 13.2 `h2-home-symlink.test.ts` — mac/linux. homedir is a symlink. Assert realpath resolution (if any) lands consistent.

## 14. Family I — malformed settings

- [ ] 14.1 `i1-malformed-settings.test.ts` — settings.json contains `{broken`. Assert `registerBridgeExtension` throws actionable error (or explicitly bails — document chosen semantic).
- [ ] 14.2 `i2-settings-other-packages.test.ts` — settings.json has unrelated extensions. Assert they're preserved after bridge registration.

## 15. Family J — minimal PATH

- [ ] 15.1 `j1-path-gui-minimal.test.ts` — mac/lin only. PATH=`/usr/bin`. pi installed via npm-g at `/usr/lib/node_modules`. Assert npm-g strategy finds (uses `npmRootGlobal`, not PATH).

## 16. Family K — dashboard absent

- [ ] 16.1 `k1-dashboard-absent.test.ts` — no dashboard binary anywhere. Assert registry.resolve behaviors don't crash; bridge exists but points nowhere useful (bridge-extension may no-op on no server — verify observed behavior).

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
