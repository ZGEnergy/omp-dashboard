## Context

`packages/server/src/directory-service.ts → pollOne()` is the heart of the dashboard's OpenSpec polling. It uses an mtime-gated cache to avoid re-spawning `openspec list` / `openspec status` on every 30 s tick. The cache invariant is:

> If the **file-aware effective mtime** of a change's tracked artifact paths is unchanged since the last successful poll, the cached status is still correct.

This invariant assumes the mtime stamped into the cache reflects the file state that the CLI actually saw. Today's code stamps the mtime **after** the CLI returns:

```ts
const status = await semaphore.run(() => runOpenSpecStatus(cwd, name));   // (1) reads disk at t1
…
const changeMtime = effectiveMtimeOr(perChangeArtifactPaths(...));         // (2) reads disk at t2
cache.changes.set(name, { mtimeMs: changeMtime, change });                 // stamps t2's mtime
```

Any disk write that lands between (1) and (2) breaks the invariant: the cache now stores `{ mtimeMs: post-write, status: pre-write }`, and the gate happily reuses the stale status forever — until the user touches one of the tracked files again.

`/opsx:ff` is a near-perfect adversary: it authors `proposal.md → design.md → specs/**/*.md → tasks.md` back-to-back, so a poll tick that lands mid-`ff` is overwhelmingly likely to catch this race.

A second, related issue: `fix-openspec-mtime-gate-blind-spots` (archived 2026-04-27) intentionally removed `force=true` from `refreshOpenSpec` to make post-archive refresh O(1) instead of O(N). That was the right trade-off for the **periodic** path, but it also removed the user's only manual escape hatch when the cache is poisoned. Today, clicking the OpenSpec refresh icon on a stuck card does nothing.

## Goals / Non-Goals

**Goals:**
- Eliminate the TOCTOU race by ordering disk reads such that no in-flight write can produce a `{ mtimeMs: post-write, status: pre-write }` cache entry.
- Restore an unconditional escape hatch for user-initiated refresh — periodic ticks remain gated.
- Keep the change small enough to land as a single-file edit to `directory-service.ts` plus tests, no schema or persistence changes.

**Non-Goals:**
- Watching `specs/**/*.md` mtimes in the gate (separate concern; not the cause here — `detectCompleted` is existence-based, and `<changeDir>` mtime advances when `specs/` is created).
- Replacing the polling model with `fs.watch` / chokidar.
- Touching `buildOpenSpecData`, `deriveChangeState`, or the design-evidence override.
- Changing `DashboardConfig.openspec.changeDetection` semantics or default.

## Decisions

### Decision 1: Read mtime *before* the CLI call and re-read after; discard the result if it changed during the call

**Chosen:** "Optimistic-validation" pattern.

```ts
const preCallMtime = effectiveMtimeOr(perChangeArtifactPaths(changesRoot, c.name));
const status      = await semaphore.run(() => runOpenSpecStatus(cwd, c.name));
const postCallMtime = effectiveMtimeOr(perChangeArtifactPaths(changesRoot, c.name));

if (preCallMtime !== postCallMtime) {
  // A write landed during the CLI call. The status we got is racy.
  // Drop it on the floor — DON'T touch cache.changes for this name.
  // The next tick will see (current mtime) ≠ (last cached mtime) and re-poll.
  return;
}
// Stamp preCallMtime (== postCallMtime) and the validated status.
cache.changes.set(c.name, { mtimeMs: preCallMtime, change });
```

**Rationale:**
- Eliminates the race window with two extra `stat()` calls per change per poll — negligible cost.
- "Discard on conflict" is strictly safer than "stamp post-call mtime": worst case is one wasted CLI spawn on the next tick, not permanent latch.
- No locking required. Disk writes are cooperative — the CLI itself doesn't write to the change directory, so the only writers are `/opsx:ff`, the user's editor, the agent's `Edit` tool, etc. None of them touch the cache.

**Alternatives considered:**
- **A) Stamp `preCallMtime` unconditionally.** If a write lands during the call, the next tick sees `current ≠ pre` and re-runs the CLI — but the cache *did* get updated with stale status, so for one tick the broadcast carries wrong data. Rejected: the proposal's user-visible bug is the broadcast carrying wrong data; we want zero ticks of staleness, not one.
- **B) Stamp `postCallMtime` (today's behavior).** Documented as the bug. Rejected.
- **C) Take an exclusive flock on each artifact file before the CLI call.** Heavyweight, cross-platform footguns, breaks if the user has tasks.md open in an IDE. Rejected.
- **D) Use `fs.watch`/chokidar to invalidate the cache on any write.** Larger change, separate proposal.

### Decision 2: User-initiated refresh bypasses the gate; periodic polling does not

**Chosen:** `refreshOpenSpec(cwd)` calls `pollOne(cwd, /*force=*/true)`. Periodic `pollDirectoryGated`, `onDirectoryAdded`, and post-archive refresh continue to call `pollOne(cwd, false)`.

**Rationale:**
- `handleOpenSpecRefresh` is a user-clicked spinner. Cost: O(N) status spawns, once, when the user is already waiting. That's fine.
- Restores parity with the user's mental model: "I clicked refresh, the data should be fresh."
- Acts as a permanent backstop for any future gate blind spot — the gate is heuristic, the CLI is authoritative.

**Alternatives considered:**
- **A) Keep `force=false` and just trust Decision 1.** Rejected: leaves no manual recovery path for any future correctness bug. The cost of a manual click is near-zero.
- **B) Bypass the gate on every poll.** Reverts the `mtime` config behavior; reintroduces the burst problem `optimize-openspec-poll-burst` solved.

### Decision 3: No new tests for the existing gate behavior; one new test for the race

The race is hard to repro with real disk I/O because the timing window is microseconds. The test will mock `runOpenSpecStatus` and a deterministic clock for `statSync.mtimeMs`, simulate a write between resolution and the post-call stat, and assert that `cache.changes` does **not** contain a stamped entry for that change after `pollOne` returns. The next call to `pollOne` (with the post-write file state) should produce the correct status.

## Risks / Trade-offs

- **[Risk]** Two extra `stat()` calls per gated poll per change → **Mitigation:** measured at <100 µs each; negligible against a 30 s tick.
- **[Risk]** "Discard on conflict" can theoretically discard *every* poll if a writer is rapidly modifying tracked files at exactly the cadence of CLI runs → **Mitigation:** the writer is human or a short-lived skill; even pessimistic `/opsx:ff` finishes in seconds. Worst case: one extra CLI run on the next tick, which is exactly what the gate is designed to amortize anyway.
- **[Risk]** Restoring `force=true` on user-refresh re-introduces the O(N) spawn pattern → **Mitigation:** only on user click, not on periodic / post-archive paths. The shared semaphore (`maxConcurrentSpawns`) caps concurrent CLI work regardless.
- **[Risk]** The fix is invisible to anyone not running `/opsx:ff` → **Mitigation:** add a one-line comment block in `pollOne` citing this change name so the next archeologist understands the ordering.

## Migration Plan

- **Deploy:** single-file edit to `directory-service.ts` + new test file + `AGENTS.md` entry. No persistence shape changes, no client changes, no protocol changes.
- **Rollback:** revert the commit. The `fix-openspec-mtime-gate-blind-spots` invariant is preserved (cached entries on the rollback branch are still valid because `mtimeMs` is the same number, just stamped from a different source).
- **No flag/feature toggle.** The fix is strictly more correct; gating it behind a flag would be paranoia debt.

## Open Questions

- Should we also add a `console.warn(...)` on the discard path so we can observe how often the race actually fires in the wild? Inclination: yes, gated by `DEBUG=pi-dashboard|openspec-poll` to avoid log noise.
- Should `bulkArchive` also flip back to `force=true`? Probably yes — it's a write-then-read sequence with the same race shape — but that's a separate, smaller follow-up if we want to minimize this change's blast radius.
