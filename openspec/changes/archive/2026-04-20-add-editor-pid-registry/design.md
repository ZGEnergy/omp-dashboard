## Context

The dashboard server spawns `code-server` child processes via `EditorManager` (`packages/server/src/editor-manager.ts`). State is held purely in-memory (`instances: Map<id, …>`, `cwdIndex: Map<cwd, id>`); nothing is persisted. On graceful shutdown (`SIGTERM` → `server.stop()`), `editorManager.stopAll()` runs and `SIGTERM`s every child. On non-graceful shutdown (`SIGKILL`, crash, OOM, force-quit), `stopAll()` does not run; child code-server processes are reparented to init/launchd and continue to run, holding their port and `--user-data-dir` lockfile under `~/.pi/dashboard/editors/<folderHash>/`.

The headless agent path already solves an analogous problem with `packages/server/src/headless-pid-registry.ts`, which:
1. Persists spawned PIDs to `~/.pi/dashboard/headless-pids.json` on every register/remove,
2. Sweeps the file on server boot via `cleanupOrphans()`,
3. Reclaims live PIDs into the in-memory registry (because user sessions are expected to outlive the dashboard).

We will mirror the *persistence + boot sweep* portion of that pattern for editors. Editor semantics differ: editor instances are dashboard-internal, are not reachable after restart (no proxy route, no in-memory id), and the user does not expect them to outlive the dashboard. So instead of *reclaiming* live orphans, we *kill* them.

Stakeholders: anyone running the dashboard locally or on a long-lived server who occasionally crashes or `kill -9`s the process. The current symptom is observable: stale `code-server` trees appear under `ps aux` after a non-graceful restart.

## Goals / Non-Goals

**Goals:**
- Eliminate orphan `code-server` processes after a non-graceful dashboard restart.
- Free their bound `127.0.0.1:<port>` listeners and `--user-data-dir` lockfiles before any new editor spawns can collide on them.
- Maintain the existing in-memory `EditorManager` API surface — registry is purely additive bookkeeping.
- Idempotent and safe: missing/corrupt registry must not block startup or kill anything.
- Conservative kill verification — must never kill a `code-server` the user runs themselves.

**Non-Goals:**
- Reclaiming live orphans into the new server's `EditorManager` (no value: the new server has no proxy route mapping, the user-data-dir is fine to reuse after the orphan is killed, and the front-end has lost its iframe state anyway).
- Tracking or cleaning up the `--user-data-dir` lockfile directly (killing the owning process releases it).
- Any change to graceful shutdown behavior — `stopAll()` already works; the registry just provides a fallback.
- Changing the editor REST API, browser protocol, or config schema.
- Cross-process coordination between two simultaneously-running dashboard servers (out of scope; idle/PID-file conflicts are handled elsewhere).

## Decisions

### Decision 1: New module `editor-pid-registry.ts` instead of extending `headless-pid-registry.ts`

**Choice:** Create `packages/server/src/editor-pid-registry.ts` as a sibling module.

**Rationale:** The two have different semantics — headless *reclaims* live PIDs because user sessions outlive the dashboard; editors *kill* live orphans because they don't. Sharing one module would require a polymorphic "what to do with live orphans" callback and dilute both. A dedicated module is ~70 lines, mirrors the existing pattern, and is trivially testable.

**Alternative considered:** Generalize `headless-pid-registry` into a `process-pid-registry` with a strategy. Rejected — premature abstraction for two callers that diverge on the most important behavior.

### Decision 2: Kill (not reclaim) live orphans on boot

**Choice:** On boot, for each persisted entry whose PID is alive AND verified as a dashboard-spawned code-server, send `SIGTERM`. After a short grace period (1 second), send `SIGKILL` if still alive. Then clear the registry file.

**Rationale:** A reclaimed orphan would be unreachable — there's no proxy route mapping (`id` is gone), no idle timer, no client iframe holding it open. It would just be a memory leak with new bookkeeping. Killing returns the system to a clean state, which is exactly what the user expects after a restart.

**Alternative considered:** Reclaim and immediately call `stop()`. Rejected — adds a useless intermediate state and ties this module to `EditorManager`'s lifecycle.

### Decision 3: Kill verification heuristic

**Choice:** Before killing PID `p`, verify *both*:
1. `p` is alive (`process.kill(p, 0)` does not throw).
2. The process command line contains the expected `--user-data-dir <dashboard-owned-path>` argument. Read from `/proc/<pid>/cmdline` on Linux, `ps -p <pid> -o command=` on macOS, `wmic process where ProcessId=<pid> get CommandLine` on Windows. The "dashboard-owned path" is the prefix `~/.pi/dashboard/editors/`.

If verification fails (process replaced by an unrelated PID, or command line doesn't match), skip silently.

**Rationale:** PIDs are reused by the OS. A naive `process.kill(pid, 'SIGTERM')` after a long downtime could SIGTERM an unrelated process that happens to have the same PID. The `--user-data-dir` prefix is a strong unique marker — only the dashboard ever passes that path.

**Alternative considered:** Match by binary path (`detection.binary`). Rejected as insufficient — a user running their own `code-server` would also match. The `--user-data-dir` prefix is uniquely owned by the dashboard.

**Alternative considered:** Match by PPID (must be 1 / launchd). Rejected — too platform-specific and not load-bearing once the cmdline check passes.

### Decision 4: SIGTERM with SIGKILL escalation, 1s grace period

**Choice:** Send `SIGTERM`, wait up to 1 second, then `SIGKILL` if still alive.

**Rationale:** code-server handles `SIGTERM` cleanly within ~100ms in normal operation. 1 second is generous without making boot feel sluggish. If the process is wedged, `SIGKILL` ensures the port and lockfile are freed before the new server tries to spawn.

**Alternative considered:** SIGTERM only. Rejected — wedged orphans (the actual failure case) wouldn't be cleaned up.

### Decision 5: Persist file at `~/.pi/dashboard/editor-pids.json`

**Choice:** Use the same directory as `headless-pids.json`, with the format `{ entries: PersistedEntry[] }` mirroring the headless registry.

**Rationale:** Symmetric, discoverable, easy for users/admins to inspect or delete. The same `readJsonFile`/`writeJsonFile` helpers from `json-store.ts` apply.

### Decision 6: Hook points in `editor-manager.ts`

**Choice:** Three hook points:
1. After successful `waitForPort()` and `setStatus(inst, "ready")` in `start()`: call `registry.register({ id, pid, port, cwd, dataDir })`.
2. In the child `exit` handler: call `registry.remove(id)`.
3. In `stop()` (before SIGTERM): call `registry.remove(id)`.

The registry is injected via `EditorManagerOptions` so tests can stub it.

**Rationale:** Registering after `ready` (not after `spawn`) avoids persisting transient failures. Removing in both `exit` and `stop()` is belt-and-suspenders — `exit` covers natural deaths, `stop()` covers the case where we want the entry gone synchronously even before the OS reaps the child.

### Decision 7: Boot sweep call site

**Choice:** Call `editorPidRegistry.cleanupOrphans()` in `server.ts` next to the existing headless cleanup (around line 486), before `editorManager` accepts any new starts.

**Rationale:** Mirrors the existing pattern. Sweeping before any new spawns avoids racing with a new `start()` for the same cwd.

## Risks / Trade-offs

- **[Risk] PID reuse after long downtime kills wrong process.** → Mitigated by the cmdline-contains-`~/.pi/dashboard/editors/` verification. If verification fails, skip silently.
- **[Risk] Cmdline lookup fails or differs across platforms.** → On lookup failure, treat as "cannot verify" and skip. Worst case: the orphan survives, matching today's behavior.
- **[Risk] Performance of cmdline lookup on boot.** → At most `maxInstances` (default 3) entries in the file. One `ps` / `/proc` read each. Negligible.
- **[Risk] Two dashboard servers running concurrently corrupt the registry.** → Out of scope; the existing PID-file/port-conflict guards in `server-pid.ts` prevent this in normal operation. If a user forces two instances, the registry file is best-effort and not load-bearing for correctness.
- **[Risk] Persist-on-every-spawn write amplification.** → A handful of writes per editor lifecycle. Trivial.
- **[Trade-off] Killing instead of reclaiming means any unsaved code-server state in the orphan is lost.** → Acceptable: code-server persists its state in `--user-data-dir`, which is reused by the next spawn. Unsaved buffers are lost regardless after a dashboard crash because the iframe disconnected.
- **[Risk] `1 second` grace period may be too short on heavily loaded systems.** → Make it a constant in the module so it can be tuned; not exposed to user config.

## Migration Plan

1. Land the new module + hook points in a single commit.
2. No data migration required — `editor-pids.json` will be created lazily on first editor spawn after upgrade.
3. Existing orphan code-server processes from before the upgrade are NOT cleaned by this change (they were never persisted). User can `pkill -f "code-server.*--bind-addr 127.0.0.1.*--user-data-dir.*\.pi/dashboard/editors"` once.
4. Rollback: delete `~/.pi/dashboard/editor-pids.json` and revert the commit. No persistent side effects.

## Open Questions

- Should the boot sweep also delete stale per-folder lock files under `~/.pi/dashboard/editors/<hash>/` if the owning process is gone but we couldn't kill it (e.g., zombie / EPERM)? **Tentative answer: no — code-server reuses these dirs across restarts; deleting them would lose user editor state (open tabs, layout). Leave alone.**
- Should we log a single `[editor-pid-registry] cleaned N orphans` line on boot? **Tentative answer: yes, mirror headless registry's logging style.**
