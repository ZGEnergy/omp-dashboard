## 1. Baseline

- [ ] 1.1 Run `cd packages/electron && npm run make` on macOS. Confirm green build and launchable app. Record any pre-existing warnings (signing, native rebuild) so post-migration delta is clean.
- [ ] 1.2 Note current behavior: tray icon visible, About menu shows on macOS, server boots, close-window hides dock. Screenshot if helpful for diff.

## 2. Create platform/ module

- [ ] 2.1 Create directory `packages/electron/src/platform/`.
- [ ] 2.2 Create `packages/electron/src/platform/tray-icon.ts` exporting `getTrayIcon(opts?: { platform?: NodeJS.Platform; resourcesDir?: string }): string`. Default `platform = process.platform`. Default `resourcesDir = process.resourcesPath`. Branches: darwin → `<resourcesDir>/trayTemplate.png`, win32 → `<resourcesDir>/icon.ico`, else → `<resourcesDir>/icon.png` (preserve current paths from `lib/tray.ts:77-80`).
- [ ] 2.3 Create `packages/electron/src/platform/node.ts` exporting `getBundledNodePath(opts?: { platform?: NodeJS.Platform; resourcesDir?: string }): string`. Default args same as 2.2. Branches: win32 → `<resourcesDir>/node/node.exe`, else → `<resourcesDir>/node/bin/node` (preserve current paths from `lib/bundled-node.ts:38`).
- [ ] 2.4 Create `packages/electron/src/platform/menu.ts` exporting `buildAppMenu(opts?: { platform?: NodeJS.Platform } & <existing menu opts>): Menu`. Move the darwin-only `{ role: "appMenu" }` template prefix from `lib/app-menu.ts:29` here. Function MUST construct via `Menu.buildFromTemplate(...)` and return the Menu instance.
- [ ] 2.5 Create `packages/electron/src/platform/app-lifecycle.ts` exporting `configureAppLifecycle(app, { platform?, getMainWindow, isQuitting }): void`. Inside, register: (a) linux ozone-platform-hint switch (when env unset), (b) darwin main-window close interception → `app.dock.hide()` unless `isQuitting()`, (c) non-darwin `window-all-closed` → `app.quit()` when no main window.
- [ ] 2.6 Create `packages/electron/src/platform/index.ts` re-exporting `getTrayIcon`, `getBundledNodePath`, `buildAppMenu`, `configureAppLifecycle`.

## 3. Unit tests for pure helpers

- [ ] 3.1 Add `packages/electron/src/__tests__/platform-tray-icon.test.ts` covering all three platform branches via injection. Assert path endings (`trayTemplate.png`, `.ico`, `.png`).
- [ ] 3.2 Add `packages/electron/src/__tests__/platform-node.test.ts` covering win32 vs non-win32 via injection. Assert `node.exe` vs `node` ending.
- [ ] 3.3 Run `npm test` — both new test files pass; no existing test regresses.

## 4. Migrate callers

- [ ] 4.1 Edit `packages/electron/src/lib/tray.ts` — replace the `if (process.platform === "darwin") { ... } else if (process.platform === "win32") { ... } else { ... }` block (lines ~77-80) with a single `getTrayIcon()` call. Keep the file's public exports unchanged.
- [ ] 4.2 Edit `packages/electron/src/lib/bundled-node.ts` — replace the `if (process.platform === "win32") { ... }` branch (line ~38) with `getBundledNodePath()`. Keep public exports unchanged.
- [ ] 4.3 Edit `packages/electron/src/lib/app-menu.ts` — replace the inline darwin template prefix (line ~29) with delegation into `buildAppMenu()` from `platform/menu.ts`. Keep public exports unchanged.
- [ ] 4.4 Edit `packages/electron/src/main.ts` — remove the three inline platform branches at lines ~20-21 (ozone hint), ~360 (dock-hide on close), ~682-683 (window-all-closed gate). Replace with a single `configureAppLifecycle(app, { getMainWindow: () => mainWindow, isQuitting: () => isQuitting })` call positioned after `app` is imported and before windows are created.
- [ ] 4.5 Verify `grep -nE 'process\.platform' packages/electron/src/main.ts packages/electron/src/lib/{tray,bundled-node,app-menu}.ts` returns ONLY the diagnostic log line in `main.ts:38` (the `log("platform=...")` statement). All other references MUST be gone.

## 5. Documentation

- [ ] 5.1 Extend `docs/architecture.md` "Cross-OS Platform Primitives" section with a subsection on `packages/electron/src/platform/` — explain it is the Electron-API-bound companion to `packages/shared/src/platform/`, list the four submodules, note why it cannot live in shared (electron import dependency).
- [ ] 5.2 Add a Key Files row in `AGENTS.md` for `packages/electron/src/platform/` with a ≤200-char one-line purpose. Delegate this edit to a general-purpose subagent per the Documentation Update Protocol (caveman style: "Electron-API-bound platform primitives. tray icon / menu template / bundled-node path / app-lifecycle hooks.").
- [ ] 5.3 Cross-reference: edit `openspec/changes/consolidate-platform-handlers/tasks.md` Step 6 — append a note under each deferred sub-task linking to this change as the follow-up that landed it. Do NOT mark them `[x]` here; that happens at archive time of THIS change.

## 6. Smoke verification

- [ ] 6.1 Run `cd packages/electron && npm run make` on macOS. Confirm exit 0 and absence of any new warnings vs the baseline from 1.1.
- [ ] 6.2 Launch the produced `.app`. Verify: (a) tray icon renders, (b) About menu item present in app menu, (c) bundled server boots (check `~/.pi/dashboard/server.log` for fresh entry), (d) closing main window hides dock instead of quitting, (e) re-clicking dock icon restores window.
- [ ] 6.3 If accessible, run a quick `npm run make` on Linux and/or Windows via `qa/Makefile` (`make test-linux-x86`) to spot-check the symmetric branches. NOT required for merge — Linux/Win32 branches are 1-line and reviewable by inspection.

## 7. Final sweep

- [ ] 7.1 Run full `npm test` from repo root. Confirm no regressions vs the pre-change baseline (note: pre-existing flaky tests documented in `consolidate-platform-handlers/tasks.md` Step 8.6 are still acceptable as long as the count doesn't grow).
- [ ] 7.2 Run `npx tsc --noEmit` for `packages/electron`. Zero new type errors.
- [ ] 7.3 Run `openspec validate electron-platform-extraction --strict`. Must pass.
- [ ] 7.4 Self-review: confirm `lib/tray.ts`, `lib/bundled-node.ts`, `lib/app-menu.ts` are now thin wrappers (≤30 lines each, no platform branches). If any wrapper is now redundant (zero callers, zero added behavior over the platform/ helper), note it for a follow-up cleanup PR — do NOT delete in this change.

## 8. Archive readiness

- [ ] 8.1 Update CHANGELOG.md `## [Unreleased]` with a one-line entry under Internal: "Extract Electron platform-specific branches into `packages/electron/src/platform/` (closes deferred Step 6 of consolidate-platform-handlers)."
- [ ] 8.2 Confirm all tasks above are checked. Run `openspec status --change electron-platform-extraction` — must show 4/4 artifacts complete + all tasks done.
- [ ] 8.3 Hand off to `openspec-archive-change` skill when ready to archive (NOT part of this task list).
