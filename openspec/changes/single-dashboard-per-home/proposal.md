## Why

The dashboard's HOME directory (`~/.pi/`, `~/.pi-dashboard/`) is shared state. Multiple dashboard instances launched from the same HOME will race on:

- `~/.pi/agent/settings.json` — bridge registration writes (last-writer-wins corruption)
- `~/.pi/agent/sessions/*.meta.json` — session metadata
- `~/.pi/dashboard/preferences.json`, `pinned.json`, `known-servers.json`
- `~/.pi/dashboard/headless-pids.json` — PID registry sweeps can SIGTERM a sibling dashboard's children
- Zrok tunnel reservations — two instances competing for the same shared token

Today's discovery cascade (`server-auto-start.ts`):

```
  1. mDNS browse _pi-dashboard._tcp        (existing — works on LAN)
       ├── found → attach
       └── not found → continue
  2. isDashboardRunning(configured port)   (existing — identity-verified)
       ├── match → attach
       └── no response → continue
  3. START new server                      (can still race)
```

Gaps:

- **Different ports**: two dashboards on 8000 and 8001 are both "valid" per health check but corrupt each other's state.
- **mDNS disabled / containerized networks**: falls through to health-check only on the configured port; misses dashboards on other ports.
- **Concurrent launches** (two clicks, two terminal windows, systemd + user launch): both pass the cascade in the same millisecond and both start.
- **Crashed-without-cleanup**: PID file stale; both cascade steps treat it as "no dashboard" even if the process is alive under a different PID due to respawn.
- **Multi-user on same host**: correctly SHOULD allow two dashboards (different HOMEs). Current code makes no HOME-scoped distinction — relies on port uniqueness, which fails when both users default to 8000.

The test-isolation tripwire (`packages/shared/src/test-support/setup-home.ts`) already encodes this invariant in negative form: "tests must not share HOME with the live user" — because tests destroy HOME-scoped state. Inverting: runtime must also enforce "at most one dashboard per HOME."

## What Changes

### 1. Per-HOME advisory lock via `proper-lockfile`

- On startup, every `pi-dashboard` instance (CLI and Electron-launched) SHALL attempt to acquire `<realpath(os.homedir())>/.pi/dashboard/server.lock`.
- Canonical HOME path: `fs.realpathSync(os.homedir())` to avoid symlink drift causing two canonical locks to diverge.
- Lock file metadata (separate `.meta` sidecar): `{ pid, httpPort, piPort, startedAt, identity, version }`.
- If lock is held: read metadata, verify liveness via `isDashboardRunning(metadata.httpPort)` + identity check, and either:
  - attach (open browser to existing), or
  - if metadata says alive but identity mismatches → error with diagnostic
- If lock is stale (PID dead or metadata corrupt): `proper-lockfile` handles stale detection with configurable `staleDuration` (default 10s); steal and proceed.

### 2. HARDENED discovery cascade

```
  0. Acquire per-HOME lock                 (NEW)
       ├── acquired → continue to step 4
       └── held → read metadata, go to step 1 with hinted port

  1. mDNS browse _pi-dashboard._tcp        (existing)
  2. isDashboardRunning(hinted port)       (existing)
  3. isDashboardRunning(configured port)   (existing)
  4. START new server (lock acquired)
```

### 3. Lock release semantics

- On graceful shutdown (`pi-dashboard stop`, `POST /api/shutdown`, `SIGTERM` caught): release lock + delete metadata sidecar.
- On crash (SIGKILL, hard termination): lock remains; next startup detects stale via PID liveness + `proper-lockfile` heartbeat.
- On `/api/restart`: lock transfers to new process — the restart helper reads and re-acquires after old process exits.

### 4. Attach semantics

When an instance finds a live lock:

- Print/log: `pi-dashboard already running at http://localhost:8000 (pid 12345, started 2m ago)`
- CLI: `openBrowser(metadata.url)`, exit 0.
- Electron: focus existing Electron window via existing `requestSingleInstanceLock()` path; if the live dashboard is CLI-hosted, open it in a browser and show a tray notification.

### 5. Multi-user / multi-HOME legitimate case preserved

- Two real users on same host each have their own HOME, own lock, own port default.
- Port collision handled by auto-increment (8000 → 8001 → ...) with note in startup log. Orthogonal to lock semantics.

### Out of scope

- Cross-machine coordination (mDNS already covers LAN discovery for read-only attach; no write coordination).
- Migrating existing `server-pid.ts` PID file — lock file supersedes but PID file kept for back-compat / external tooling. Document deprecation in CHANGELOG; remove in a future cycle.
- Containerized install (Docker/Kubernetes) — HOME is typically isolated per container, so one-lock-per-container naturally fits.

## ⚠ Precondition: v3 merge + bootstrap-resolution-harness

This proposal assumes BOTH have landed:

1. `merge-windows-integration-linear` — provides `isDashboardRunning()` identity-verified, `platform/spawn.ts` unified child process APIs.
2. `bootstrap-resolution-harness` — provides the in-memory harness needed to test lock scenarios (new scenario family L).

Before starting implementation:

- Verify `proper-lockfile` works on Windows, macOS, and Linux. The package has native extensions for file locking; confirm it installs cleanly on all three via the existing CI matrix.
- Re-read `single-dashboard-per-home/design.md §5` for open items around `/api/restart` handoff and existing `server-pid.ts` — may need minor adjustment if v3 changed those.

Coordinate with `unified-bootstrap-install` — that proposal's degraded-mode first-run MUST acquire this lock before running `bootstrapInstall`. If (3) lands after (2), retrofit (2) with lock acquisition as part of this proposal.

## Impact

### Specs affected

- `instance-coordination` — NEW capability (this change's `specs/instance-coordination/spec.md`).
- `dashboard-server` — MODIFIED: startup gains lock acquisition step; shutdown releases.
- `electron-shell` — MODIFIED: first-instance check integrates with per-HOME lock (not just Electron's single-instance lock which is per-app, not per-HOME).

### Code surface

- **New**: `packages/server/src/home-lock.ts` (lock acquisition, metadata sidecar read/write, attach decision), `packages/server/src/home-lock-release.ts` (signal handlers, cleanup on exit).
- **Modified**: `packages/server/src/cli.ts` (acquire lock before listen), `packages/server/src/server.ts` (release on graceful shutdown), `packages/extension/src/server-auto-start.ts` (step 0 integration), `packages/electron/src/main.ts` (integrate with existing `app.requestSingleInstanceLock` — both gates must pass).
- **New dep**: `proper-lockfile` (~30 KB) in `packages/server/package.json` `dependencies`.

### Migration, compatibility, rollback

- **Migration**: on upgrade, first boot acquires the new lock. No user action needed. Old `server-pid.ts` PID files are read but treated as advisory (lock is the new source of truth).
- **Compatibility**: users who intentionally ran multiple dashboards per HOME (unsupported but possible) will find the second attach instead of start. CHANGELOG flags this clearly with override instructions if someone truly needs multiple instances (set `PI_DASHBOARD_ALLOW_MULTIPLE=1` env var — escape hatch documented but not advertised).
- **Rollback**: `git revert` the landing commit. Lock files become orphaned in `~/.pi/dashboard/server.lock` but `proper-lockfile`'s stale detection cleans them on next lock-aware process. Manual cleanup: `rm ~/.pi/dashboard/server.lock*`.

### Validation

- Bootstrap-harness family L (new): lock scenarios (see design.md).
- Unit tests for `home-lock.ts`: acquire success, acquire when held alive, acquire when held-but-stale, metadata corruption, identity mismatch.
- Integration test: spawn two `pi-dashboard` processes simultaneously, confirm exactly one starts and the other attaches.
- Manual multi-user test on a Linux dev machine: log in as two users, confirm each gets its own dashboard.
- Manual crash test: SIGKILL a dashboard, confirm next start cleans up and proceeds.
