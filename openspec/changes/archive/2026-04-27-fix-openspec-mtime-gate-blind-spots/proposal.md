## Why

The change-detection gate in `packages/server/src/directory-service.ts::pollOne` uses **directory mtime alone** as its freshness signal:

- list step: `mtime(<cwd>/openspec/changes/)`
- per-change status step: `mtime(<cwd>/openspec/changes/<name>/)`

On POSIX (Linux, macOS) a directory's mtime advances **only on entry create/delete/rename** — it does **not** advance when the contents of an existing file are edited in place. This is true for every common filesystem the dashboard runs on (ext4, xfs, btrfs, APFS).

So when something edits `<change>/tasks.md` directly — the agent checking off tasks via `openspec`, the user editing in their IDE, a script ticking boxes — the cache stays stuck on the previous `openspec list --json` result. Symptom in the UI: the change row shows `0/N tasks` even though most boxes in `tasks.md` are checked. The bug is masked anywhere the dashboard force-refreshes (the task-toggle endpoint, `onDirectoryAdded`, every browser-initiated `openspec_refresh`) but it surfaces in steady-state polling and after agent-driven edits.

This bug is also the reason `refreshOpenSpec(cwd)` calls `pollOne(cwd, force=true)` everywhere — the force flag papers over the broken gate by disabling caching entirely. The cost: bulk-archive triggers `openspec list` plus `openspec status` for **every** still-active change, even ones whose content didn't move at all. On a folder with 8 active changes this is `1 + 8 = 9` cold-start `openspec` spawns just to refresh the UI after archive, and the user perceives this as a multi-second post-archive delay before buttons / status badges update.

The two problems are the same problem: the mtime-based freshness signal doesn't reflect when artifact files change. Fixing the signal lets us drop the force flag and stop paying for redundant spawns at the same time.

## What Changes

User-facing:

- The "Archive completed" button updates the folder OpenSpec section in **&lt;1 s** on a typical-sized repo (was 2–6 s before).
- The change-row task counter (`X/Y tasks`) refreshes **on the next poll tick** after `tasks.md` changes, regardless of who edited it. No more stale `0/N`.

Internal (server):

- `packages/server/src/directory-service.ts`:
  - New helper `effectiveMtimeOr(paths: string[]): number | undefined` returning the **max** of all defined mtimes among the given paths (treats `ENOENT`/missing as "skip", returns `undefined` only if every path is missing).
  - List-step gate signal becomes `effectiveMtimeOr([<changes>/])`. Unchanged — adds/removes still bump the parent dir mtime.
  - Per-change status-step gate signal becomes:
    ```
    effectiveMtimeOr([
      <change>/,
      <change>/tasks.md,
      <change>/proposal.md,
      <change>/design.md,
    ])
    ```
    This catches in-place edits to the three artifact files the counter depends on, while still catching directory-entry changes (rename, archive moves, spec subtree adds).
  - `refreshOpenSpec(cwd)` switches from `pollOne(cwd, true)` to `pollOne(cwd, false)`. The mtime gate is now correct, so force-mode is no longer needed for correctness.
  - `handleOpenSpecBulkArchive` (in `packages/server/src/browser-handlers/directory-handler.ts`): no functional change beyond the inherited refresh speedup. (`archiveCompleted` itself stays sync — that work is captured in the existing `optimize-openspec-poll-burst` thread; this change is scoped to the gate.)
- `packages/shared/src/openspec-poller.ts`: no API change — the new mtime computation is internal to `directory-service.ts`. `pollOpenSpec` (sync, used by the bridge) and `pollOpenSpecAsync` (used by `refreshOpenSpec`'s fallback path) keep their current signatures.

Internal (tests):

- New test in `packages/server/src/__tests__/directory-service.test.ts`:
  1. **Stale counter via tasks.md edit** — write a `tasks.md` with 0/3 checked, poll once (gated). Edit the file in place to 2/3 checked **without** touching any directory's entries. Poll again (gated). Assert that `openspec list` is invoked again **and** `openspec status` is invoked exactly once for the edited change.
  2. **No spurious spawn on idle ticks** — poll twice with no filesystem changes. Assert zero `openspec list` and zero `openspec status` spawns on the second tick.
  3. **Archive refresh is cheap** — populate the cache for a directory with 5 changes, simulate one being archived (move its directory out, bumping `<changes>/` mtime), call `refreshOpenSpec(cwd)`. Assert that `openspec list` runs once and `openspec status` runs at most once (only for the change whose mtime might have plausibly advanced — typically zero).
- New test in `packages/server/src/__tests__/openspec-tasks-routes.test.ts` (or sibling): toggle a task via `/api/openspec/tasks/toggle`, assert the resulting `openspec_update` broadcast carries the new `completedTasks` value within one poll tick. (This is the regression fence: if anyone re-introduces force-mode, this test still passes; if anyone breaks the gate, this test fails.)

NOT in scope (deferred / orthogonal):

- Making `archiveCompleted({ cwd })` async via `runAsync` so it stops blocking the event loop. Real win, but separate axis (concurrency, not freshness). Capture as a follow-up.
- Optimistic broadcast (parsing `openspec archive`'s stdout to update the cache before the refresh round-trips). Bigger win, but bigger surface — needs CLI-output stability assumptions that haven't been validated. Capture as a follow-up.
- Watching `<change>/specs/**` files for content edits. The counter doesn't depend on spec files, so adding them to the gate signal would only serve `isComplete` updates from `openspec status` — and `isComplete` already advances when tasks all check, so the tasks.md mtime catches it transitively.
- Switching to `fs.watch`-based eventing instead of polling. Already excluded in the parent `optimize-openspec-poll-burst` change for the same cross-platform reasons.

## Impact

- Affected specs: **`server-openspec-polling`** (MODIFIED). Two scenarios are reworded to make the freshness contract explicit about file-content edits, and a new scenario covers the in-place-edit case.
- Affected code:
  - `packages/server/src/directory-service.ts` (the `pollOne` mtime helpers and `refreshOpenSpec` callsite — &lt;30 lines net)
  - `packages/server/src/__tests__/directory-service.test.ts` (new tests)
- No client-side changes. No protocol changes. No config additions. No behavior change visible to extension authors.
- Migration: none. The cache is purely in-memory; on server restart the new gate is in effect immediately.
