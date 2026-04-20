## Why

When the dashboard server exits non-gracefully (SIGKILL, crash, OOM, force-quit), it does not run `editorManager.stopAll()`, and the spawned `code-server` child processes are reparented to init/launchd instead of being terminated. They continue to:

- hold their bound `127.0.0.1:<port>` listener,
- hold the `--user-data-dir` lockfile under `~/.pi/dashboard/editors/<folderHash>/`,
- consume RAM and CPU (one Node entry process plus an extension-host fork plus language-server children).

The new dashboard server has no record of them (editor state is purely in-memory), so subsequent "Editor" clicks for the same folder spawn a *second* code-server tree against the same user-data-dir, which can collide with the orphan's lockfile and cause weird "another instance is running" / file-watcher conflicts. There is currently no automated cleanup; the user must `pkill` orphans manually.

The headless agent path already solved this exact problem with `headless-pid-registry.ts`, which persists spawned PIDs to disk and sweeps orphans on server boot. We should mirror that pattern for editors.

## What Changes

- Add a new `editor-pid-registry` module (server-side) that persists spawned editor instances (PID, port, cwd, dataDir, startedAt, id) to a JSON file under `~/.pi/dashboard/`.
- Hook `editorManager.start()` to write a registry entry after a successful spawn.
- Hook `editorManager.stop()` and the child `exit` handler to remove the entry.
- On server boot, sweep the registry: for each entry whose PID is still alive AND whose process command line matches a code-server invocation owned by this dashboard (binary path + `--user-data-dir` under `~/.pi/dashboard/editors/`), send SIGTERM (then SIGKILL after a grace period if still alive). Then clear the registry.
- No new user-facing API. No config changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `editor-manager`: add a requirement that spawned instances are tracked in a persistent PID registry and that orphaned code-server processes from a previous server lifetime are cleaned up on startup.

## Impact

- **Code**:
  - New: `packages/server/src/editor-pid-registry.ts` (~60–80 lines, mirrors `headless-pid-registry.ts`).
  - Modified: `packages/server/src/editor-manager.ts` — add registry add/remove hooks at spawn / exit / stop sites.
  - Modified: `packages/server/src/server.ts` — call `editorPidRegistry.cleanOrphansOnStartup()` next to the existing headless orphan cleanup (around line 486).
- **Persistence**: new file `~/.pi/dashboard/editor-pids.json` (small, ephemeral, safe to delete).
- **Behavior**: idempotent and safe — if the registry is missing or corrupt, startup proceeds normally and no orphans are killed (worst case = today's behavior).
- **Risk**: must verify each PID's command line before killing, to avoid killing an unrelated `code-server` the user runs themselves. Use the same conservative pattern as `headless-pid-registry` (match against expected binary path AND the dashboard-owned `--user-data-dir` prefix).
- **No breaking changes.** No API, protocol, or config surface affected.
