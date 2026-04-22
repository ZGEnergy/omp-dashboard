# Design — optimize-openspec-poll-burst

## Problem recap & measured evidence

On the reporting host (Linux, 8 cores, Node 22.22):

```
$ time openspec list --json               → 0.53 s user CPU
$ time openspec status --change X --json  → 0.51 s user CPU
```

Known directories discovered by the server from `preferences.json` + live sessions:

| cwd                                   | active changes |
|---------------------------------------|---------------:|
| `quikdive`                            | 41 |
| `pi-agent-dashboard`                  | 17 |
| `judo-frontend-runtime`               |  5 |
| `quikdive/scripts`                    |  0 |
| **total**                             | **63 changes, 4 list calls** |

Per poll tick (30 s): 4 `list` + 63 `status` = **67 parallel node-CLI spawns**, ~33 CPU-seconds of work compressed into a single microtask burst. Observed effect in `top`: dozens of transient `node` processes, all 8 CPU cores at 100 % for ~10 s, then idle for ~20 s. Screenshots attached to the original report confirm this pattern cycle-for-cycle.

The cause is entirely in the polling scheduler; `openspec` itself is fine — each invocation only takes ~0.5 s user CPU, the damage is that 67 of them fire at the same scheduling boundary.

## Goals

1. **Preserve every observable behavior**: `openspec_update` still broadcasts, `openspec_refresh` still force-refreshes, `onDirectoryAdded` still eagerly polls a new cwd, startup still populates caches.
2. **Eliminate the CPU plateau** on a quiet repo (≥ 95 % reduction of steady-state spawns).
3. **Flatten the CPU envelope** when work is genuinely needed (no burst; spawns spread over the interval).
4. **Give power users a knob** so they can trade freshness for CPU (or vice versa) without editing code.
5. **Backwards compatible**: existing `config.json` files keep working.

## Non-goals

- **In-process openspec**: the nuclear option (import openspec as a library, run it in-process). This would drop spawn cost from ~0.5 s to ~5 ms per call, but requires a stable openspec JS API that we don't control. It's a follow-up, explicitly out of scope.
- **`fs.watch` eventing**: tempting but fragile cross-platform (inotify limits, APFS rename quirks, recursive-watch on Windows, symlink edge cases, editor-save rename-dance). Polling with an mtime gate gets us 95 % of the benefit with 5 % of the risk. Can be layered later.
- **Rewriting `scanPiResources`**: it is synchronous fs-heavy code, but (a) it's not the CPU dominator here, and (b) it touches a different code path and a different spec. Moving it to its own slower timer is trivial and part of this change, but its internals are untouched.
- **Bridge-side polling** (`GIT_POLL_INTERVAL`, `HEARTBEAT_INTERVAL`, `PROCESS_SCAN_INTERVAL`): per-session, cheap, not implicated in the observed burst. Left alone.

## Architecture

### Current

```
setInterval(30s) ─► pollAllDirectories()
                     │
                     └─► for each cwd (Promise.all, no cap):
                          ├─► openspec list --json           (spawn #1)
                          ├─► for each change (Promise.all): (spawn #2..N)
                          │    openspec status --change X
                          └─► scanPiResources(cwd)           (sync fs walk)
```

Burst factor = `dirs × (1 + avg_changes_per_dir)`. Unbounded.

### Proposed

```
setInterval(pollIntervalSeconds × 1000) ─► scheduleTick()
                                            │
                                            ├─► for each cwd:
                                            │    compute phase = hash(cwd) mod jitterSeconds
                                            │    queue(cwd) at now + phase
                                            │
                                            └─► drain queue through semaphore(maxConcurrentSpawns)
                                                 │
                                                 └─► pollOneDirectory(cwd):
                                                      ├─► stat(openspec/changes)
                                                      │    if mtime == cached ⇒ skip list
                                                      ├─► openspec list --json  (if needed)
                                                      └─► for each change:
                                                           stat(openspec/changes/<name>)
                                                           if mtime == cached ⇒ reuse cached status
                                                           else openspec status --change <name>
                                                           (each goes through the same semaphore)

setInterval(pollIntervalSeconds × 5000) ─► refreshPiResourcesAll()
```

Two key structural changes:

1. **Semaphore around `run()` / `runAsync()` calls**, not around directories. The unit of throttling is "one openspec CLI invocation", regardless of which directory or change it belongs to. This spreads the load uniformly when many dirs have fresh work at once.
2. **Per-cwd deterministic phase offset.** `hash(cwd) mod jitterSeconds` means a given directory always polls at the same offset within each interval — stable, predictable, and evenly distributed across directories. No randomness; no coordinated alignment.

### mtime gate contract

The gate is keyed on directory mtime, not file content hash. Rationale:

- On every supported filesystem, any `write`/`rename`/`unlink` inside `openspec/changes/<name>/` bumps the parent directory's `mtime`. A mtime-unchanged directory cannot have changed content through normal editing.
- `openspec/changes/` itself is watched for add/remove of change folders.
- `stat` is ~10 µs vs. `openspec status` at ~500 ms: five orders of magnitude cheaper. Even a naive per-tick stat storm is negligible.
- Edge case: some editors write via temp-file + rename, which does update mtime (rename-within-dir touches the containing dir's mtime). Confirmed on ext4, APFS, NTFS.
- Edge case: `git checkout` updates mtimes of changed files and their containing dirs — works correctly.
- Edge case: `touch -d '1970-01-01' path` would fool the gate. Accepted; the force-refresh path (user-initiated) covers it.

Cache invariant:

```ts
type PerChangeCache = Map<string /*changeName*/, {
  mtimeMs: number;           // from fs.stat of changes/<name>
  status: OpenSpecChange;    // last successful result
}>;

type DirCache = {
  listMtimeMs: number;       // from fs.stat of openspec/changes
  listResult: ListEntry[];   // last successful list result
  changes: PerChangeCache;
};
```

On every poll:

```
newListMtime = stat(openspec/changes).mtimeMs
IF newListMtime === cache.listMtimeMs AND cache.listResult exists:
    reuse cache.listResult
    skip openspec list
ELSE:
    run openspec list
    update cache.listMtimeMs, cache.listResult
    prune cache.changes keys no longer in listResult

FOR each entry in listResult:
    newChangeMtime = stat(openspec/changes/<name>).mtimeMs
    IF cache.changes.get(name)?.mtimeMs === newChangeMtime:
        reuse cache.changes.get(name).status
    ELSE:
        run openspec status --change <name>       ◄── through semaphore
        cache.changes.set(name, { mtimeMs, status })

buildOpenSpecData(listResult, statuses) → broadcast if changed (existing JSON-diff logic)
```

### Configuration wiring

`DashboardConfig.openspec` — new block:

```ts
export interface OpenSpecPollConfig {
  /** Poll interval in seconds. Default 30. Min 5, max 3600. */
  pollIntervalSeconds: number;
  /** Max concurrent `openspec` CLI invocations. Default 3. Min 1, max 16. */
  maxConcurrentSpawns: number;
  /** "mtime" = skip re-polling unchanged changes; "always" = poll unconditionally. Default "mtime". */
  changeDetection: "mtime" | "always";
  /** Max per-directory phase jitter in seconds. Default 5. Min 0 (disabled), max 60. */
  jitterSeconds: number;
}

export const DEFAULT_OPENSPEC_POLL: OpenSpecPollConfig = {
  pollIntervalSeconds: 30,
  maxConcurrentSpawns: 3,
  changeDetection: "mtime",
  jitterSeconds: 5,
};
```

Live reconfiguration: when `PUT /api/config` mutates the `openspec` block, `directoryService` is notified (existing reload pattern: re-read config and call a new `reconfigurePolling()` method that clears+restarts the timer with the new interval; in-flight polls finish on their current config).

### Semaphore

~30 lines of in-repo code; no dependency:

```ts
function createSemaphore(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    run<T>(fn: () => Promise<T>): Promise<T> { /* classic gate */ },
    setMax(n: number): void { /* resizes; drains queue if loosened */ },
    size(): number,
  };
}
```

Unit-tested in isolation. Justification for rolling our own: `p-limit` is a 2 kB dep but we already have patterns for small in-repo primitives, and the full-lifecycle `setMax` requirement (to support live reconfig) goes beyond what `p-limit`'s stable API offers cleanly.

### Jitter — deterministic phase assignment

```ts
function phaseOffsetMs(cwd: string, jitterSeconds: number): number {
  if (jitterSeconds <= 0) return 0;
  const h = fnv1a32(cwd);                    // 32-bit FNV-1a, stable & cheap
  return (h % (jitterSeconds * 1000));
}
```

Scheduling: one master `setInterval(pollIntervalSeconds * 1000)`; inside each tick, each dir is enqueued for `now + phaseOffsetMs(cwd)` via a short `setTimeout`. Result: in a 30 s interval with 5 s jitter and 4 dirs, the four directories poll at roughly t+0.2 s, t+1.4 s, t+2.9 s, t+4.1 s (values depend on hash). The semaphore further serializes the actual CLI spawns.

### Force-refresh paths

Unchanged contract, new implementation:

- `refreshOpenSpec(cwd)` — bypasses mtime gate, bypasses jitter, **still honors the semaphore** (so a hammering refresh loop still cannot spawn more than `maxConcurrentSpawns` in parallel).
- WebSocket `openspec_refresh { cwd }` — delegates to `refreshOpenSpec(cwd)` as today.
- `onDirectoryAdded(cwd)` — bypasses mtime gate on first poll (cold cache), enters normal scheduling afterwards.

## Tradeoffs & rejected alternatives

**Content hashing instead of mtime**  
Rejected: 100–500× more expensive, no observable benefit on common filesystems, doesn't handle `git checkout` any better.

**`chokidar` / `fs.watch` based eventing**  
Rejected for this change (see non-goals). Valuable later; tracked as "event-driven openspec refresh" for a future proposal.

**Single-process shared openspec worker (fork once, feed via stdin)**  
Rejected: requires openspec to support a long-running RPC mode, which it doesn't. Would be larger than the entire change we're making.

**Drop the poll entirely, only refresh on user action**  
Rejected: proposals/tasks get updated by the agent itself during a session; the dashboard needs to reflect that without a click. Polling stays.

**Randomized jitter (Math.random per tick)**  
Rejected: non-reproducible across ticks — same cwd could land at t+0.1s on one tick and t+4.8s on the next, causing visual flicker in UI staleness and harder debugging. Deterministic hash-based phase is better.

**Bigger default interval (e.g. 120 s)**  
Rejected as the primary fix: papers over the bug, degrades UX for users with few changes, still produces a (smaller) burst every tick. Keep default at 30 s; make it configurable; let the mtime gate + semaphore do the real work.

## Risk & rollback

Risk matrix:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| mtime gate misses a real change (stale UI) | Low | Medium | Force-refresh button already exists; gate can be disabled via `changeDetection: "always"` without restart |
| Semaphore deadlock / starvation | Very low | High | Covered by unit tests; no nested acquisitions anywhere in the code path |
| Live reconfig races with in-flight poll | Low | Low | `reconfigurePolling()` takes effect on next tick; current tick finishes on old config |
| Misconfigured interval (e.g. 0) locks up UI staleness | Low | Low | Clamped on load (min 5 s) |
| Jitter hash collision (two cwds get same phase) | Certain at scale | None | Semaphore absorbs it; this is expected behavior |

Rollback: revert the commit. All changes are local to `directory-service.ts`, `config.ts`, `SettingsPanel.tsx`, and tests. The config block is additive — removing it leaves a valid `DashboardConfig`.

## Test strategy (TDD-first per project policy)

Write the following tests _before_ the implementation and watch them fail:

1. `directory-service.test.ts` — mtime-gated poll does NOT call `pollOpenSpecAsync` for a cwd whose `openspec/changes` mtime is unchanged; DOES call it when mtime advances.
2. `directory-service.test.ts` — semaphore caps concurrent `pollOpenSpecAsync` invocations at configured value.
3. `directory-service.test.ts` — jitter phase is deterministic per cwd and distinct across cwds with the same interval.
4. `directory-service.test.ts` — `refreshOpenSpec(cwd)` bypasses mtime gate even when cache is fresh.
5. `directory-service.test.ts` — `reconfigurePolling({ pollIntervalSeconds: 60 })` replaces the timer cadence without losing cached data.
6. `config-openspec.test.ts` — defaults applied; out-of-range values clamped; unknown keys ignored; round-trip through `loadConfig` + JSON file is stable.
7. `settings-panel.test.tsx` — new section renders; editing a field and saving PUTs the new config; reset-to-defaults works.

Integration smoke: start server with `OPENSPEC_FIXTURE_DIR` containing a 30-change directory; assert that a second poll tick makes zero CLI invocations when no files changed.

## Observability

Add one DEBUG-level log line per poll tick (guarded behind existing `DEBUG=pi-dashboard:*`):

```
[openspec-poll] tick dirs=4 spawns=2 skipped=61 queued=0 durationMs=540
```

This gives users a way to confirm the mtime gate is working without adding UI.
