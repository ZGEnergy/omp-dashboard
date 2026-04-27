## Context

`packages/server/src/directory-service.ts::pollOne(cwd, force)` is the single point where the dashboard decides whether to spawn `openspec list --json` and `openspec status --change <name> --json`. Its freshness check is mtime-based:

```ts
const rootMtime = statMtimeOr(path.join(cwd, "openspec", "changes"));
const listCacheValid =
  gateEnabled && cache.listMtimeMs === rootMtime && cache.listResult !== undefined;

// per-change:
const changeMtime = statMtimeOr(path.join(changesRoot, c.name));
if (gateEnabled && cached.mtimeMs === changeMtime) {
  // cache hit — no spawn
}
```

This implicitly assumes that whenever something inside the directory changes, the directory's mtime advances. That's a misreading of POSIX semantics.

### POSIX directory mtime, precisely

A directory's mtime advances on:
- creating an entry (file, subdir, symlink)
- removing an entry (`unlink`, `rmdir`)
- renaming an entry into or out of the directory

It does **not** advance on:
- writing to an existing file inside the directory
- truncating an existing file
- chmod / chown of an existing file
- editing a file via `fs.writeFile` (which calls `open(O_WRONLY|O_TRUNC) → write → close` — no entry touched)

The dashboard's atomic write helper (`writeFile(tmp); rename(tmp, real)`) **does** bump dir mtime — because rename touches an entry. So `toggleTask` happens to invalidate the gate. But:
- `openspec archive` rewrites `tasks.md` in place during in-place edits via the agent
- a user opening `tasks.md` in their IDE and saving usually does in-place writes
- `openspec` CLI tooling for `change update` uses in-place writes for some flows

…and any of those leave `<change>/` mtime untouched, leaving the cache stuck.

### Why force=true masks the bug

`refreshOpenSpec(cwd)` calls `pollOne(cwd, true)` which sets `gateEnabled = false` for the entire call. Every list and every status spawns unconditionally. Three callers do this today:
- `handleOpenSpecRefresh` (browser → server `openspec_refresh`)
- `handleOpenSpecBulkArchive` (browser → server `openspec_bulk_archive`)
- `onDirectoryAdded` (called from `handlePinDirectory`)

…plus `/api/openspec/tasks/toggle` (toggle a checkbox via the dashboard tasks UI) explicitly calls `directoryService.refreshOpenSpec(cwd)` after the write. So toggles via the dashboard always look "right" because they hit this force path — which is also the slow path.

The trade today is: **slow but correct via force on every interaction**, **fast but stale via gated polling in steady state**. We want **fast and correct** in both modes. That requires fixing the gate signal; once fixed, force becomes redundant for correctness and we can drop it.

## Goals

- **G1** Counter (`completedTasks/totalTasks`) and `isComplete` reflect in-place edits to `tasks.md` / `proposal.md` / `design.md` within one poll tick.
- **G2** `refreshOpenSpec(cwd)` after bulk archive completes its broadcast fast (typically &lt;1 spawn for status) on repos where most active changes are untouched.
- **G3** No new spawns on idle ticks. The "no work to do" path stays at 0 spawns per known directory.
- **G4** No protocol or config surface changes. Internal-only.

## Non-Goals

- **NG1** Detect spec-subtree edits (`<change>/specs/**`). The counter doesn't depend on these; only `isComplete` does, and `isComplete` already moves with `tasks.md`.
- **NG2** Make `archiveCompleted` async. Separate concurrency concern; doesn't affect refresh latency.
- **NG3** Replace polling with `fs.watch`. Cross-platform footgun. Out of scope per parent change.
- **NG4** Change the cache's data layout or eviction policy.

## Decisions

### D1: Effective mtime = max over a fixed file list

```ts
function effectiveMtimeOr(paths: string[]): number | undefined {
  let max: number | undefined;
  for (const p of paths) {
    const m = statMtimeOr(p);
    if (m === undefined) continue;
    if (max === undefined || m > max) max = m;
  }
  return max;
}
```

- Treats missing files as "doesn't exist, skip". A change with no `design.md` (common) doesn't poison the gate.
- Returns `undefined` only when every input path is missing — caller already handles `undefined` as "directory removed".
- O(N stat) where N is fixed at 4 paths per change — same order of magnitude as the existing 1 stat per change.

**Alternative considered: deepest-mtime-walk.** Walk the change subtree and take the max. Catches everything but pays O(files) stat per change per gated tick. For a repo with many spec files this is prohibitively expensive vs. the bounded list. Rejected — the bounded set is sufficient because the counter and `isComplete` are derived from a fixed three-file vocabulary in practice.

**Alternative considered: file-mtime only (drop dir mtime).** Cheaper but misses archive moves and rename. Rejected — we need both signals.

### D2: Per-change file vocabulary

The three artifact files we track are `tasks.md`, `proposal.md`, `design.md`. Why not include `specs/spec.md`?

- `completedTasks` / `totalTasks` come from `tasks.md`.
- `status` field comes from `tasks.md` task counts (via openspec CLI).
- `isComplete` comes from `openspec status --change` which inspects task completion + artifact validation. Tasks dominate.
- Spec edits change deltas but not the counter and not the artifact-status badges the UI surfaces. They show up in the artifact letters (P/D/T/S) but those come from `openspec status`'s artifact list, which is keyed off file existence — and existence changes bump the directory mtime, which we still observe.

If a user creates `<change>/specs/foo/spec.md` later, `mtime(<change>/)` and `mtime(<change>/specs/)` both bump (entry creation), so the gate fires correctly. We only miss in-place spec edits, and those don't affect any UI element this code path produces.

### D3: Drop force=true from refreshOpenSpec

After D1+D2, `refreshOpenSpec(cwd)` is functionally identical to `pollDirectoryGated(cwd)` for correctness — both use the same gate that now correctly reflects file edits. Keep the function as a separate entry point for two reasons:
1. Semantic clarity at callsites (`refreshOpenSpec` says "this is a force-correct moment", `pollDirectoryGated` says "this is the periodic tick").
2. We may want to add bypass behavior back later (e.g. to handle a corrupted-cache recovery path); having a distinct entry point is cheap optionality.

The **implementation** of `refreshOpenSpec` becomes `pollOne(cwd, false)`. Its **signature** is unchanged.

### D4: Test that pins spawn counts, not wall-clock

The regression fence has to assert spawn counts so it survives CI variability:

```ts
it("does not re-spawn openspec status when no artifact file changed", async () => {
  // ... seed cache by polling once ...
  spawnSpy.mockClear();
  await ds.pollDirectoryGated(cwd);  // tick again, no fs changes
  expect(spawnSpy).not.toHaveBeenCalled();
});

it("re-spawns openspec status when tasks.md is edited in place", async () => {
  // ... seed cache by polling once ...
  await fs.writeFile(tasksMd, NEW_CONTENT);  // in-place, dir mtime unchanged
  spawnSpy.mockClear();
  await ds.pollDirectoryGated(cwd);
  expect(spawnSpy).toHaveBeenCalledTimes(1);  // openspec list — see D5
  // Plus exactly one status call for the edited change. Asserted via the
  // recipe-level mock (runOpenSpecStatus) rather than spawn-level so we
  // don't conflate list and status spawns.
});
```

### D5: List step also benefits

`tasks.md`-edit detection requires the per-change gate to fire. But the list step also has to fire — otherwise we'd serve a cached `listResult` whose `completedTasks` field is stale.

Two options:
1. **Always re-run list when any per-change gate fires.** Simple, costs at most 1 extra spawn per gated tick.
2. **Augment the list-step gate signal too:** `effectiveMtimeOr([<changes>/, ...all <change>/tasks.md files])`. Cheaper steady-state (zero spawns when nothing changed), but bounded-N stat list grows with active-change count.

Option 2 is the right choice — it scales linearly with active changes (which is bounded by user practice; even a busy repo has &lt;20 active) and keeps the steady-state idle cost at zero spawns. Implement it the obvious way:

```ts
const taskFiles = liveChangeNames.map(n => path.join(changesRoot, n, "tasks.md"));
const listMtime = effectiveMtimeOr([changesRoot, ...taskFiles]);
```

But there's a chicken-and-egg: we need `liveChangeNames` to compute the list-step gate, and that comes from the list result we're trying to gate. Resolution: derive `liveChangeNames` from the **cached** `listResult` — that's the set we'd reuse if the gate hits. If the live filesystem has new changes (added since last list) their `<changes>/` entry-creation bumps the parent dir mtime, which we still observe. If the live filesystem has fewer changes (one archived), parent dir mtime also bumps. So cached-name set is a safe basis for the gate.

Edge: first poll has no cached `listResult`. Skip the gate and run list — same as today's "cache miss" path.

## Risks

- **R1: Stat fan-out cost.** A repo with 30 active changes does 30+ stats per gated poll. Each `fs.statSync` on a hot inode is ~5–20 μs; 30 × 20 = 600 μs. Negligible compared to a single `openspec` cold start (~300 ms).
- **R2: User edits `proposal.md` and expects no behavior change.** With D2, that bump invalidates the per-change gate and re-spawns `openspec status` for that change. The status output is identical to what's cached, but we paid for the spawn. Acceptable cost for the gain — the alternative is missing edits that *do* change status (e.g. fixing artifact validation errors), which we want to surface promptly.
- **R3: Unconventional file layouts.** Some users keep notes / README / scratch files inside `<change>/`. Editing those doesn't bump our tracked-file mtimes, so the gate stays closed for them. That's correct — those edits don't affect any UI surface this code produces.
- **R4: Drop of force=true regresses some hidden invariant.** Mitigation: keep `refreshOpenSpec` as a distinct named export; add a comment on the callsite explaining why force=true is no longer needed; add the regression-fence test (toggle → broadcast carries new count).

## Migration

None. In-memory cache only; new server start re-initializes everything.
