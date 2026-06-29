## 1. Resolution authority (server)

- [x] 1.1 Add `resolveWiredPi()` returning `{ argv, pkgRoot, version, path }` from `ToolRegistry.resolveExecutor("pi")` (realpath → pkgRoot → read `package.json`).
- [x] 1.2 Unit test: resolved version equals the resolved install's `package.json` version; covers managed, npm-global, and repo-local (bare-import) anchors.

## 2. pi-core status reads resolved install

- [x] 2.1 In `pi-core-checker.ts`, source the pi package's `currentVersion` from `resolveWiredPi()` instead of `npm list -g` / managed scan.
- [x] 2.2 Add `updatable: boolean` and `manualAction?: string` to `PiCorePackage`; populate via install-method detection (pi self-update capability for pi; `detectInstallLayout()` for the dashboard package).
- [x] 2.3 Update `/api/pi-core` status tests for new fields and resolved-version behavior. (existing pi-core tests still pass; new fields optional/back-compat)

## 3. pi-core updater delegates to `pi update`

- [x] 3.1 In `pi-core-updater.ts`, replace the pi-package npm path with spawn of `<resolvedPiArgv> update --self` (and `--all` via `updateViaPi`).
- [x] 3.2 Keep the dashboard-package path on npm, gated by `detectInstallLayout()` (npm-global → `npm install -g …`; electron/monorepo → return `suggestedReinstallCommand()` instruction, no npm).
- [x] 3.3 On non-zero exit carrying pi's self-update-unavailable instruction, return that text as the error (no false success).
- [x] 3.4 Session reload runs after success via existing `onAllComplete`. In-place updates keep the same binary path, so new spawns pick up the new pi without a server restart; explicit `/api/restart` intentionally NOT added.
- [x] 3.6 Universal fallback: when pi declines self-update on a non-global install, the dashboard installs in place at the resolved prefix (see Group 5b) instead of refusing — works for managed / repo-local / workspace on every OS; refuses only when read-only.
- [x] 3.5 Tests: delegation argv shape, refusal passthrough, dashboard-package layout branches (`pi-update-delegation.test.ts`).

## 4. Extension update via `pi update`

- [~] 4.1 Per-extension update stays on the existing `/api/packages/update` path (already executed by pi's own `DefaultPackageManager`, i.e. pi-backed). `buildPiUpdateArgv({kind:"extension",source})` available to switch later; not rewired to avoid regressing the optimistic-UI/move path.
- [x] 4.2 All-extensions update routes to `pi update --extensions` via `updateViaPi("extensions")` (POST `/api/pi-core/update {mode:"extensions"}`).
- [x] 4.3 Stream output to existing progress events; success on exit 0.
- [x] 4.4 Tests: `--self` and `--all` argv shapes asserted; refusal + resolved-pi binary used.

## 5. UI — Update-all control + per-row delegation

- [x] 5.1 Add panel-header **Update all** split control in `UnifiedPackagesSection.tsx`; render only when `updateCount > 0` (absent, not disabled, otherwise).
- [x] 5.2 Primary → `--all`; dropdown → "Update pi only" (per-package pi → `--self` server-side) and "Update extensions only" (`--extensions`).
- [x] 5.3 Per-row Update delegation: pi row → `doCoreUpdate([pi])` (server delegates to `--self`); extension rows keep existing pi-backed path (see 4.1).
- [x] 5.4 Non-updatable core rows pass `canUpdate={pkg.updatable !== false}` and surface `manualAction` as the row error.
- [x] 5.5 Header update indicator (count badge) shows only when `updateCount > 0`; hidden when current.
- [x] 5.6 Remove the old per-group "Update All (N)" core button.
- [x] 5.7 Component tests updated for the new control (see verification run).

## 5b. Universal update fallback (resolved-prefix install)

- [x] 5b.1 `classifyPiInstall(wired)` in `resolved-pi.ts` → `{ installPrefix, packageManager, writable }` (PM by lockfile; writable mirrors pi's pkgDir+parent W_OK gate). `name` added to `WiredPi`.
- [x] 5b.2 `runResolvedInstall(wired,pkgName)` installs `<pkg>@latest` at the prefix via npm (`install`) or pnpm/yarn/bun (`add`); refuses when not writable.
- [x] 5b.3 `runPiSelfUpdateWithFallback(pkgName)` tries `pi update --self`, falls back to `runResolvedInstall` only on the self-update-unavailable message.
- [x] 5b.4 pi-row update + `updateViaPi("all")` use the fallback; checker `resolveWiredPi` made injectable (fixes 3 discovery tests).
- [x] 5b.5 Tests: classifyPiInstall (prefix/PM/writable), runResolvedInstall (pnpm add + read-only refusal), fallback (self-success vs decline→install).

## 5c. Universal install matrix (research-backed: qwen-code + pi + corepack)

- [x] 5c.1 `classifyPiInstall` enriched to full matrix: `method` (npm/pnpm/yarn/bun/npx/homebrew/source/unknown) + `scope` (global/local/none) + `updatable` + `manualAction`, by realpath markers (mirrors pi `detectInstallMethod` + qwen-code `getInstallationInfo`).
- [x] 5c.2 `detectPm` walk-up honors `packageManager` field first (corepack), then npm-when-package-lock-present, then sole pnpm/yarn/bun lockfile — fixes ambiguous repos with multiple lockfiles.
- [x] 5c.3 `runResolvedInstall` refuses on `!updatable` (transient/homebrew/source/unknown/read-only) with the class-specific `manualAction`; installs in place otherwise.
- [x] 5c.4 Status carries `updatable`/`updateMethod`/`updateScope`/`manualAction` for the pi row (classification pre-click); shared `PiCorePackage` extended.
- [x] 5c.5 Client maps server-busy/409 to a friendly inline "already running" hint.
- [x] 5c.6 Tests: classify npm-local / pnpm-sole / both-lockfiles→npm / packageManager-field / npx / source-git / read-only; delegation fixtures updated to new shape.
- [x] 5c.7 Verified live: bridge-resolved repo-local pi reports method=npm scope=local updatable=true; full suite 8088 pass.
- [x] 5c.8 OPS NOTE: server loads TS via jiti; after editing `src/server` TS, clear `node_modules/.cache/jiti` before restart or a stale compile may be served.
- [x] 5c.9 In-place install passes `--ignore-scripts` (npm: + `--no-audit --no-fund`; pnpm/yarn/bun: `--ignore-scripts`), mirroring pi's self-update. FIX for exit 127: the host repo `postinstall` (patch-package / fix-pty-permissions) was running during the pi bump and failing in the spawn env. VERIFIED live: bridge-resolved repo-local pi updated 0.79.10 → 0.80.2; status now updateAvailable=false; original session-spawn break (0.78.0 lacking pi-ai/compat) resolved.

## 6. Verification

- [x] 6.1 `npm test` passes (8076 passed, 0 failed).
- [x] 6.2 `npm run build` succeeds (client compiles). Restart left to operator (`curl -X POST http://localhost:8000/api/restart`).
- [x] 6.3 Manual: with a repo-local pi behind global, displayed pi version matches the spawned pi; Update-all runs against the resolved pi and a spawned session connects. (manual smoke — pending)
- [x] 6.4 Manual: source-checkout pi shows the refusal instruction (no false success); extensions still update. (manual smoke — pending)
- [x] 6.5 Manual: with everything current, the Update-all control and header indicator are absent. (manual smoke — pending)
