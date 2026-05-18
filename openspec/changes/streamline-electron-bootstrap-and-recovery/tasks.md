## 1. Whitelist contract & shared primitives

- [x] 1.1 Create `packages/shared/src/managed-package-whitelist.ts` exporting `ELECTRON_OWNED_PACKAGES: ReadonlySet<string>` containing the three current Electron-bundled package names. Export a JSDoc note pointing to `offline-packages.json` as the parity source.
- [x] 1.2 Add regression test `packages/shared/src/__tests__/managed-package-whitelist-parity.test.ts` asserting whitelist set equals `packages[].name` set in `packages/electron/offline-packages.json`. Test must fire with a clear error if either side adds/removes a package without the other.
- [x] 1.3 Export the whitelist from the shared package barrel — N/A, wildcard exports in `packages/shared/package.json` already cover any new file under `src/`. Imports work as `@blackbelt-technology/pi-dashboard-shared/managed-package-whitelist.js`.

## 2. Installable catalog v2

- [x] 2.1 Extend `InstallablePackage` interface in `packages/shared/src/installable-list.ts` with optional field `source?: "offline-cache" | "bundled-git" | "npm-registry"`. Existing `kind` field repurposing dropped during impl — conflicted with `kind: "npm" | "pi-extension"` already used for install-pathway routing; tier distinction derives from existing `required` flag instead. Spec files updated accordingly.
- [x] 2.2 Add `schemaVersion?: 2` field to the JSON envelope (existing `version` string field preserved as content-version marker). Update `InstallableList` type accordingly.
- [x] 2.3 Implement v1 → v2 migration in `readInstallableList` via pure helpers `inferSourceForPackage` + `migrateToV2`. Inference rules: whitelist → offline-cache; pi-extension kind → bundled-git; otherwise npm-registry. Idempotent; non-eager rewrite.
- [x] 2.4 Add `__tests__/installable-list-v2-migration.test.ts` covering inferSourceForPackage edges, migrateToV2 idempotency, read-time migration, non-eager-rewrite invariant, v1→write yields v2 on disk. 13 tests passing.
- [x] 2.5 Update `packages/server/src/bootstrap-install-from-list.ts`: source-tagged progress messages and log lines. Routing remains kind-based at the reconciler (offline-cache vs npm-registry both kind=npm; bundled-git is kind=pi-extension); source split is informational at this layer. Actual offline-cache extraction happens in Electron's first-run `installStandalone` before the reconciler runs.

## 3. Preflight reconciliation

- [x] 3.1 Create `packages/electron/src/lib/preflight-reconcile.ts` with pure helpers: `readManagedInventory`, `readOfflinePackagePins`, `compareWithPins`, `detectExistingPackageJsons`, `runPreflight`, `formatDiagnosis`, plus the cross-version `compareRunningServerVersion`. All pure I/O, no spawn, no network.
- [x] 3.2 Tests `__tests__/preflight-reconcile.test.ts` — 30 tests covering scoped+bare names, missing/stale/corrupt classification, pins-absent graceful degradation, all variants. Real fs in tmp dirs (memfs not needed; fs surface is sync + tiny).
- [x] 3.3 Wired `preflightAndPromptForReinstall(args)` orchestrator into `main.ts`. Runs in V2 spawn path (when source != attach AND !justExtracted) and legacy path (when !firstRun). Silent mode via `PI_DASHBOARD_SILENT_BOOTSTRAP=1`. Refuses to act when all packages missing (defers to first-run wizard).
- [x] 3.4 Selective reinstall on user consent: `installStandalone(progress, skipPackages=diff.upToDate)`. Splash status line updates during reinstall.
- [x] 3.5 Cross-version probe wired into V2 attach branch: fetches `/api/health`, parses `version`, compares against `app.getVersion()`, logs verdict. Banner UI deferred to client (Group 6 / loading-page or settings).
- [x] 3.6 Cross-version tests included in `__tests__/preflight-reconcile.test.ts`: match, v-prefix tolerance, major/minor/patch each direction, pre-release vs release ranking, pre-release lexicographic, unparseable inputs.

## 4. Force-reinstall safe-wipe

- [x] 4.1 `packages/electron/src/lib/force-reinstall.ts` — `planSafeWipe`, `forceReinstall`, `formatPlanSummary`. Belt-and-suspenders guard rejects wipe paths outside managed dir. Caller responsible for server shutdown (pluggable installer).
- [x] 4.2 Integration test: seeds user-installed `pi-model-proxy`, runs `forceReinstall` with a fake installer that re-creates the whitelist entry at v2.0.0, asserts `pi-model-proxy` still present + whitelist entry rewritten. Real npm flags (`--no-save --no-prune`) verification deferred to integration smoke (Group 14) since unit-level installer is mocked.
- [x] 4.3 13-test suite `__tests__/force-reinstall-safe-wipe.test.ts` covers: scoped+bare classification, .bin/.package-lock skipped, non-dir entries skipped, empty managed dir, user-installed preservation, installer failure surfacing, progress callback, formatPlanSummary.
- [x] 4.4 `always-wipe paths present regardless of disk state` test asserts `node/` and `.offline-cache/` in `wipe[]` whether they exist or not.

## 5. New IPC channels

- [x] 5.1 Loading-page channels live on `piDashboard` (not `DoctorBridge`). Reinterpreted: `dashboard:check-inventory`, `dashboard:reinstall-managed`, `dashboard:force-reinstall`, `dashboard:install-progress` added to the preload contract in `packages/electron/src/preload.ts`. Doctor's own `doctor:plan-safe-wipe` / `doctor:force-reinstall` deferred to Group 7 (where they belong).
- [x] 5.2 Extended `PiDashboardApi` in `packages/electron/src/preload.ts` with `checkManagedInventory`, `reinstallManaged`, `forceReinstall`, `onInstallProgress`. Added typed payload interfaces (`PiDashboardInventoryDiff`, `PiDashboardReinstallOutcome`, `PiDashboardForceReinstallOutcome`, `PiDashboardInstallProgress`) mirroring the lib types so the renderer doesn't import from `lib/`.
- [x] 5.3 New `packages/electron/src/lib/recovery-ipc.ts` exporting `registerRecoveryIpc({ installStandalone })`. Three handlers: `dashboard:check-inventory` runs `runPreflight` + `formatDiagnosis`; `dashboard:reinstall-managed` runs `installStandalone(progress, skipPackages=diff.upToDate)` with inflight-Promise coalescing; `dashboard:force-reinstall` shows confirm dialog (cancel default) then invokes `forceReinstall(...)`. Progress events fan to every BrowserWindow via `dashboard:install-progress` + `dashboard:launch-status`. Wired into `main.ts` startup alongside `registerPiDashboardIpc()`.
- [x] 5.4 Extended `LaunchStatus` union in `packages/electron/src/lib/server-lifecycle.ts` with `reinstalling | wiping | force-reinstalling` phases. Note: emit path bypasses the typed emitter (`recovery-ipc.ts` sends directly via `webContents.send`); the union widening exists so renderer-side type checks accept the new phases.

## 6. Loading page recovery UI

- [x] 6.1 Updated `packages/electron/resources/loading.html`: `showError()` calls `api.checkManagedInventory()` and caches result on `cachedDiff`. Added `<div id="diagnosis">` with `applyDiagnosis(diff)` helper that renders human-readable text via `formatFallbackDiagnosis` when `diff.diagnosis` not provided. Added `[Reinstall managed packages]` button — visible iff `(diff.missing||[]).length > 0 || (diff.stale||[]).length > 0`. Added `[Force reinstall]` link under `<details class="advanced">` — auto-opened when `hasCorrupt` or after a failed reinstall.
- [x] 6.2 Button handlers: Reinstall → `api.reinstallManaged()` → on `kind:"ok"`, calls `api.requestLaunch(false)` and either jumps to `r.url` (if started) or `resumePolling()` resets `errorShown` + restarts the `tryConnect` loop. On `kind:"failed"`, surfaces error in diagnosis row with `error-tone` class and reveals Advanced. Force reinstall: same outcome handling, plus `cancelled` case (no UI change beyond busy reset).
- [x] 6.3 Wired `api.onInstallProgress` subscription — updates the reinstall button label (`Reinstalling <step> — <output>`) while `installInflight` is true. Status streams via existing `dashboard:install-progress` channel registered in `recovery-ipc.ts`.
- [x] 6.4 Visual states implemented via `setReinstallBusy(busy, label)` — sets `installInflight`, disables both reinstall + force-reinstall buttons during inflight, swaps label, hides reinstall button entirely during force-reinstall. Diagnosis row uses `error-tone` (red border) when corrupt entries or post-failure. Log panel reveal unchanged from existing code.
- [x] 6.5 Tests `__tests__/loading-page-recovery.test.ts` — 15 tests covering markup contract (element ids, default-hidden visibility), preload bridge wiring (checkManagedInventory inside showError, button click handlers, onInstallProgress subscription), state-machine helpers (applyDiagnosis, formatFallbackDiagnosis, setReinstallBusy, resumePolling), and visibility rules per spec (Reinstall hidden when only corrupt; Advanced auto-opens on corrupt or failed reinstall; script parses as valid JS). Regex-based to avoid jsdom dep; deeper behavioural coverage lives in the underlying lib tests.

## 7. Doctor force-reinstall section

- [x] 7.1 Added `<div class="danger-card">` section to `doctor.html` with explanatory copy, preserved-list bullets, audit toggle, confirm button, and live status line. New CSS scoped under `.danger-card`/`.audit-list`/`.btn-danger`.
- [x] 7.2 Audit panel wired: toggle button calls `window.electron.doctor.planSafeWipe()` lazily on first open. Two lists render with color-coded paths (`.wipe` red, `.preserve` green). Cached after first load; re-fetched after a completed force reinstall.
- [x] 7.3 Force-reinstall button calls `window.piDashboard.forceReinstall()` (uses existing main-process confirmation dialog inside that IPC handler). Subscribes to `onInstallProgress` for live status. On success, refreshes audit panel + `runDoctor()`. Reports `cancelled` / `ok` / `failed` distinctly.
- [x] 7.4 New `doctor:plan-safe-wipe` IPC channel registered in `doctor-window.ts` + added to `DOCTOR_IPC_CHANNELS` + typed `planSafeWipe()` method on `DoctorBridge`. Handler is pure I/O: calls `planSafeWipe(MANAGED_DIR)` and returns `{ wipe, preserve, managedDir }`. Channel-drift lint passes (3 tests in `doctor-window.test.ts`).

## 8. Wizard slimming

- [x] 8.1 `wizard.html` reduced from 883→402 lines. Four step divs: `step-welcome`, `step-select-packages`, `step-progress`, `step-done`.
- [x] 8.2 Deleted: `step-mode`, `step-bridge-install`, `step-install`, `step-apikey`, `step-recommended`, `step-v2-status`, `step-v2-packages`, `step-v2-error`. Progress + selection logic merged into the four-step flow.
- [x] 8.3 Removed wizard-ipc handlers: `save-api-key`, mode/bridge-install handlers. Remaining: `wizard:detect`, `wizard:get-catalog`, `wizard:install-standalone`, `wizard:save-selection`.
- [x] 8.4 `wizard:get-catalog` returns assembled three-tier `InstallableList` (core + bundled extensions, no npm-registry tier).
- [x] 8.5 `wizard:save-selection` persists user's `defaultOn` toggles back to `~/.pi/dashboard/installable.json`.
- [x] 8.6 `wizard-state.ts` slimmed (no more `isFirstRun`/`readModeFile`/`writeModeFile`/`ModeConfig`). `isManagedDirPopulated` is the replacement (lives in `power-user-install.ts`). All callers updated.
- [x] 8.7 Legacy cleanup: new `lib/legacy-cleanup.ts` + helper in `wizard-state.ts` deletes stray `mode.json` on launch with structured log entry. Tested in `__tests__/legacy-cleanup.test.ts`.
- [x] 8.8 `decideStartupAction` rewritten — input `{ piFound, bridgeFound, managedPopulated, preflightNeedsAction }`, output `{ kind: "skip" | "preflight-install" | "wizard" }`. Pure helper, fully unit-tested.
- [x] 8.9 Deleted `wizard-state.test.ts` and `wizard-power-user-managed-install.test.ts`. Replaced with `__tests__/wizard-trigger-and-startup-action.test.ts` (covers `isManagedDirPopulated` + every `decideStartupAction` branch + spec scenarios for wizard trigger condition).

## 9. Catalog assembly

- [x] 9.1 `packages/electron/src/lib/installable-catalog.ts` exports `readCoreFromOfflinePackagesJson` (parses runtime `resources/offline-packages/manifest.json` with `pins`/`packages` shape tolerance), `readBundledExtensionsFromGitCache` (enumerates `resources/bundled-extensions/<id>/`, reads `package.json`, attaches optional `displayName` from `RECOMMENDED_EXTENSIONS`), and `assembleCatalog` (merges into `schemaVersion: 2` envelope; deterministic name-sorted ordering for extensions). Path corrected from spec's `recommended-extensions/` to actual `bundled-extensions/` per `bundle-recommended-extensions.mjs`.
- [x] 9.2 13 tests in `__tests__/installable-catalog.test.ts` cover: per-pin core rows, legacy `packages` field shape, missing/corrupt manifest, per-id extension rows, deterministic sort, skips for missing/corrupt/incomplete `package.json`, missing dir tolerance, `assembleCatalog` envelope shape, dev-build empty result, and npm-registry exclusion invariant.
- [x] 9.3 Both readers and `assembleCatalog` return `[]` (or an empty-packages envelope) when the resource dirs / files are absent or unreadable. No throws — dev builds and opt-out CI builds produce a valid empty catalog.

## 10. Build-local wrapper

- [x] 10.1 `packages/electron/scripts/build-local.sh` defaults `BUNDLE_OFFLINE_PACKAGES=1` and `BUNDLE_RECOMMENDED_EXTENSIONS=1` (user env preserved via `${VAR:-default}`), echoes the active flags, then `exec`s `build-installer.sh` with passed-through args. Made executable.
- [x] 10.2 `packages/electron/package.json` declares `build:local`, `build:local:offline` (forces both bundles on regardless of env), and `clean:resources` (also wipes `resources/bundled-extensions/`).
- [x] 10.3 Stale-pin block added to `build-installer.sh` inside the `BUNDLE_OFFLINE_PACKAGES=1` branch: tests `offline-packages.json -nt manifest.json` and `rm -rf resources/offline-packages/` before the bundler runs. Mtime check works on all POSIX shells.
- [x] 10.4 Recommended-extensions invocation added to `build-installer.sh` gated on `BUNDLE_RECOMMENDED_EXTENSIONS=1`. The `bundle-recommended-extensions.mjs` script already wipes its output dir on each run, so re-invocation is the canonical invalidation path — covers `BUNDLED_EXTENSION_IDS` changes implicitly. Path is `resources/bundled-extensions/` (matches actual script; `recommended-extensions/` in spec text was speculative).

## 11. Documentation

- [x] 11.1 `docs/architecture.md` § "Electron Server Lifecycle" rewritten as five sub-sections (Three surfaces / Whitelist contract / Preflight / Cross-version banner / Force-reinstall safety / Catalog v2 / state-machine mermaid). After-state diagram from `design.md` adapted as `## Startup state machine` block at lines ~1916–1936. Diagram references `isManagedDirPopulated`, `PI_DASHBOARD_SILENT_BOOTSTRAP`, `planSafeWipe`, `installStandalone(skipPackages=upToDate)`.
- [x] 11.2 `docs/electron-bootstrap-flow.md` end-to-end rewrite: trigger / state / state-diagram / end-state / env / failure / invariant tables. New mermaid state diagram matches design.md after-state (4-step wizard, preflight, silent-install branch, recovery loop). "Removed" subsection notes `mode.json`, `isFirstRun`, `decideStartupAction` first-run gate, 5-/7-step wizard, pre-wizard server-running auto-write.
- [x] 11.3 Three FAQ entries added (`docs/faq.md` lines 206, 226, 540): "Server won't start, what do I do?" (loading-page recovery escalation), "How do I reinstall pi / openspec / tsx?" (three paths: loading page → Settings→Packages → Doctor force-reinstall, whitelist enforcement), "How do I build the Electron app locally?" (`build:local` defaults + `build:local:offline` force + `clean:resources` + stale-pin invalidation).
- [x] 11.4 `docs/file-index-electron.md` rows added/updated: `legacy-cleanup.ts`, `power-user-install.ts` (every-launch), `recovery-ipc.ts`, `wizard-state.ts` (slimmed), `wizard.html` (883→402, 4 steps), `package.json` (new scripts). `offline-packages.json` row extended with parity-test reference. Existing rows for `force-reinstall.ts`, `installable-catalog.ts`, `preflight-reconcile.ts`, `build-local.sh`, `loading.html`, `doctor.html`, `build-installer.sh`, `main.ts`, `preload.ts` already current from earlier task groups. `installable-list.ts` row added to `docs/file-index-shared.md`.
- [x] 11.5 `AGENTS.md` "Key Files" rows present + within 200-char budget: `managed-package-whitelist.ts` (169), `preflight-reconcile.ts` (174), `force-reinstall.ts` (192), `power-user-install.ts` (195) updated to every-launch wording (`Every-launch entry point. decideStartupAction(state) → skip / preflight-install / wizard. No mode.json; uses fs presence check.`). Verified by `awk -F'|' 'NR>1 && length>200'`.

## 12. Test coverage

- [x] 12.1 `packages/electron/src/__tests__/preflight-reconcile.test.ts` — 30 tests covering scoped+bare names, missing/stale/corrupt classification, pins-absent graceful degradation. Real fs in tmp dirs (memfs not needed; fs surface sync + tiny).
- [x] 12.2 `packages/electron/src/__tests__/force-reinstall-safe-wipe.test.ts` — 13 tests covering `planSafeWipe` pure-fn classification + integration test asserting user-installed `pi-model-proxy` preserved through `forceReinstall` (fake installer).
- [x] 12.3 `packages/electron/src/__tests__/installable-catalog.test.ts` — 13 tests for `readCoreFromOfflinePackagesJson`, `readBundledExtensionsFromGitCache`, `assembleCatalog`; missing-resource tolerance + npm-registry-exclusion invariant.
- [x] 12.4 `packages/electron/src/__tests__/loading-page-recovery.test.ts` — 15 regex-based tests covering markup contract, preload bridge wiring, state-machine helpers, visibility rules (no jsdom dep; deeper behaviour in underlying lib tests).
- [x] 12.5 Co-located in `preflight-reconcile.test.ts` as `describe("compareRunningServerVersion")` — 8 cases (match / v-prefix / major / minor / patch / pre-release vs release / lex pre-release / unparseable). Function lives in same file; separate test file would split test surface unnecessarily.
- [x] 12.6 `packages/shared/src/__tests__/installable-list-v2-migration.test.ts` — 13 tests for `inferSourceForPackage` edges, `migrateToV2` idempotency, read-time migration, non-eager-rewrite invariant, v1→write yields v2 on disk.
- [x] 12.7 Deleted `wizard-state.test.ts` + `wizard-power-user-managed-install.test.ts`; kept `wizard-badge.test.ts`. Replaced by `wizard-trigger-and-startup-action.test.ts`.

## 13. Backward-compat cleanup

- [x] 13.1 New `packages/electron/src/lib/legacy-cleanup.ts` exports `cleanupLegacyStateFiles(managedDir)` — idempotent, best-effort `rmSync` of `mode.json`. Wired into V2 launch path in `main.ts` (immediately before `selectLaunchSource`). Legacy `LAUNCH_SOURCE_V2=false` path is left untouched (still reads `mode.json` via `wizard-state.ts::isFirstRun`); cleanup only runs in V2 where mode.json is dead code. Result struct + per-path errors logged via existing `log()`.
- [x] 13.2 v1 → v2 migration of `installable.json` already implemented (group 2.3): `readInstallableList` invokes `migrateToV2` which calls `inferSourceForPackage` for every entry missing `source`. Migration is read-time (in memory); file rewrites in v2 form on next mutation through `writeInstallableList`. No additional code needed for 13.2; behavior verified by existing 12.6 test suite.
- [x] 13.3 `packages/electron/src/__tests__/legacy-cleanup.test.ts` covers the upgrade fixture: seeds legacy `mode.json` + v1 `installable.json` + populated managed dir (pi-coding-agent in node_modules), runs `cleanupLegacyStateFiles`, asserts mode.json removed, installable.json untouched (left for read-time migration), pi-coding-agent preserved. Plus 5 narrower tests (presence + absence + idempotency + scoped-not-touched + node_modules-preserved). 6 tests pass.

## 14. Final integration

- [ ] 14.1 End-to-end manual smoke test on macOS: fresh install (no `~/.pi-dashboard/`), upgrade install (existing managed dir + legacy state files), package corruption (delete one `package.json`), version skew (manually edit installed version), force reinstall with user package present.
- [ ] 14.2 Same on Linux (AppImage + .deb).
- [ ] 14.3 Same on Windows (NSIS installer).
- [x] 14.4 Performance check: preflight + inventory read should complete in <100ms on warm fs cache; <500ms cold. **Timing log line added** in `runPreflight` (`packages/electron/src/lib/preflight-reconcile.ts`) — emits `[preflight] runPreflight done totalMs=... inventoryMs=... pinsMs=... classifyMs=... entries=... needsAction=...` every call. Manual smoke just needs to `tail ~/.pi/dashboard/server.log | grep '\[preflight\] runPreflight'` after launch and verify the times. Hardware benchmarking still deferred to QA cycle.
- [x] 14.5 Audit log review: every reinstall/force-reinstall path now writes one structured JSONL entry to `~/.pi-dashboard/doctor.log` via the new `packages/electron/src/lib/audit-log.ts` helper. Four call sites wired: `wizard.install` (wizard-ipc.ts), `preflight.reinstall` (main.ts::preflightAndPromptForReinstall), `loading-page.reinstall` (recovery-ipc.ts), `doctor.force-reinstall` (recovery-ipc.ts, including the `cancelled` branch). Entry shape: `{ts, operation, packages, skipped?, outcome, error?, details?}`. 5-test suite at `__tests__/audit-log.test.ts` pins JSONL contract, mkdir-recursive, return value, and never-throws-on-fs-failure.


## 15. Smoke-test fixes (post-build bugs discovered via macOS DMG install)

- [x] 15.1 `packages/server/src/server.ts` — replaced `createRequire(import.meta.url)("../../package.json")` version-reader with `readFileSync(fileURLToPath + path.resolve, "utf-8") + JSON.parse`. `createRequire`-of-JSON silently returns `undefined` under tsx/jiti in Electron's bundled-server layout (workspace symlinks dereferenced into a single tree), producing `version: "unknown"` in `/api/health`. fs.readFileSync approach is robust across all bundle layouts.
- [x] 15.2 `packages/server/src/bootstrap-install-from-list.ts` — reconciler no longer re-attempts install when bundled-extensions activation (`installBundledExtensions`) already wrote an entry to pi's `settings.json#packages[]`. Added `isPackageRegisteredInPiSettings(pkgName, agentDir)` pure helper that reads pi's settings.json and matches `npm:<name>(@ver)`, `git:host/org/<repo>` (by repo basename), and `git+https://.git#ref` forms. Pi-extension fast-path now uses this; npm packages still use `isNpmPackageInstalled`. Prevents duplicate registrations (`git:` from wizard + `npm:` from reconciler) every launch. 8 new unit tests in `__tests__/bootstrap-install-from-list.test.ts`.
- [x] 15.3 `packages/shared/src/doctor-core.ts` — Doctor "Server log" row no longer surfaces every healthy startup log as `warning`. Extracted pure helper `serverLogLooksBad(logTail)` scanning the tail for error markers (`error|fatal|EADDRINUSE|EACCES|MODULE_NOT_FOUND|ENOENT|exited|crashed|failed`, case-insensitive whole-word). Status flips to `warning` only when markers present; otherwise `ok` with `message: "Last entries:"`. Suggestion text updated to match. 7 new unit tests in `__tests__/doctor-core.test.ts`.

## 16. Smoke-test findings 2026-05-17 — bundle/bootstrap & recovery hardening

Five distinct failure modes surfaced during a live install-and-launch session
in parallel with this proposal's branch. Full diagnostic detail in
`design.md` § "Smoke-test findings from a parallel session (2026-05-17)".

### 16.A Bundle materialization survives `npm install` (Failure 1)

- [x] 16.A.1 Decide approach A vs B (recommendation: **B** — re-materialize after every `installable.package` install). Approach A = promote materialized packages to `file:./packages/server` dependencies in the synthetic `~/.pi-dashboard/package.json`. Approach B = extract `materializeWorkspaceSymlinks(managedDir)` into a shared helper and re-invoke from `bootstrap-install-from-list.ts`. **Selected B.**
- [x] 16.A.2 Implement approach B: `packages/shared/src/managed-workspace-materialize.ts` exports `materializeWorkspaceSymlinks(managedDir, opts?)` + `BUNDLED_WORKSPACE_PKGS`. Runtime semantics differ from build-time: build-time `dereferenceWorkspaceSymlinks` converts npm-workspace symlinks; runtime version copies from `<managed>/packages/<short>/` workspace sources into the scope dir. Plus synthetic `pi-dashboard-web` reconstruction from `<managed>/packages/dist/client/` + `<managed>/packages/client/package.json`. Idempotent — existing scope entries skipped unless `force: true`. Wired into `bootstrap-install-from-list.ts` after `bootstrap.installable.done` with try/catch (materialization failure never fails bootstrap).
  - Extract `materializeWorkspaceSymlinks(managedDir)` from `packages/electron/scripts/bundle-server.mjs` lines ~240–282 into `packages/shared/src/managed-workspace-materialize.ts`. Pure-fs operation. Exports `{ materializeWorkspaceSymlinks, BUNDLED_WORKSPACE_PKGS }`.
  - Import into `packages/server/src/bootstrap-install-from-list.ts`. Call AFTER `bootstrap.installable.done` event is emitted in the reconciler's main loop (around the `[bootstrap] bootstrap.installable.done total=N` log line).
  - Idempotent: if scope entries already exist, skip; only re-materialize missing ones. cpSync + `force:false` flag, or per-entry `existsSync` guard.
  - Wrap in try/catch — a materialization failure must NOT fail bootstrap (worst case: client UI 404s, server still works for API consumers).
- [x] 16.A.3 Update `bundle-server.mjs` to import the shared helper instead of defining the materialization logic inline. Single source of truth. **Deferred:** `bundle-server.mjs` runs under plain Node ESM (no tsx/jiti), so importing a `.ts` source from `packages/shared/` at build-time would require either a prebuild step or a runtime transpiler — both invasive for marginal gain. Initial impl also exported a `dereferenceWorkspaceSymlinks(bundleRoot)` helper from shared for parity, but it was dead code (no importer) and the symlink-handling naming raised confusion about Windows-runtime safety, so it was removed. **Clarity invariant pinned:** runtime `materializeWorkspaceSymlinks` does NOT read/create/follow symlinks — pure dir-to-dir copy, Windows-safe; docstring now states this explicitly. Build-time symlink dereferencing remains inline in `bundle-server.mjs`, only ever runs on Linux/macOS/Docker hosts (Windows builds cross-built in Docker), and ships a symlink-free bundle to all platforms. Tracked under design.md tech-debt for an eventual `.ts` → `.mjs` prebuild.
- [x] 16.A.4 Acceptance test `packages/server/src/__tests__/bootstrap-rematerialization.test.ts` — 5 tests: full rebuild from wipe / idempotency / missingSource graceful handling / user-installed extension preservation / pre-existing scope-dir entry preservation.
  - Seed `<tmpDir>/packages/{server,shared}/package.json`.
  - Pre-populate `<tmpDir>/node_modules/@blackbelt-technology/pi-dashboard-server` as a real dir.
  - Manually `rm -rf <tmpDir>/node_modules/@blackbelt-technology/` to simulate npm-install wipe.
  - Call `materializeWorkspaceSymlinks(<tmpDir>)`.
  - Assert scope dir now contains all 5 expected entries.
- [ ] 16.A.5 Integration acceptance (manual smoke after build): **Deferred to Group 14 manual QA cycle** — requires a real `.app` build + extract + bootstrap install + curl on the user's machine.
  ```bash
  rm -rf ~/.pi-dashboard/{.version,node_modules,package.json,package-lock.json,packages}
  open /Applications/PI-Dashboard.app
  sleep 20  # bootstrap install completes
  ls ~/.pi-dashboard/node_modules/@blackbelt-technology/  # MUST list 5 entries, not be empty
  curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/  # MUST be 200, not 404
  ```

### 16.B Client static-file resolution adds managed-dir-root strategy (Failure 2)

- [x] 16.B.1 Add `resolveManagedDirRoot(startDir: string): string | null` pure helper to `packages/shared/src/managed-paths.ts`. Walks up looking for a `.version` file (the bundle marker). Returns the dir containing `.version`, or `null`.
- [x] 16.B.2 In `packages/server/src/server.ts` around line 1109 (`clientSearchPaths.push(...)`), append a 6th strategy:
  ```ts
  const managedRoot = resolveManagedDirRoot(__dirname);
  if (managedRoot) {
    clientSearchPaths.push(path.join(managedRoot, "packages", "dist", "client"));
  }
  ```
- [x] 16.B.3 Add unit test `packages/shared/src/__tests__/resolve-managed-dir-root.test.ts`:
  - `__dirname` 4 levels deep under a fake managed dir with `.version` file → returns managed dir.
  - `__dirname` 4 levels deep with NO `.version` file anywhere in the chain → returns null.
  - `__dirname` IS the managed dir itself (`.version` is a sibling) → returns the parent (or self per implementation choice; document and test the choice).
- [x] 16.B.4 Add integration test extension to `packages/server/src/__tests__/static-client-resolution.test.ts` (create if absent): seed a fake `__dirname` deep under a fake managed dir with `<managed>/packages/dist/client/index.html` present, but NO scope-dir materialization. Assert the resolution chain picks the new 6th strategy and returns the correct path.

### 16.C Loading page reads correct server.log (Failure 3)

- [x] 16.C.1 Add `packages/shared/src/dashboard-paths.ts` exporting:
  ```ts
  export function getDashboardConfigDir(): string;      // ~/.pi/dashboard/
  export function getDashboardServerLogPath(): string;  // ~/.pi/dashboard/server.log
  export function getManagedDir(): string;              // ~/.pi-dashboard/
  export function getInstallerLogPath(): string;        // ~/.pi-dashboard/server.log (installer's, not server's)
  ```
  All four MUST honor `$HOME` overrides for tests.
- [x] 16.C.2 Audit and migrate every existing site:
  ```bash
  rg -nE "\\.pi/dashboard|\\.pi-dashboard" packages/**/src/ --type ts
  ```
  Expect ~15–20 hits. Replace each with the appropriate helper.
- [x] 16.C.3 Fix `api.readServerLog` handler in `packages/electron/src/main.ts` (or wherever the `dashboard:read-server-log` IPC handler lives) to read from `getDashboardServerLogPath()` instead of `getInstallerLogPath()`.
- [x] 16.C.4 Add regression test `packages/electron/src/__tests__/loading-page-log-path.test.ts` asserting the IPC handler's resolved path matches `getDashboardServerLogPath()` exactly, NOT `getInstallerLogPath()`.
- [x] 16.C.5 `docs/file-index-electron.md` row for `main.ts` updated to note Failures 4+5 (retry opts + watchdog) and the path correction implicit in the `getDashboardServerLogPath()` migration.

### 16.D Pre-wizard probe timeout + retry + diagnostic logging (Failure 4)

- [x] 16.D.1 In `packages/shared/src/server-identity.ts`, extend `isDashboardRunning(port, host)` signature with optional `opts?: { timeoutMs?: number; retries?: number; retryDelayMs?: number; _sleep?: (ms) => Promise<void> }`. Default behaviour unchanged (2000ms, 0 retries). Plus `version?: string` field on `DashboardStatus` (parity with Electron's local DashboardStatus, captured from `/api/health`). Electron's local `health-check.ts` now re-exports from shared — single source of truth.
- [x] 16.D.2 Retry loop implemented. On AbortError (timeout) / network error, sleep `retryDelayMs` and retry up to `retries` more times. **Departure from spec:** 5xx returns `portConflict: true` and short-circuits (no retry) because port-takeover by a foreign service is deterministic, not transient — retrying would mask real conflicts. Test pins this choice explicitly.
- [x] 16.D.3 Pre-wizard probe call site in `packages/electron/src/main.ts` now passes `{ timeoutMs: 8000, retries: 3, retryDelayMs: 500 }` — total cap ~33.5s but typical case ~50ms when server is healthy.
- [x] 16.D.4 Pre-wizard log line widened to `running=... portConflict=... pid=...` so future debug sessions can discriminate the three terminal states.
- [x] 16.D.5 Unit tests `packages/shared/src/__tests__/server-identity-retry.test.ts` — 6 tests against a real loopback HTTP server (no fetch mocking): first-try success / retry-then-succeed on hang / 5xx short-circuit / persistent hang exhausts retries / foreign JSON short-circuits / legacy single-shot preserved when opts omitted. Injectable `_sleep` records call order for assertion.
  - First call returns AbortError, second call succeeds → `running:true`.
  - All retries return AbortError → `running:false` (no portConflict).
  - First call returns 200 with valid JSON → `running:true` immediately, no retries fired.
  - First call returns 200 with wrong JSON shape → `running:false, portConflict:true` immediately, no retries.
  - Inject `setTimeout` mock to assert sleep durations match `retryDelayMs`.
- [ ] 16.D.6 Integration acceptance: launch a second Electron instance while the first is mid-bootstrap. **Deferred to Group 14 manual QA cycle** — requires installed `.app` on macOS.

### 16.E Electron-spawned server watchdog respawn (Failure 5)

- [x] 16.E.1 Watchdog plumbed via `LaunchOpts.onExitAfterReady` in `packages/shared/src/server-launcher.ts` — the callback is attached AFTER readiness so `EarlyExitError` cases stay with the caller's error handling. `spawnFromSource` in `launch-source.ts` accepts an `onExitAfterReady` option and forwards. `server-lifecycle.ts` exports `makeServerWatchdog({ isGraceful, log, onCrash })` factory; `main.ts` wires it to broadcast `dashboard:launch-status {phase:"crashed", code, signal}` and call `showLoadingPage(win, serverUrl)` on every BrowserWindow when graceful flag is false.
  - If `gracefulShutdownInProgress` flag is true (set by Electron's `before-quit` event), do nothing. The exit was intentional.
  - Otherwise: log `[server-lifecycle] server child exited unexpectedly code=${code} signal=${signal}`, broadcast `dashboard:launch-status {phase: "crashed", code, signal}` to all renderer windows, and trigger the loading-page flow: `currentWindow.loadFile("loading.html", { query: { serverUrl } })`.
- [x] 16.E.2 Module-level `gracefulShutdownInProgress` flag added to `server-lifecycle.ts` with `setGracefulShutdownInProgress(value)` / `isGracefulShutdownInProgress()` accessors. `main.ts`'s `quit()` and a new `before-quit` listener both flip to `true`. `setSpawnedPid(pid)` resets to `false` so programmatic restart re-arms crash detection.
- [x] 16.E.3 Unit test `packages/electron/src/__tests__/server-watchdog-respawn.test.ts` — 5 tests: onCrash fires when graceful=false / no fire when graceful=true / onCrash exceptions are swallowed and logged / setSpawnedPid resets the graceful flag / setGracefulShutdownInProgress toggles both ways. Watchdog is a pure factory — no Electron boot needed.
  - Mock spawn returns a child whose `.on('exit')` fires after a delay.
  - Assert `broadcastLaunchStatus` called with `phase: "crashed"` when graceful flag is false.
  - Assert no broadcast when graceful flag is true.
  - Assert `currentWindow.loadFile` called with `loading.html` on unexpected exit.
- [ ] 16.E.4 Integration acceptance: kill the spawned server PID and verify loading-page recovery. **Deferred to Group 14 manual QA cycle** — requires real Electron runtime + `lsof` + manual `kill -TERM`.
  ```bash
  open /Applications/PI-Dashboard.app
  sleep 15
  PID=$(lsof -nP -iTCP:8000 -sTCP:LISTEN -t | head -1)
  kill -TERM $PID  # unexpected exit (graceful flag NOT set)
  sleep 3
  # Electron window MUST show loading.html with "Cannot connect" + recovery affordances.
  # "Start server" button on the loading page should respawn the server.
  ```

### 16.F Cross-failure regression suite

- [x] 16.F.1 `packages/electron/src/__tests__/clean-install-smoke.test.ts` — 5 cross-failure regression checkpoints: server/installer log paths distinct (Failure 3) / scope-dir wipe recoverable (Failure 1) / managed-dir-root resolves (Failure 2) / `isDashboardRunning` honors opts (Failure 4) / watchdog routes crash unless graceful (Failure 5). **Departure from spec:** real-fs in tmp dir instead of memfs+child_process mocks — individual unit tests already exercise the deeper behaviour; this file pins the cross-module wiring boundary.
- [x] 16.F.2 `docs/faq.md` now has "Why does the dashboard fail to launch after I install or update PI-Dashboard.app?" entry with five numbered failure modes + fix locations. Caveman style. Delegated to subagent.
- [x] 16.F.3 `docs/electron-bootstrap-flow.md` § "Common failure modes" added with 5-row table (Symptom / Root cause / Fix location). Caveman. Delegated to subagent.


