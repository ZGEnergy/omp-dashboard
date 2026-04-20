## 0. Precondition check

- [ ] 0.1 Verify `merge-windows-integration-linear` landed on `develop`.
- [ ] 0.2 Verify `bootstrap-resolution-harness` landed — needed for family-L scenario additions.
- [ ] 0.3 Test-install `proper-lockfile` on Windows, macOS, and Linux CI runners (scratch workspace). Abort if native deps fail on any platform.
- [ ] 0.4 Re-read `design.md §5, §9` against current `server-pid.ts` and `restart-helper.ts`; confirm the integration points haven't shifted post-v3.
- [ ] 0.5 Coordinate with `unified-bootstrap-install` author (if landing in parallel): decide which proposal's task ordering covers the "lock acquired before bootstrapInstall" wiring.

## 1. Dependency + module scaffold

- [ ] 1.1 Add `proper-lockfile` to `packages/server/package.json` `dependencies`.
- [ ] 1.2 Add `@types/proper-lockfile` to `devDependencies`.
- [ ] 1.3 Create `packages/server/src/home-lock.ts` with types: `LockMetadata`, `LockAcquireResult` (`{ mode: "acquired"; release: () => Promise<void> }` | `{ mode: "attach"; meta: LockMetadata }`).

## 2. Canonical HOME + paths

- [ ] 2.1 Export `canonicalHomedir()` from `home-lock.ts` — uses `fs.realpathSync(os.homedir())` with tolerant fallback.
- [ ] 2.2 Export `getLockPath()` returning `<canonicalHomedir>/.pi/dashboard/server.lock`.
- [ ] 2.3 Export `getMetaPath()` returning `<lockPath>.meta.json`.
- [ ] 2.4 Unit test that symlinks in homedir canonicalize to the same lock path across two invocations.

## 3. Lock acquisition

- [ ] 3.1 Implement `acquireOrAttach(config): Promise<LockAcquireResult>`:
  - Ensure directory exists.
  - Call `lock(lockPath, { stale: 10_000, retries: 0 })`.
  - On success: write metadata sidecar atomically, return `{ mode: "acquired", release }`.
  - On ELOCKED: read metadata, verify liveness + identity, return `{ mode: "attach", meta }` or throw on identity mismatch.
- [ ] 3.2 Implement `writeMetadataAtomic(meta: LockMetadata)` — tmp + rename.
- [ ] 3.3 Implement `readMetadata(): LockMetadata | null` — tolerant of missing/corrupt files (returns null).
- [ ] 3.4 Unit tests: fresh acquire, already-held alive, already-held dead (stale), corrupt metadata, identity mismatch.

## 4. Liveness checks

- [ ] 4.1 `isProcessAlive(pid)` — delegate to `platform/process.ts` existing helper.
- [ ] 4.2 `isLockHolderResponsive(meta)` — calls `isDashboardRunning(meta.httpPort)` + identity check. Reuse identity-verification utility from v3.

## 5. Release on exit

- [ ] 5.1 Implement `installReleaseHandlers(release)` — registers SIGINT/SIGTERM/SIGHUP handlers + `process.on("exit")` fallback. Deletes metadata sidecar after release.
- [ ] 5.2 Windows variant: also handle `SIGBREAK` if available; document that `taskkill /F` (no graceful signal) leaves the lock for stale-detection to clean up.
- [ ] 5.3 Unit test (sigh, hard to unit-test signals cleanly): use `vi.spyOn(process, "on")` to verify handlers registered.

## 6. CLI integration

- [ ] 6.1 In `packages/server/src/cli.ts`, before `server.listen()`:
  - Call `acquireOrAttach(config)`.
  - If `mode: "attach"`: print info, `openBrowser(meta.url)`, exit 0.
  - If `mode: "acquired"`: install release handlers, continue to listen.
- [ ] 6.2 On graceful shutdown (`pi-dashboard stop`, `/api/shutdown` handler, `SIGTERM`): call `release()` before exit.
- [ ] 6.3 Respect `PI_DASHBOARD_ALLOW_MULTIPLE=1` escape hatch — skip lock entirely if set, log warning.

## 7. Server handler integration

- [ ] 7.1 Update `packages/server/src/server.ts` `shutdown()` method to accept a release callback from the CLI layer and call it.
- [ ] 7.2 Update `/api/shutdown` route to call the release callback before exiting.

## 8. Restart handoff

- [ ] 8.1 Update `packages/server/src/restart-helper.ts` orchestrator script to:
  - Wait for old PID to exit AND wait for lock to become available (`proper-lockfile.check()` poll, 100ms interval, 10s timeout).
  - Then spawn new server.
- [ ] 8.2 Unit test for the new orchestrator script (pure-function test of `buildOrchestratorScript`).
- [ ] 8.3 Integration test: `POST /api/restart`, confirm new server acquires lock after old releases.

## 9. Electron integration

- [ ] 9.1 In `packages/electron/src/main.ts`, the per-HOME lock is acquired by the spawned server process (via cli.ts), so Electron itself doesn't acquire. Verify current `app.requestSingleInstanceLock()` handles Electron-specific singleton.
- [ ] 9.2 If another Electron instance is already running: focus existing window (existing behavior).
- [ ] 9.3 If Electron acquires its own singleton but the spawned server's lock acquisition returns `mode: "attach"` (another dashboard already running CLI-style): show a dialog "A dashboard is already running at http://localhost:8000. Open in browser?" with Yes/No. On yes, `openBrowser` + quit Electron.

## 10. Extension (bridge) integration

- [ ] 10.1 The bridge's `server-auto-start.ts` already has a cascade. Lock acquisition happens INSIDE the dashboard server it spawns, so no change needed here — but confirm: when bridge's `spawnDetached` fires a pi-dashboard and that process hits "attach" mode, does the bridge correctly read the printed URL and use it? Verify and adjust if not.

## 11. Harness scenarios — family L

- [ ] 11.1 Add family L to `bootstrap-resolution-harness`'s scenarios:
  - L1: no prior dashboard
  - L2: healthy same-port
  - L3: healthy diff-port
  - L4: stale PID
  - L5: stale PID + port free
  - L6: stale PID + port taken by unrelated
  - L7: mDNS disabled (independent of lock)
  - L9: multi-HOME
  - L10: HOME symlink
  - L11: identity mismatch
  - L12: corrupt metadata
- [ ] 11.2 L8 (concurrent launch) and L13 (permission denied) go in integration tests — not pure harness.
- [ ] 11.3 Remove the "lock-file scenarios live in single-dashboard-per-home" skip markers added by proposal 1.

## 12. Integration tests

- [ ] 12.1 Add `concurrent-launch.test.ts` (integration) — spawn two `pi-dashboard` processes simultaneously, assert exactly one acquires + listens, other attaches + exits.
- [ ] 12.2 Add `crash-recovery.test.ts` — start `pi-dashboard`, SIGKILL it (no graceful cleanup), start again, assert stale lock detected and recovered.
- [ ] 12.3 Extend `test-electron-install.sh` to include a crash-recovery scenario.

## 13. Coordination with proposal (2)

- [ ] 13.1 If `unified-bootstrap-install` has landed: wrap its `bootstrapInstall` invocation inside the acquired lock scope in `cli.ts`.
- [ ] 13.2 If not: leave a clear TODO in `cli.ts` referencing this task; proposal 2 picks it up.
- [ ] 13.3 Remove scenario-3.2-skip in proposal 2's harness additions ("two simultaneous bootstraps").

## 14. Escape hatch

- [ ] 14.1 Document `PI_DASHBOARD_ALLOW_MULTIPLE=1` in `docs/architecture.md` as unsupported but available.
- [ ] 14.2 Startup log when variable set: bold warning.
- [ ] 14.3 Unit test: variable set → lock acquisition skipped, no metadata written.

## 15. Documentation

- [ ] 15.1 Update `AGENTS.md` key-files table: `home-lock.ts`, `home-lock-release.ts`.
- [ ] 15.2 Update `docs/architecture.md` with "Instance Coordination" section covering lock semantics, attach flow, multi-user case, escape hatch.
- [ ] 15.3 CHANGELOG entry: "feat: per-HOME advisory lock ensures one dashboard per user (multiple launches attach instead of starting)."

## 16. Validation gates

- [ ] 16.1 All tests green on Windows, macOS, Linux CI.
- [ ] 16.2 Manual: start two `pi-dashboard` in terminals simultaneously → second attaches.
- [ ] 16.3 Manual: SIGKILL dashboard → restart → succeeds, stale cleaned.
- [ ] 16.4 Manual multi-user on Linux: two user accounts, each starts their own dashboard, no interference.
- [ ] 16.5 Manual restart: `POST /api/restart` → new server acquires lock after brief wait.
- [ ] 16.6 Manual Electron + CLI interaction: start CLI dashboard, open Electron app → Electron shows "already running" dialog.
