# Design — single-dashboard-per-home

Captures the full exploration (2026-04-20 conversation with robson) behind this proposal. Nothing should be lost on implementation.

## 1. Why per-HOME, not per-port

The invariant "one dashboard per HOME" is architecturally correct because the dashboard owns HOME-scoped state:

```
~/.pi/
├── agent/
│   ├── settings.json           ← bridge extension registration (race target)
│   └── sessions/*/              ← per-session meta, events, heartbeats (race target)
└── dashboard/
    ├── preferences.json         ← pinned dirs, ordering (race target)
    ├── headless-pids.json       ← PID registry (destructive sweeps!)
    ├── editor-pids.json         ← code-server PIDs (destructive sweeps!)
    ├── config.json              ← server config
    ├── known-servers.json       ← remote server list
    └── server.log               ← append-mode, OK with multiple writers
```

Two dashboards on 8000 + 8001 with the same HOME both:
- Register the bridge extension (last-writer-wins)
- Sweep headless PIDs on startup (can SIGTERM each other's children — test-env-guard exists for tests but NOT for live runtime)
- Write preferences on every user action (lost updates)
- Mutate session meta files (data corruption)

Per-port lock doesn't help. Per-HOME does.

## 2. Discovery cascade (existing + new)

```
┌──────────────────────────────────────────────────────────┐
│ LAYER 0 (NEW): per-HOME advisory lock                    │
│                                                          │
│ <realpath(homedir)>/.pi/dashboard/server.lock            │
│                                                          │
│ On startup:                                              │
│   - try lock non-blocking via proper-lockfile            │
│   - if locked → read metadata sidecar, verify liveness,  │
│                 ATTACH                                   │
│   - if stale → steal (proper-lockfile handles this)     │
│   - otherwise → acquire, release on exit                 │
└──────────────────────────────────────────────────────────┘
           │ (lock held OR attach decision)
           ▼
┌──────────────────────────────────────────────────────────┐
│ LAYER 1 (existing): mDNS discovery                       │
│ (used by bridge extension to find dashboard on LAN)      │
└──────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ LAYER 2 (existing): identity-verified health check       │
└──────────────────────────────────────────────────────────┘
```

Layer 0 is the hard guarantee; layers 1+2 handle legitimate distributed cases (e.g., different HOMEs on same LAN).

## 3. Why `proper-lockfile` (Q3 decision)

**Decided:** `proper-lockfile` over hand-rolled `fs.open(O_EXCL)`.

Hand-rolled handles ~95% of cases in ~40 lines. `proper-lockfile` handles:

- Stale lock detection (process-dead heuristics + heartbeat file)
- Retry with exponential backoff
- NFS and other network filesystems (uncommon but possible)
- Windows locking semantics (nontrivial — `O_EXCL` behaves differently)
- Cross-platform cleanup on graceful exit

Cost: ~30 KB + transitive deps. Acceptable.

API sketch:

```ts
import { lock, unlock, check } from "proper-lockfile";

const lockPath = path.join(realpathSync(os.homedir()), ".pi", "dashboard", "server.lock");

try {
  const release = await lock(lockPath, {
    stale: 10_000,           // lock is stale after 10s with no heartbeat
    retries: 0,              // don't retry — non-blocking semantics
    onCompromised: handleCompromised,
  });
  // Write metadata sidecar
  writeMeta({ pid: process.pid, httpPort, piPort, startedAt: Date.now(), identity });
  // ... run server
  // On graceful shutdown:
  await release();
} catch (err) {
  if (err.code === "ELOCKED") {
    const meta = readMeta();
    if (isAlive(meta)) {
      // ATTACH path
      openBrowser(meta.url);
      process.exit(0);
    }
    // Force-release + retry (shouldn't happen with stale detection)
  }
  throw err;
}
```

## 4. HOME canonicalization (exploration §Q4 followup)

```
 CAUTION: $HOME can drift.
 Git Bash on Windows sets $HOME=/c/Users/robson while os.homedir() returns
 C:\Users\robson. Symlinked homedirs on macOS (filevault migration, dotfile
 managers) cause $HOME to be a symlink to the real path.

 Solution: ALWAYS canonicalize before locking.
```

```ts
function canonicalHomedir(): string {
  const raw = os.homedir();
  try {
    return fs.realpathSync(raw);
  } catch {
    return raw;  // tolerant fallback
  }
}
```

This MUST be the only function used to build the lock path. `$HOME` env var override is deliberately ignored — using `$HOME` would allow GUI-launched vs shell-launched processes to disagree on "where HOME is."

## 5. Metadata sidecar format

```
~/.pi/dashboard/server.lock            ← proper-lockfile creates
~/.pi/dashboard/server.lock.meta.json  ← we write alongside

{
  "pid": 12345,
  "ppid": 12000,
  "httpPort": 8000,
  "piPort": 9999,
  "startedAt": 1714589234567,
  "identity": "<uuid or hash>",
  "version": "0.4.1",
  "url": "http://localhost:8000",
  "hostname": "hostname-at-launch"
}
```

Atomic writes: tmp + rename. Read errors (corrupt JSON, missing file, permission denied) → treat as stale, proceed to acquire.

## 6. Attach decision flow

```
 ┌──────────────────┐
 │ lock acquired?   │
 └────┬─────────┬───┘
      │ YES     │ NO (ELOCKED)
      │         │
      ▼         ▼
 ┌─────────┐   ┌─────────────────────┐
 │ START   │   │ read metadata       │
 │ server  │   │ sidecar             │
 └─────────┘   └──────────┬──────────┘
                          │
                          ▼
                 ┌────────────────────┐
                 │ isProcessAlive(pid)│
                 └──────┬─────────────┘
                        │
                ┌───────┴───────┐
                │ YES           │ NO
                ▼               ▼
       ┌────────────────┐   ┌────────────────┐
       │ isDashboardRun-│   │ (proper-lockfile│
       │ ning(port) +   │   │  should have   │
       │ identity match?│   │  stale-detected│
       └──────┬─────────┘   │  but didn't —  │
              │             │  force release)│
       ┌──────┴──────┐      └────────────────┘
       │ YES         │ NO
       ▼             ▼
 ┌──────────┐  ┌──────────────────────┐
 │ ATTACH   │  │ identity mismatch —  │
 │ (exit 0) │  │ error with guidance: │
 └──────────┘  │ "another dashboard   │
               │  alive but not ours" │
               └──────────────────────┘
```

## 7. Attach mechanics

- **CLI**: print info, `openBrowser(meta.url)`, exit 0.
- **Electron main**: focus existing BrowserWindow if the live instance is also Electron (IPC handshake). If live instance is CLI-only (no Electron IPC responder), open the URL in the default browser + show tray notification "Dashboard already running at http://localhost:8000".

`openBrowser` already exists in `packages/shared/src/platform/system.ts`.

## 8. Release on signal

```ts
function setupReleaseOnExit(release: () => Promise<void>) {
  const cleanup = async (signal?: string) => {
    try {
      await release();
      await fs.promises.rm(metaPath).catch(() => {});
    } catch { /* ignore */ }
    if (signal) process.exit(0);
  };
  process.on("SIGINT",  () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGHUP",  () => cleanup("SIGHUP"));
  process.on("exit",    () => { /* synchronous fallback */ });
}
```

Windows signals behave differently — SIGTERM may not fire on `taskkill` without /F. Relies on `proper-lockfile`'s stale detection to clean up from killed processes.

## 9. `/api/restart` handoff

Existing `restart-helper.ts` spawns a detached orchestrator that:

1. Waits for old server to exit
2. Starts new server
3. Verifies health

New flow:

1. Old server releases lock + deletes meta as part of shutdown
2. Orchestrator WAITS for lock to become available (poll `proper-lockfile.check()` every 100ms, timeout 10s)
3. Starts new server — new server acquires lock as normal

Alternative considered: pass lock descriptor to new process via fd. Rejected — Windows fd inheritance is flaky; `proper-lockfile` semantics don't support handoff cleanly.

## 10. Scenario matrix (family L in bootstrap harness)

```
┌── family ──────────────────────────┬── expected ─────────────────┐
│ L1. no prior dashboard             │ acquire lock, start         │
│ L2. healthy dashboard same port    │ attach, don't start         │
│ L3. healthy dashboard diff port    │ attach via metadata URL     │
│ L4. stale lock (PID dead)          │ steal, start                │
│ L5. stale PID in meta, port free   │ steal + clean + start       │
│ L6. stale PID, port taken by       │ error with actionable msg   │
│     unrelated process              │                             │
│ L7. mDNS disabled                  │ lock still works — L2/L3    │
│                                    │ flow unaffected             │
│ L8. concurrent launch              │ one wins lock, other attach │
│     (2 procs < 100ms apart)        │                             │
│ L9. multi-user                     │ both start, separate locks  │
│     (2 HOMEs, same host)           │                             │
│ L10. HOME symlink                  │ realpath canonicalizes;     │
│                                    │ both see same lock          │
│ L11. identity mismatch             │ error; no attach, no start  │
│ L12. corrupt metadata              │ treat as stale, steal       │
│ L13. lock file locked by unrelated │ error (rare — shouldn't     │
│      process (permission denied)   │ happen in practice)         │
└────────────────────────────────────┴─────────────────────────────┘
```

Integrate these cells into the bootstrap harness's cube enumeration. Some require spawning real processes; those run in `test-electron-install.sh` as integration tests, not in the pure harness.

## 11. Electron single-instance integration

Electron's `app.requestSingleInstanceLock()` is per-APP (using the app name + user data dir). Different from per-HOME:

- Two Electron apps (different versions, different installs) can both pass Electron's check.
- The per-HOME lock catches this — only one acquires, the other attaches.

Order in `main.ts`:

1. `app.requestSingleInstanceLock()` — Electron's own singleton (avoids launching two windows of the same app).
2. If acquired: proceed to server startup, which triggers per-HOME lock.
3. If another Electron instance holds #1: focus existing window (existing behavior).
4. If Electron acquired #1 but per-HOME lock is held by a CLI dashboard: attach (open browser or show embedded view to the existing CLI dashboard).

## 12. Escape hatch

`PI_DASHBOARD_ALLOW_MULTIPLE=1` environment variable. When set:

- Lock acquisition is skipped entirely.
- Startup log shows a bold warning: `[WARN] PI_DASHBOARD_ALLOW_MULTIPLE set — HOME-scoped races may cause corruption`.
- Meta sidecar is NOT written (would confuse the next lock-aware process).

Use case: automated testing (though the globalSetup tripwire already uses isolated HOMEs, so this shouldn't be needed), power users with custom isolated setups.

Document in `docs/architecture.md` as "not supported, use at own risk."

## 13. Non-obvious consequences captured

From exploration:

- **HOME canonicalization is mandatory** (§4). `$HOME` override is ignored; only `realpathSync(os.homedir())`.
- **Lock file (this proposal) must acquire BEFORE bootstrapInstall (proposal 2)** — two simultaneous first-runs would both try to `npm install` otherwise.
- **Test-env-guard's invariant** ("tests shouldn't destroy real HOME") is the same invariant in reverse — this proposal enforces it at runtime.
- **Existing `server-pid.ts` coexists** but becomes advisory; lock is source of truth.
- **`/api/restart` requires poll-for-lock pattern** (§9); fd handoff rejected.

## 14. Open items for implementer

1. **proper-lockfile on Windows/macOS/Linux CI**: confirm installs cleanly. Run `npm install proper-lockfile` in a scratch workspace on each OS runner before merging.
2. **Lock file stale duration**: 10s feels right. Too short → flaky on GC pauses; too long → slow recovery from crashes. Decide and document.
3. **Metadata `identity` field**: reuse the existing server identity (used by `isDashboardRunning` already) or mint a per-lock UUID? Recommend reuse — one source of truth.
4. **What about `server-pid.ts`?** Deprecate or keep? Recommend keep as advisory (external tools may scrape it), mark deprecated in comments, remove in a later version.
5. **Lock path under encrypted filesystem** (FileVault, dm-crypt): behaves normally. No action needed. Just document.
