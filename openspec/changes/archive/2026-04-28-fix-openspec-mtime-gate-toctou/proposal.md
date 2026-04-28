# Fix OpenSpec mtime-gate TOCTOU race + restore force-refresh on user action

## Problem

The dashboard's per-change OpenSpec cache (`packages/server/src/directory-service.ts → pollOne`) can permanently latch a stale artifact status when an artifact file is created **during** an in-flight `openspec status` CLI invocation. Once latched, the mtime gate masks the discrepancy on every subsequent tick because the cached `mtimeMs` matches the current `effectiveMtime` — so the CLI is never re-run, and the card shows e.g. `PLANNING` + yellow `T` + no `Apply` button even though `openspec status --change <name> --json` says every artifact is `done`.

Triggering this is easy: `/opsx:ff` (and similar bulk-authoring flows) writes `proposal.md → design.md → specs/**/*.md → tasks.md` back-to-back, which is exactly the window in which a 30 s poll tick is most likely to land.

### Observed example

```
CLI:        proposal=done design=done specs=done tasks=done  isComplete=true
Dashboard:  P D S T  (T yellow = "ready")  →  PLANNING  →  no Apply button
```

`tasks.md` has not been touched since the race, so the file-aware mtime gate (`fix-openspec-mtime-gate-blind-spots`) has nothing to fire on. The user-facing **refresh** button does not help either, because `refreshOpenSpec` was changed to drop `force=true` (also part of `fix-openspec-mtime-gate-blind-spots`) and now goes through the same gate.

## Root cause

```ts
// pollOne, today
const status = await semaphore.run(() => runOpenSpecStatus(cwd, c.name));   // (1)
…
for (const change of data.changes) {
  const changeMtime = effectiveMtimeOr(perChangeArtifactPaths(...));         // (2)
  cache.changes.set(change.name, { mtimeMs: changeMtime, change });
}
```

Step (2) reads the mtime **after** step (1) has finished. If a file is written between (1) start and (2) end, the cache stores `{ mtimeMs: post-write, status: pre-write }`. From the next tick onward the gate's invariant ("mtime equal ⇒ CLI result equal") is violated and the cache is stuck.

A second issue: `refreshOpenSpec` no longer bypasses the gate, so the user has no manual escape hatch when the cache is poisoned by this or any future correctness bug.

## Proposed change

Two small, surgical fixes — no schema changes, no migration:

1. **Snapshot mtime *before* the CLI call.** In `pollOne`, compute `preCallMtime = effectiveMtimeOr(perChangeArtifactPaths(...))` *before* running `runOpenSpecStatus`, then `postCallMtime` after. Cache only when `preCallMtime === postCallMtime` — otherwise discard this poll's status for that change (don't update the cache entry; the next tick re-runs the CLI naturally because the gate compares against the previous valid mtime).

2. **Restore `force=true` on user-initiated refresh.** `handleOpenSpecRefresh` (browser → server) is the canonical "user clicked the spinner" path. Make `refreshOpenSpec(cwd)` call `pollOne(cwd, true)` again. Periodic ticks stay gated. This is O(N) status spawns once per click, which was the trade-off `fix-openspec-mtime-gate-blind-spots` accepted before the gate was made file-aware — file-aware-ness covers the common case, but the user-initiated path needs an unconditional escape hatch for any future gate blind spot.

## Why now / why not just touch the file

- `touch tasks.md` unsticks the *one* card but doesn't prevent recurrence. `/opsx:ff` makes recurrence likely for anyone using the dashboard alongside fast-forward authoring.
- The TOCTOU window is intrinsic to "run CLI, then stat files" ordering; only swapping that order eliminates it.
- Restoring `force=true` on user-refresh is cheap insurance against any future blind spot in the gate (the gate is heuristic; the CLI is authoritative).

## Out of scope

- Rebuilding the gate to watch `specs/**/*.md` mtimes (already covered conceptually by `fix-openspec-mtime-gate-blind-spots`; not the cause here).
- Switching to fs.watch / chokidar (separate, larger change).
- Any change to `deriveChangeState`, `buildOpenSpecData`, or the design-evidence override.

## Risk / rollback

- **Risk:** Pre-call snapshot adds one `stat()` call per change per gated poll. Negligible.
- **Risk:** `force=true` on user-refresh re-introduces O(N) status spawns on click — but only on click, and only when the user has already decided to wait. Acceptable.
- **Rollback:** Single-file revert of `directory-service.ts`. No persistence shape changes, no cross-package coordination.

## Acceptance signal

- A new test in `packages/server/src/__tests__/directory-service-toctou.test.ts` that simulates a write between the CLI mock's resolution and `effectiveMtimeOr` and asserts the cache does **not** latch the stale status.
- Manual: `/opsx:ff` against a fresh change, observe the card transitions PDST yellow → green within one poll tick (≤ 30 s) without any extra file touches.
- Manual: clicking the OpenSpec refresh icon on a stuck card unsticks it immediately.
