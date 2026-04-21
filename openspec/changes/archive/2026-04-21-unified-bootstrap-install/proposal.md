## Why

The dashboard has two user-facing install paths that don't share bootstrap logic:

1. **Electron app** — the first-run wizard runs `dependency-installer.ts` to install pi, openspec, and tsx into `~/.pi-dashboard/`. Users get a working session experience on first launch.
2. **`npm i -g pi-dashboard` (CLI)** — installs the dashboard binary and its direct runtime deps (`fastify`, `ws`, `node-pty`). Does NOT install `@mariozechner/pi-coding-agent` or `openspec`. On Windows (where this is the most common install path because of Electron code-signing cost and Windows Defender friction), the user runs `pi-dashboard`, the server starts, but pi is unresolvable → no sessions ever appear. The user has to `npm i -g @mariozechner/pi` and re-register the bridge extension by hand.

The Electron installer logic is good — it already handles Node detection, bundled-Node fallback, progress callbacks, managed-dir creation, bridge registration. The `npm i -g pi-dashboard` path reinvents nothing; it just skips the install step entirely.

Additionally, the Electron wizard today is synchronously blocking: the user sees a wizard, installs, THEN the server starts. For the CLI case a blocking wait on first run is unacceptable — `pi-dashboard` is often launched in scripts, CI, or keyboard-driven flows where a 30-second block is a bug.

## What Changes

### 1. Shared bootstrap installer
- Move `packages/electron/src/lib/dependency-installer.ts` + `managed-paths.ts` to `packages/shared/src/bootstrap-install.ts` + `packages/shared/src/managed-paths.ts` (the latter already partly there — consolidate).
- Export a single `bootstrapInstall({ packages, progress })` function callable from any entry point.
- Keep Electron's wizard as a thin caller (existing UX preserved).

### 2. Degraded-mode first-run for `pi-dashboard` CLI
- When `pi-dashboard` starts and `ToolRegistry.resolve("pi")` fails with no recoverable strategy:
  - **Server starts immediately** in degraded mode.
  - **Bootstrap install runs in the background** (async, non-blocking).
  - UI/API reports `bootstrap.status = "installing"`.
  - Session-spawn and terminal-spawn (if it shells pi) return a deferred-queue response OR reject with an actionable error — decided per API, see design §3.
  - On completion, `bootstrap.status = "ready"`, dashboard clients refresh tool list, sessions become available.
  - On failure, `bootstrap.status = "failed"` with error details; retry button + logs link.

### 3. Bridge registration re-runs after bootstrap
- Once `bootstrapInstall` finishes, call `registerBridgeExtension(bundledExtensionPath)` automatically. For the `npm i -g pi-dashboard` layout, the bundled extension MUST be shipped as a sibling directory — see design §5 for the packaging decision.

### 4. Version-skew detection + upgrade entry points
- On every dashboard boot, compare resolved pi version against a compatibility range declared in `pi-dashboard-server/package.json`'s `piCompatibility` field.
- Surface two upgrade entry points:
  - **Dashboard UI**: Settings → Packages tab (existing `PiCoreVersionsSection.tsx`) gains an "Update pi" button that triggers `bootstrapInstall({ packages: ["@mariozechner/pi-coding-agent"], mode: "upgrade" })`.
  - **CLI subcommand**: `pi-dashboard upgrade-pi` runs the same function synchronously with streaming progress on stdout.

### 5. `bootstrap.status` exposed via API and browser protocol
- New REST endpoint: `GET /api/bootstrap/status` returns `{ status, progress?, error?, version? }`.
- New WebSocket broadcast message: `bootstrap_status_update`.
- UI renders a top-of-page banner when status is `installing` or `failed`.

### Out of scope

- Bundling pi as a runtime `dependencies` entry of pi-dashboard (option A in exploration). Rejected — doubles install size, rigid version pinning, pi upgrades require dashboard releases.
- Offline install bundles. Future work if user reports demand it.
- Migrating existing users' global `@mariozechner/pi` into `~/.pi-dashboard/`. Preserve both; prefer global npm when present (existing strategy order).
- Reworking the Electron wizard UX. Wizard continues to use the shared installer; no visible UX change.

## ⚠ Precondition: v3 merge + bootstrap-resolution-harness

This proposal assumes BOTH:

1. `merge-windows-integration-linear` has landed on `develop`. Verify `platform/spawn.ts`, `tool-registry/`, and `isDashboardRunning()` identity-verified health check exist.
2. `bootstrap-resolution-harness` has landed. This proposal REUSES the harness for testing the installer's effect on pi-resolution. Specifically:
   - **Scenario B1** (`packages/shared/src/__tests__/bootstrap/families/b-npm-global.test.ts`) currently snapshots the "pi unresolved on npm-g-dash-only" state across 3 platforms. When this proposal's degraded-mode first-run bootstrap lands, B1's assertion flips from `expect(res.ok).toBe(false)` to `expect(res.ok).toBe(true)` with `source === "managed"`. Update the snapshot as part of this proposal's task list — the FIXED-BY marker is in the B1 test file.
   - **Harness primitives are available**: `withFakeEnv`, `managedInstall` fixture, `registerDefaultTools(registry, deps)`, `snapshotTrail(res, ctx)`. Use them for any new scenarios this proposal adds (e.g., "degraded mode during install", "bootstrap failure → retry").

Before starting implementation:

- Re-reproduce the Windows `npm i -g pi-dashboard` bug (steps in `design.md §2`) to confirm it hasn't been accidentally fixed.
- Re-read `bootstrap-resolution-harness/design.md §14` for coordination: task 20.1 of that proposal expects THIS proposal's implementer to update scenario B1's snapshot.

## Impact

### Specs affected

- `bootstrap-install` — NEW capability (added in this change's `specs/bootstrap-install/spec.md`).
- `dashboard-server` — MODIFIED: adds `bootstrap.status` state, `/api/bootstrap/status` endpoint, `bootstrap_status_update` broadcast.
- `first-run-wizard` — MODIFIED: Electron wizard delegates to shared installer; no UX change but underlying module moves.
- `dependency-installer` — MODIFIED (effectively migrated): references move to `bootstrap-install` capability.

### Code surface

- **New**: `packages/shared/src/bootstrap-install.ts` (from `packages/electron/src/lib/dependency-installer.ts`), `packages/server/src/bootstrap-state.ts`, `packages/server/src/routes/bootstrap-routes.ts`, `packages/client/src/components/BootstrapBanner.tsx`, `packages/client/src/hooks/useBootstrapStatus.ts`, `packages/server/src/cli-subcommand-upgrade-pi.ts`.
- **Modified**: `packages/server/src/cli.ts` (degraded-mode startup), `packages/server/src/server.ts` (wire bootstrap state + routes), `packages/electron/src/lib/wizard-ipc.ts` (delegate to shared installer), `packages/client/src/components/PiCoreVersionsSection.tsx` (add "Update pi" button wired to bootstrap endpoint).
- **Removed**: `packages/electron/src/lib/dependency-installer.ts` (now thin re-export from shared for back-compat, or removed outright — see tasks).

### Migration, compatibility, rollback

- **Migration**: users on existing managed installs are unaffected. Users who relied on manual `npm i -g @mariozechner/pi` after installing pi-dashboard will find pi pre-installed into `~/.pi-dashboard/` on their next `pi-dashboard` start; their global install takes precedence per strategy order. No config migration.
- **Compatibility**: `bootstrap.status` is additive; clients that don't read it see no change. The REST endpoint is new. The UI banner is new.
- **Rollback**: `git revert` the landing commit; users who had pi auto-installed into `~/.pi-dashboard/` keep the install (it's harmless — just unused if they uninstall the dashboard).

### Validation

- All bootstrap-resolution-harness scenarios remain green except B1 (expected snapshot updated to "resolves via managed").
- New unit tests for `bootstrapInstall` (mocked subprocess): happy path, failure, progress callbacks, version-skew detection.
- New integration test: `pi-dashboard` starts in degraded mode, serves `/api/health`, `/api/bootstrap/status`, and a stub session-spawn request returns a queued response. (Docker-based, extends `test-electron-install.sh`.)
- Manual Windows smoke: `npm i -g pi-dashboard` from a fresh Windows VM → run `pi-dashboard` → confirm degraded-mode banner → confirm session spawn works once install completes.
- Manual "user already has pi globally" smoke: confirm global install still wins; no shadow install into `~/.pi-dashboard/`.
