## Why

After merging `origin/develop` into the Windows-integration branch, four user-observable regressions remain. Each has a narrow, targeted fix; together they remove the last friction preventing the merged mainline from shipping as the Windows-capable default.

1. **Electron spawns its dashboard server with `detach: true`**, so on Windows the server console flashes and the server outlives Electron's Job Object (mirroring the exact bug that `detach: false` was added to fix for `pi-session` in commit `26e033e`). The Electron code path never received that fix.
2. **"+ Session" button intermittently fails to spawn a pi session from the terminal view.** Origin/develop's node-pty fixes (`8737249`, `3cad40b`) cover *terminal* PTY spawn reliability; they do not cover the *session-spawn* path that flows from `ProcessManager.spawnPiSession` → `selectMechanism` → `wt`/`headless`. Errors are still swallowed by the browser handler, leaving the user with no feedback.
3. **No visual indicator during package install/update/remove downloads.** The server already emits `package_operation_progress` WebSocket messages, but the client discards them — the button stays in a generic "installing…" state with no byte-count, stage, or download indicator.
4. **`/reload` from an active session does not re-register packages installed via the dashboard.** The server-side auto-reload (spec `session-reload-on-package-change`) sends `/reload`, but pi's reload path does not refresh the package registry derived from `~/.pi/agent/settings.json` — extensions/skills/prompts from the just-installed package remain invisible until the session is manually restarted.

## What Changes

### Fix 1 — Electron server spawn uses `detach: false` + Windows redirect

- `packages/electron/src/lib/server-lifecycle.ts::launchServer()` SHALL pass `detach: false` to `spawnDetached()` so libuv keeps the child inside Electron's Job Object. No console flash, no orphaned server on Electron quit.
- Add regression test asserting the spawn options passed to `spawnDetached` include `detach: false`.

### Fix 2 — "+ Session" spawn failure surface

- Server-side: `browser-handlers/session-action-handler.ts::handleSpawnSession` SHALL wrap the `spawnPiSession` call in a try/catch that emits a `spawn_error` browser message carrying `{ message, cwd, strategy, stderr? }`.
- Client-side: `FolderActionBar.tsx` / `SessionSpawnCard` SHALL render the error inline (red banner with retry) instead of silently rolling back to the empty state.
- Add a narrow retry: if `selectMechanism` returns `"wt"` on Windows and Windows Terminal is unavailable (`wt.exe` not on PATH), fall back to `"headless"` automatically and log the degradation once per server run.
- Regression tests: (a) error propagation from spawn → browser; (b) wt → headless fallback.

### Fix 3 — Package download visual indicator

- Server already emits `package_operation_progress` (name, phase, bytesTotal, bytesReceived). The client `usePackageOperations` hook SHALL store the latest progress frame keyed by `operationId`.
- `PackageCard` and `PackageInstallConfirmDialog` SHALL render: a determinate progress bar when `bytesTotal > 0`, an indeterminate bar otherwise, and stage text (`"Resolving…" | "Downloading X/Y MB" | "Installing…" | "Persisting…"`).
- No new WebSocket message types; this is a pure client rendering change over existing protocol.

### Fix 4 — `/reload` picks up newly installed packages

- Root cause lives in pi-coding-agent's reload handler; we cannot modify pi directly from this repo. Workaround that keeps the dashboard in the driver's seat:
  - Extend the auto-reload flow in `package-manager-wrapper.ts`: after a successful install/remove/update, send `/reload` **and** verify via a post-reload readback (query the session's loaded extensions via `pi_gateway`) that the installed package appears. If it does not within 5 s, emit a browser `package_reload_incomplete` event and surface a toast: "Installed <pkg>, but session <id> did not pick it up — restart session to apply."
  - Document the upstream fix needed in pi-coding-agent as a TODO referenced from the toast.
- Regression test: mock pi gateway, assert readback comparison logic and fallback toast event.

## Capabilities

### New Capabilities
_(none)_

### Modified Capabilities

- `electron-shell`: Electron's dashboard-server launch SHALL use `detach: false` so the server inherits Electron's Windows Job Object and does not flash a console window on spawn.
- `process-manager`: "+ Session" spawn failures SHALL be surfaced to the browser via a `spawn_error` message; Windows spawn SHALL auto-degrade from `wt` to `headless` when Windows Terminal is absent.
- `package-install`: Install/update/remove operations SHALL stream progress to the client with enough detail for a progress bar (bytes received/total, stage label).
- `session-reload-on-package-change`: After auto-reload, the server SHALL verify the target session observed the package change and emit a user-visible warning when the readback fails.

## Impact

- **Code**
  - `packages/electron/src/lib/server-lifecycle.ts`: 1-line option add.
  - `packages/server/src/browser-handlers/session-action-handler.ts`: ~15 lines (try/catch + emit).
  - `packages/shared/src/platform/spawn.ts` (`selectMechanism`): ~10 lines (wt-present check + fallback).
  - `packages/client/src/hooks/usePackageOperations.ts`: ~20 lines (progress state).
  - `packages/client/src/components/PackageCard.tsx` + `PackageInstallConfirmDialog.tsx`: ~30 lines (progress bar + stage text).
  - `packages/server/src/package-manager-wrapper.ts`: ~40 lines (post-reload readback + warning emit).
  - Shared protocol additions: `spawn_error`, `package_reload_incomplete` in `browser-protocol.ts`.
- **Tests**: 5 new tests (electron spawn options, spawn_error propagation, wt→headless fallback, progress state reducer, reload readback).
- **Runtime behaviour**: Windows Electron users lose the console flash. All users get a real download progress bar. Failed "+ Session" spawns become diagnosable. Stale `/reload` after install becomes visible instead of silent.
- **Dependencies**: No new npm deps; no pi-coding-agent changes required (Fix 4 is a workaround until upstream fixes reload).
- **Prerequisites**: This change assumes `origin/develop` is already merged into local `develop` — that merge is owned by the existing `pre-merge-cleanup` + `prep-for-develop-merge` proposals and is NOT in scope here.
