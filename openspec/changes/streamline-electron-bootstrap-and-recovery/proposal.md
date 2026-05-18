## Why

The Electron startup + recovery story is fragmented and brittle.

**Today's gaps (verified against source, not speculation):**

1. **Packages have no version tracking.** `~/.pi-dashboard/node_modules/<pkg>/` is checked only for presence (`isManagedDirPopulated()` in `power-user-install.ts:80` — "Note: this is a presence check, not a version check"). A stale install, a half-deleted `node_modules`, or a `package.json` whose deps no longer match the bundled cache are all invisible to startup. Reconciliation runs only via `/api/pi-core/update`, which requires the server to be running — exactly what fails when packages are broken.
2. **`decideStartupAction` runs only on first run.** After the wizard writes `mode.json`, every subsequent launch returns `skip-everything` regardless of whether the managed state still matches what Electron ships. New Electron releases with bumped pins don't trigger any reconcile.
3. **`loading.html` is the user's actual recovery surface, but it only offers "Start server" + "Open Doctor".** When the server can't start because packages are missing/stale, the user sees a generic "Cannot connect" and must know to open Doctor.
4. **Doctor has no "force reinstall" affordance.** Currently the only repair path is the failed-server-startup dialog ("Would you like to run the setup wizard to fix this?") which re-opens the full wizard.
5. **Wizard asks questions the user can't sensibly answer at install time.** Mode (standalone vs power-user) is fully derivable from detection state. API keys are dashboard-configuration, not install-state. The "advanced vs full" distinction the UI implies is illusory — the same `installStandalone()` runs either way.
6. **Local Electron builds default to online-only.** `BUNDLE_OFFLINE_PACKAGES=1` is opt-in, so a local `npm run make` produces an Electron app that needs internet on first launch even though the offline-bundling pipeline already exists.
7. **No safe-wipe primitive.** Any reinstall today is implicit (npm-install overwrites). There is no documented whitelist of "Electron-owned" packages, so a force-reinstall risks blowing away user-installed `pi-*` ecosystem packages that share `~/.pi-dashboard/node_modules/`.

The shared theme: **the system has all the install/repair machinery; what's missing is when/where/how it gets triggered and a contract that says what the wizard, loading page, and Doctor each own.**

## What Changes

This proposal restructures Electron startup into **three clear surfaces** with no overlap:

- **Wizard (first-run welcome only).** Two interactive steps + one progress step + one done step. No mode question, no API-key question, no bridge-install question. Auto-detect everything that's autodetectable; the only thing the wizard asks is "which bundled packages do you want."
- **Loading page (universal recovery surface).** On every connection failure, runs a managed-inventory diff against the offline-packages pin floor and surfaces targeted recovery actions (`Reinstall managed packages` / `Force reinstall`) alongside the existing `Start server` and `Open Doctor`.
- **Doctor (diagnostics + force reinstall).** Adds a "Force reinstall" button with a surgical safe-wipe (whitelist-driven) + audit panel. User-installed packages, settings, sessions, and credentials are preserved.

Behind those three surfaces:

- **Bootstrap preflight on every launch.** When server not running, read `~/.pi-dashboard/node_modules/<pkg>/package.json#version` for the Electron-owned set, diff against `offline-packages.json` pins. If missing/stale/corrupt, prompt the user (unless `--silent-bootstrap` env override) and selectively reinstall just the affected packages. When server is running but version mismatches Electron app version, surface a banner (newer-running-than-app vs older-running-than-app — different messages, different defaults).
- **Managed-package whitelist as single source of truth.** Hard-coded list of "Electron-owned" packages (mirrors `offline-packages.json`). Every reinstall and force-reinstall checks this whitelist; anything in `~/.pi-dashboard/node_modules/` not on the list is preserved. Regression-pinned by a unit test.
- **Installable catalog v2.** `installable.json` schema bumps to add `kind` (`core` / `extension`), `source` (`offline-cache` / `bundled-git` / `npm-registry`), and `required` fields. The wizard's unified package selector reads this catalog and renders three tiered groups. v1 files are migrated in place on first read.
- **`npm run build:local` script.** Single-command local Electron build that defaults `BUNDLE_OFFLINE_PACKAGES=1` (and optionally `BUNDLE_RECOMMENDED_EXTENSIONS=1`), with stale-pin detection so cache regenerates when `offline-packages.json` changes. Existing `build-installer.sh` orchestration unchanged; new `build-local.sh` is a 12-line wrapper.

## Capabilities

### New Capabilities

- `electron-wizard` — slimmed first-run welcome with unified bundled-package selector. Four steps total (welcome / select / progress / done). No mode, no auth, no bridge-install steps.
- `bootstrap-preflight` — on-every-launch managed-inventory diff against offline-pin floor. Selective reinstall via `installStandalone(skipPackages = upToDate)`. Cross-version banner when server is up but version-skewed against Electron app.
- `loading-page-recovery` — diagnostic probe on `loading.html` connection-failure path. New IPC channels (`dashboard:check-inventory`, `dashboard:reinstall-managed`, `dashboard:force-reinstall`). Targeted reinstall/force-reinstall buttons appear only when fixable issues detected.
- `doctor-force-reinstall` — surgical safe-wipe + offline reinstall from Doctor window. Audit panel shows what will be wiped vs preserved before confirmation. Same backend as loading-page force-reinstall.
- `build-local` — `npm run build:local` + `npm run build:local:offline` scripts for fully offline-capable local Electron builds. Stale-pin invalidation rule documented and codified.
- `installable-catalog` — `installable.json` v2 schema (kind/source/required). Catalog assembly merges three tiers: required core (from `offline-packages.json`), bundled extensions (from `resources/recommended-extensions/` Git cache), and dashboard-registry packages (deferred to Settings → Packages, not in wizard).
- `managed-package-whitelist` — single source of truth for "Electron-owned" packages. Used by every wipe/reinstall path. Backed by a regression test asserting list matches `offline-packages.json`.

### Modified Capabilities

- `electron-bootstrap-flow` — `decideStartupAction` now runs on every launch (not gated on `isFirstRun()`); `mode.json` removed in favor of `isManagedDirPopulated()` presence check. Auto-skip-with-install branch absorbed into preflight.
- `dashboard-recovery` (the `loading.html` flow currently covered implicitly by `electron-server-launch-controls`) — adds inventory diagnostic, reinstall/force-reinstall actions, progress streaming via new `dashboard:install-progress` channel.

### Removed Capabilities

- Wizard mode-selection step (`step-mode`) — autodetected.
- Wizard bridge-install step (`step-bridge-install`) — autoruns.
- Wizard API-key step (`step-apikey`) — moved to Settings → Provider Auth post-install.
- Wizard recommended-extensions separate step — merged into unified package selector.
- `mode.json` state file — replaced by presence check.

## Smoke-test findings (2026-05-17 parallel session) — added to scope

A live install-and-launch QA session against a freshly built
`PI-Dashboard-darwin-x64-0.5.3.dmg` (built atop this proposal's branch +
the parallel `fix-electron-wizard-npm-root-enoent` proposal) surfaced
**five distinct failure modes** that this proposal in its original shape
does NOT yet address. They are now wired into `tasks.md` group 16 as
concrete actionables, with full diagnostic detail in `design.md`
§ "Smoke-test findings from a parallel session (2026-05-17)":

1. **Bootstrap `npm install` wipes workspace materialization.** After
   bundle extraction populates
   `~/.pi-dashboard/node_modules/@blackbelt-technology/{pi-dashboard-server,
   pi-dashboard-web, pi-dashboard-shared, pi-dashboard-extension,
   dashboard-plugin-runtime}/`, the bootstrap install for pi/openspec/tsx
   runs `npm install --offline` and prunes those workspace dirs (not
   listed in synthetic `package.json#dependencies`). Server crashes
   with `Cannot find module 'fastify'`. Reproduces on every fresh
   install. Fix in 16.A.
2. **Client static-file resolution chain misses managed-dir layout.**
   The 5-strategy chain in `server.ts:1109` doesn't probe
   `<managedDir>/packages/dist/client/` (where `bundle-server.mjs`
   places the client). `GET /` returns 404 even when the server is
   otherwise healthy. Fix in 16.B — adds a 6th strategy that walks up to
   find the `.version` marker.
3. **Loading page reads the wrong `server.log` path.** Displays
   `~/.pi-dashboard/server.log` (installer log, may be months old)
   instead of `~/.pi/dashboard/server.log` (actual dashboard server
   log). Confusing diagnostics. Fix in 16.C — also extracts
   `packages/shared/src/dashboard-paths.ts` as single source of truth.
4. **Pre-wizard probe 2s timeout false-negatives during bootstrap.**
   `isDashboardRunning` aborts after 2s; bootstrap-install windows of
   9–18s on cold cache trigger spurious `running:false` returns,
   surfacing "Launch failed: Port 8000 in use by another service" on
   second-instance launches. Fix in 16.D — 8s timeout + bounded retry +
   diagnostic log enrichment.
5. **Electron-spawned server has no watchdog respawn.** When the child
   dies for any reason, the parent does NOT detect or restart. Dashboard
   becomes a ghost window. Fix in 16.E — attach `child.on('exit')` and
   route unexpected exits back through the loading-page recovery UX.

**Cross-failure note:** The parallel `fix-electron-wizard-npm-root-enoent`
change is robust to Failure 1 (its `electronBundledRuntimeStrategy`
probes `<process.resourcesPath>/node/` directly inside the .app bundle,
bypassing the wipe-able scope dir entirely). So that change can ship
independently of 16.A's fix — verified by 1058 unit tests + 100
bootstrap-harness scenarios in that proposal's branch.

## Impact

- **Electron main**: `main.ts` startup restructured — preflight check on every launch, wizard only when managed dir empty. New IPC handlers for inventory/reinstall/force-reinstall.
- **Electron renderer**: `wizard.html` shrinks ~620 → ~250 lines; `loading.html` gains diagnostic + 2 buttons; new `doctor.html` force-reinstall section.
- **Electron lib**: new `preflight-reconcile.ts`, `force-reinstall.ts`, `installable-catalog.ts`. Slim `power-user-install.ts` (keep `decideStartupAction`, drop mode persistence). Delete `wizard-state.ts::isFirstRun` + `writeModeFile`.
- **Shared**: `installable-list.ts` v2 schema + v1 migration. New `managed-package-whitelist.ts` constant + regression test.
- **Server**: no changes to runtime. `bootstrap-install-from-list.ts` extended to route by `source` field (`offline-cache` / `bundled-git` / `npm-registry`).
- **Build**: new `build-local.sh` wrapper + npm scripts. Stale-pin invalidation rule added to `build-installer.sh`.
- **Tests**: memfs-based scenarios for missing/stale/corrupt/user-pkg-present cases. Wizard-state tests largely deleted; new preflight tests added. Whitelist regression test pins parity with `offline-packages.json`. **Group 16 adds:** rematerialization test, managed-dir-root resolution test, server-identity retry test, watchdog-respawn test, clean-install end-to-end smoke test.
- **Net LOC**: ~1000 deleted (wizard simplification + `mode.json` machinery), ~700 added (preflight + recovery + whitelist + build script) + **~400 added** (group 16: shared materialization helper + managed-paths helper + server-identity retry + watchdog + tests). Still net reduction.
- **Group 16 file additions:** `packages/shared/src/managed-workspace-materialize.ts`, `packages/shared/src/dashboard-paths.ts`, modifications to `packages/shared/src/server-identity.ts` (retry loop), `packages/server/src/server.ts` (6th resolution strategy), `packages/server/src/bootstrap-install-from-list.ts` (post-install re-materialization), `packages/electron/src/lib/server-lifecycle.ts` (exit watchdog), `packages/electron/src/main.ts` (graceful-shutdown flag, retry-loop wiring, log line enrichment), `packages/electron/scripts/bundle-server.mjs` (import shared helper).
- **Documentation**: `docs/architecture.md` Electron-bootstrap section rewritten. `docs/file-index-electron.md` updated rows for changed/new files. `docs/electron-bootstrap-flow.md` state machine diagram updated.
- **Backward compatibility**:
  - `mode.json` if present is read once for migration intent (any value → noop) then deleted. No regression for upgrade installs.
  - `installable.json` v1 files migrated to v2 on first read; v1 writers (none currently external) would round-trip cleanly because new fields are additive.
  - Whitelist matches today's `offline-packages.json` exactly — no behavior change for existing managed installs.
