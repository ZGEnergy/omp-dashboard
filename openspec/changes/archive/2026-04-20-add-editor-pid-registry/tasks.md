## 1. Module: editor-pid-registry

- [x] 1.1 Create `packages/server/src/editor-pid-registry.ts` with `createEditorPidRegistry()` factory exposing `register`, `remove`, `cleanupOrphans`, `size`, and an injectable `pidFilePath` option (mirror `headless-pid-registry.ts` shape).
- [x] 1.2 Define `PersistedEditorEntry` type: `{ id, pid, port, cwd, dataDir, spawnedAt }` and `EditorPidFileData = { entries: PersistedEditorEntry[] }`.
- [x] 1.3 Implement `persist()` using `writeJsonFile` from `json-store.ts`; swallow errors silently (best-effort).
- [x] 1.4 Implement `loadFromDisk()` using `readJsonFile` with `{ entries: [] }` default.
- [x] 1.5 Implement `isProcessAlive(pid)` via `process.kill(pid, 0)` in try/catch.
- [x] 1.6 Implement `getProcessCmdline(pid)` cross-platform: `/proc/<pid>/cmdline` on Linux, `ps -p <pid> -o command=` on macOS, `wmic process where ProcessId=<pid> get CommandLine /value` on Windows. Return `null` on any failure.
- [x] 1.7 Implement `isDashboardOwnedCodeServer(cmdline)` predicate: returns true iff cmdline contains `--user-data-dir` followed by a path starting with `<homedir>/.pi/dashboard/editors/`.
- [x] 1.8 Implement `cleanupOrphans()`: load file → for each entry, verify alive + ownership → SIGTERM → wait 1s → SIGKILL if still alive → log `[editor-pid-registry] cleaned N orphans` → write empty file (state belongs to the new server now).
- [x] 1.9 Use `setTimeout`-based grace period (`await new Promise(r => setTimeout(r, 1000))`) — keep `cleanupOrphans` `async`.

## 2. Tests for editor-pid-registry

- [x] 2.1 Create `packages/server/src/__tests__/editor-pid-registry.test.ts` (mirror `headless-pid-registry.test.ts` if it exists, otherwise follow `editor-manager.test.ts` style).
- [x] 2.2 Test: `register` writes an entry to the configured `pidFilePath` JSON file.
- [x] 2.3 Test: `remove` deletes the entry from the JSON file.
- [x] 2.4 Test: `cleanupOrphans` with non-existent file returns without error and does not throw.
- [x] 2.5 Test: `cleanupOrphans` with a dead PID skips it and clears the entry.
- [x] 2.6 Test: `cleanupOrphans` with a live but unowned PID (cmdline mismatch) does NOT signal it.
- [x] 2.7 Test: `cleanupOrphans` with a live owned PID sends SIGTERM (use a spawned `node -e "setInterval(()=>{},1e9)"` with a fake matching cmdline via wrapper, or stub `getProcessCmdline` and `process.kill`).
- [x] 2.8 Test: `cleanupOrphans` rewrites the file empty after sweep.
- [x] 2.9 Test: persistence write failure does not throw from `register`.

## 3. Wire registry into EditorManager

- [x] 3.1 Add an optional `pidRegistry?: EditorPidRegistry` field to `EditorManagerOptions` in `editor-manager.ts`.
- [x] 3.2 In `start()`, after the successful `setStatus(inst, "ready")` and before `startIdleTimer(inst)`, call `pidRegistry?.register({ id, pid: child.pid!, port, cwd, dataDir, spawnedAt: inst.lastHeartbeat })` (only if `child.pid` is defined).
- [x] 3.3 In the child `exit` handler, call `pidRegistry?.remove(id)` alongside the existing `cleanup(id)` call.
- [x] 3.4 In `stop()`, call `pidRegistry?.remove(id)` BEFORE sending SIGTERM (so a crash mid-stop still leaves the registry consistent on next boot).

## 4. Tests for EditorManager integration

- [x] 4.1 In `packages/server/src/__tests__/editor-manager.test.ts`, add a test that injects a stub `pidRegistry` and asserts `register` is called once after `start()` resolves to `ready`. _(Now covered by `editor-manager-pid-registry.test.ts` — uses a `vi.mock`’ed `child_process.spawn` that binds a real TCP listener on the parsed `--bind-addr` port so `waitForPort` resolves true and the production `start()` path runs end-to-end.)_
- [x] 4.2 Add a test that asserts `remove` is called when `stop(id)` is invoked. _(Covered in `editor-manager-pid-registry.test.ts`.)_
- [x] 4.3 Add a test that asserts `remove` is called when the child emits `exit`. _(Covered in `editor-manager-pid-registry.test.ts` by having the fake child emit `exit` after `kill`.)_
- [x] 4.4 Add a test that confirms `EditorManager` operates normally when `pidRegistry` is `undefined` (back-compat). _(Existing tests + new `accepts an injected pidRegistry without affecting back-compat behavior` + `operates normally when pidRegistry is undefined`.)_

## 5. Wire boot sweep into server.ts

- [x] 5.1 In `packages/server/src/server.ts`, instantiate `editorPidRegistry = createEditorPidRegistry()` near the existing `editorManager` creation (around line ~195).
- [x] 5.2 Pass `pidRegistry: editorPidRegistry` into `createEditorManager(...)`.
- [x] 5.3 In server boot (around line ~486 where the headless orphan cleanup runs), `await editorPidRegistry.cleanupOrphans()` BEFORE `registerEditorRoutes(...)` is called. _(Cleanup runs at the top of `server.start()` before `fastify.listen`; routes are registered earlier but only accept requests after listen.)_
- [x] 5.4 Verify ordering: orphan sweep → editor routes registered → server starts listening.

## 6. Manual verification

- [ ] 6.1 Build server (`npm run build` if needed) and start dashboard.
- [ ] 6.2 Click "Editor" for a folder; confirm `~/.pi/dashboard/editor-pids.json` contains an entry with the spawned `code-server` PID.
- [ ] 6.3 `kill -9 <dashboard-pid>` (simulate crash); confirm `code-server` orphan still alive (`ps aux | grep code-server`); confirm `editor-pids.json` still has the entry.
- [ ] 6.4 Restart dashboard; confirm log line `[editor-pid-registry] cleaned 1 orphans`; confirm `ps aux | grep code-server` shows no orphan; confirm `editor-pids.json` is empty.
- [ ] 6.5 Repeat 6.2–6.4 with multiple editors open across multiple folders.
- [ ] 6.6 Verify graceful shutdown path still works: start editor, `pi-dashboard stop`, confirm `code-server` exits and registry is empty (no spurious orphan entries).

## 7. Documentation

- [x] 7.1 Add `packages/server/src/editor-pid-registry.ts` row to the Key Files table in `AGENTS.md` (next to the other editor entries).
- [x] 7.2 Update `docs/architecture.md` editor section (if it covers lifecycle) with a brief note on orphan cleanup.
