# Tasks

**Prerequisite**: `origin/develop` merged into local `develop`. If not yet merged, stop and complete `pre-merge-cleanup` + `prep-for-develop-merge` first.

**Verification policy**: targeted vitest only (matches repo convention). After each phase, run exactly the test files that phase touched.

---

## Phase 1 — Electron server spawn: `detach: false`

- [ ] 1.1 Read `packages/electron/src/lib/server-lifecycle.ts` and confirm current `spawnDetached` call does NOT pass `detach`.
- [ ] 1.2 Extract a pure helper `buildServerSpawnOptions({ spawnBin, spawnArgs, env, cwd, logFd })` that returns the full options object passed to `spawnDetached`, including `detach: false`. Keep it in the same file as a top-level export so it is unit-testable without Electron runtime.
- [ ] 1.3 Replace the inline options object in `launchServer` with `spawnDetached(buildServerSpawnOptions(...))`.
- [ ] 1.4 Add test `packages/electron/src/__tests__/server-lifecycle-spawn-options.test.ts`:
  - Given representative inputs, `buildServerSpawnOptions` returns an object with `detach: false` and all other fields preserved.
  - A second assertion verifies no call site in `server-lifecycle.ts` passes `detach: true` (string scan of the source file).
- [ ] 1.5 Manual smoke: `npm run build` then launch Electron on Windows; confirm no console flash during server start.
- [ ] 1.6 Run targeted: `npx vitest run packages/electron/src/__tests__/server-lifecycle-spawn-options.test.ts`

---

## Phase 2 — "+ Session" spawn error surface + wt→headless fallback

### 2a. Protocol

- [ ] 2a.1 In `packages/shared/src/browser-protocol.ts`, add `spawn_error` to the `ServerToBrowserMessage` union:
  ```ts
  | { type: "spawn_error"; requestId?: string; cwd: string; strategy: string; message: string; stderr?: string }
  ```
- [ ] 2a.2 Verify the build still passes (`npm run build`) — this also confirms esbuild preserves the switch case.

### 2b. Server-side error propagation

- [ ] 2b.1 In `packages/server/src/browser-handlers/session-action-handler.ts::handleSpawnSession`, wrap the `spawnPiSession` call in try/catch.
- [ ] 2b.2 On throw OR on `{ success: false }` result, send `spawn_error` via the browser gateway with `{ requestId, cwd, strategy, message, stderr? }`. Include up to 2 KB stderr tail if available from the error object.
- [ ] 2b.3 Keep existing behaviour (optimistic card removal, etc.) — just add the error surface.
- [ ] 2b.4 Test `packages/server/src/__tests__/session-action-handler-spawn-error.test.ts`:
  - Mock `spawnPiSession` to throw; assert `spawn_error` dispatched with correct fields.
  - Mock to return `{ success: false, message: "..." }`; assert `spawn_error` dispatched.
  - Mock to return `{ success: true }`; assert `spawn_error` NOT dispatched.

### 2c. Spawn mechanism fallback

- [ ] 2c.1 Answer Open Question Q2 from design.md: does `selectMechanism` or its caller already probe for `wt.exe`? Read `packages/shared/src/platform/spawn.ts::selectMechanism` and the ToolRegistry entry for `wt`.
- [ ] 2c.2 Add a `wt` tool entry to `packages/shared/src/tool-registry/definitions.ts` if not present (Windows-only `whereStrategy("wt")`).
- [ ] 2c.3 In `selectMechanism` (or the closest caller — justify location choice in the commit body): on Windows, if chosen mechanism is `wt` and `ToolResolver.which("wt")` is unresolved, demote to `headless`. Use a module-scoped boolean to log the degradation exactly once per server run.
- [ ] 2c.4 Test `packages/shared/src/__tests__/spawn-mechanism-wt-fallback.test.ts`:
  - `wt.exe` present on Windows → mechanism stays `wt`.
  - `wt.exe` absent on Windows → mechanism becomes `headless`; log emitted.
  - Second call after first log → silent fallback; no log.
  - Non-Windows → fallback logic never runs (early return).

### 2d. Client error rendering

- [ ] 2d.1 In `packages/client/src/hooks/useMessageHandler.ts`, dispatch `spawn_error` messages into session/folder state.
- [ ] 2d.2 In `packages/client/src/components/FolderActionBar.tsx` (or the spawn card it owns — verify in code), render a red banner with the error message and a "Retry" button that re-fires the spawn request.
- [ ] 2d.3 Targeted test for the reducer dispatch path only (component test optional; kept out of scope).

### 2e. Run targeted tests

- [ ] 2e.1 `npx vitest run packages/server/src/__tests__/session-action-handler-spawn-error.test.ts packages/shared/src/__tests__/spawn-mechanism-wt-fallback.test.ts`

---

## Phase 3 — Package download visual indicator

- [ ] 3.1 Read `packages/client/src/hooks/usePackageOperations.ts` — confirm it already listens for `package_operation_progress`. If not, add the listener.
- [ ] 3.2 Add `progressByOperationId: Map<string, ProgressFrame>` state. On each progress message, replace the entry keyed by `operationId`. On `package_operation_complete` or `package_operation_failed`, delete the key.
- [ ] 3.3 Expose the latest frame via the hook return shape so callers (`PackageCard`, `PackageInstallConfirmDialog`) can read it by `operationId`.
- [ ] 3.4 In `packages/client/src/components/PackageCard.tsx`, render a progress bar + stage label when an in-progress operation matches the card. Use existing Tailwind primitives — no new dependencies.
- [ ] 3.5 In `packages/client/src/components/PackageInstallConfirmDialog.tsx`, render the same progress bar in the dialog body while the install is live (dialog remains open until completion).
- [ ] 3.6 Determinate bar when `bytesTotal > 0`; indeterminate barber-pole otherwise.
- [ ] 3.7 Phase labels: `resolving → "Resolving…"`, `downloading → "Downloading X.X / Y.Y MB"` (or `"Downloading…"` when no totals), `installing → "Installing…"`, `persisting → "Persisting…"`.
- [ ] 3.8 Test `packages/client/src/__tests__/use-package-operations-progress.test.ts`:
  - progress frame sets state under `operationId`.
  - Second frame replaces first.
  - `_complete` clears the key.
  - `_failed` clears the key.
- [ ] 3.9 Run targeted: `npx vitest run packages/client/src/__tests__/use-package-operations-progress.test.ts`

---

## Phase 4 — `/reload` readback + `package_reload_incomplete`

### 4a. Investigate (answers Open Question Q1)

- [ ] 4a.1 Read `packages/shared/src/pi-resource-scanner.ts` and pi-gateway message types to confirm whether pi emits a structured `extensions_loaded` / `reload_complete` / `manifest_updated` event today, or whether the only signal is indirect (e.g. a session event referencing the new extension).
- [ ] 4a.2 If a direct event exists, use it as the primary signal. If not, fall back to a readback query: after `/reload`, wait 1 s, then query the session's loaded package manifest via pi-gateway RPC (if available) and compare to the expected set.
- [ ] 4a.3 Record the chosen signal in `design.md` (append a "Decision D7 — Readback signal" section).

### 4b. Protocol

- [ ] 4b.1 Add `package_reload_incomplete` to `ServerToBrowserMessage` in `browser-protocol.ts`:
  ```ts
  | { type: "package_reload_incomplete"; sessionId: string; packageName: string; operation: "install" | "update" }
  ```

### 4c. Server-side readback

- [ ] 4c.1 In `packages/server/src/package-manager-wrapper.ts`, after sending `/reload` to each active session (on install/update only — NOT remove), start a per-session Promise with a 5 s deadline that resolves when the signal from 4a is received AND the target package name appears.
- [ ] 4c.2 On timeout or negative readback, emit `package_reload_incomplete` to the browser gateway.
- [ ] 4c.3 Test `packages/server/src/__tests__/package-manager-wrapper-readback.test.ts`:
  - Positive readback within budget → no incomplete event.
  - Timeout with no event → incomplete emitted.
  - Explicit negative readback (package absent) → incomplete emitted without waiting full 5 s.
  - Remove operation → readback skipped.

### 4d. Client toast

- [ ] 4d.1 Dispatch `package_reload_incomplete` in `useMessageHandler.ts` into toast state.
- [ ] 4d.2 Render a persistent (non-auto-hide) dismissible toast: `"Installed <pkg>, but session <name> did not pick it up — restart the session to apply."`
- [ ] 4d.3 Ensure the toast does NOT stack unboundedly — dedupe by `sessionId + packageName`.

### 4e. Run targeted tests

- [ ] 4e.1 `npx vitest run packages/server/src/__tests__/package-manager-wrapper-readback.test.ts`

---

## Phase 5 — End-to-end smoke via dashboard

- [ ] 5.1 `npm run build` and restart the dashboard server.
- [ ] 5.2 From a fresh browser at `http://localhost:9000`:
  - Install a small pi package (e.g. `pi-doom`) and verify the progress bar renders with real byte counts.
  - Click "+ Session" in a folder with no tmux/wt — expect either a spawned session OR a visible spawn_error banner, never silence.
  - Rename-kill `wt.exe` from PATH temporarily (or test on a Windows VM without Windows Terminal) — expect headless fallback with the one-time log line.
  - Install a package into an active session, watch the progress finish, then try to use the installed capability in that session. If it does not work, expect the reload-incomplete toast.
- [ ] 5.3 Tear down: restore any PATH changes, uninstall the test package.

---

## Phase 6 — Documentation + archive

- [ ] 6.1 Update `AGENTS.md` Key Files table with any new files created (server-lifecycle helper extraction, new test files).
- [ ] 6.2 Update `docs/architecture.md` if any user-visible flow changed (progress bar + spawn_error path + reload warning).
- [ ] 6.3 File an upstream issue in `pi-coding-agent` for Fix 4's true fix; link it from a TODO comment near the readback code.
- [ ] 6.4 When all phases verified, run `/opsx:archive` to move this change to `openspec/changes/archive/YYYY-MM-DD-fix-post-merge-regressions/` and sync the modified specs into `openspec/specs/`.
