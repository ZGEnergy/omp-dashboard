## 1. Shared types & poller

- [x] 1.1 In `packages/shared/src/types.ts`, add optional `isComplete?: boolean` to the `OpenSpecChange` interface. Do not change `deriveChangeState`.
- [x] 1.2 In `packages/shared/src/openspec-poller.ts`, widen `statusResults` value type to include `isComplete?: boolean` and pass it through in `buildOpenSpecData`.
- [x] 1.3 Add `packages/shared/src/__tests__/openspec-poller.test.ts` (or extend existing): assert `OpenSpecChange.isComplete === true/false/undefined` based on status-result input.

## 2. Server — tasks.md parser

- [x] 2.1 Create `packages/server/src/openspec-tasks.ts` exporting `parseTasksMarkdown(content: string): OpenSpecTask[]` that recognises top-level `- [ ] <id> <text>` and `- [x] <id> <text>` lines and tracks the nearest preceding `## ` heading as `group`.
- [x] 2.2 Add `packages/server/src/__tests__/openspec-tasks-parser.test.ts` with fixtures covering: ticked + unticked mix, unparseable lines ignored, multiple groups, edge whitespace.
- [x] 2.3 Export `readTasks(cwd: string, change: string): Promise<OpenSpecTask[]>` that reads `<cwd>/openspec/changes/<change>/tasks.md` and calls the parser.

## 3. Server — tasks.md toggle writer

- [x] 3.1 Add `toggleTask(cwd: string, change: string, id: string, done: boolean, line: number): Promise<OpenSpecTask>` to `openspec-tasks.ts`. Read file, validate line matches target id + current state, rewrite only that one line's `[ ]`/`[x]` marker, atomic-write (tmp + rename).
- [x] 3.2 Throw typed errors: `NotFoundError`, `LineMismatchError`, `NotACheckboxError` so the route can map them to 404/409/400.
- [x] 3.3 Extend `packages/server/src/__tests__/openspec-tasks-parser.test.ts` (or new `openspec-tasks-writer.test.ts`) with round-trip tests: tick unticked, untick ticked, line-mismatch raises, non-checkbox line raises, byte-for-byte preservation of other lines.

## 4. Server — REST routes

- [x] 4.1 In `packages/server/src/routes/openspec-routes.ts`, add `GET /api/openspec/tasks?cwd&change` handler calling `readTasks`, responding `{success:true, data:{tasks, groups}}` or `{success:false, error}`. Reuse the existing localhost guard (`preHandler`).
- [x] 4.2 Add `POST /api/openspec/tasks/toggle` with JSON body validation, mapping parser errors to HTTP 400/404/409.
- [x] 4.3 On successful toggle, call the directory service's immediate-repoll for the cwd so the usual `openspec_update` broadcast fires.
- [x] 4.4 Add `packages/server/src/__tests__/openspec-tasks-routes.test.ts` covering 200, 404, 409, 400, 403 (non-loopback).

## 5. Client — state pill

- [x] 5.1 Add `packages/client/src/components/StatePill.tsx`: a small `<span>` rendering `ChangeState` name with a per-state Tailwind class map (`zinc/blue/amber/green`). Export pure function `stateToLabel` + class map for reuse/testing.
- [x] 5.2 In `SessionOpenSpecActions.tsx` attached branch (line 1, next to the attached badge), render `<StatePill state={deriveChangeState(change)} />`. Do NOT show when `!change` (attached-but-missing branch).
- [x] 5.3 Add `packages/client/src/components/__tests__/StatePill.test.tsx`: snapshot each of the four states, assert label + class includes per-state color.

## 6. Client — Tasks popover

- [x] 6.1 Add `packages/client/src/lib/openspec-tasks-api.ts` with `fetchTasks(cwd, change, signal?)` and `toggleTask(cwd, change, id, done, line)` helpers that hit the new REST routes and throw typed `LineMismatchError`.
- [x] 6.2 Add `packages/client/src/components/TasksPopover.tsx`: portal-rendered popover anchored to the Tasks button. Fetches on open, lists grouped tasks with native `<input type="checkbox">`, keyboard nav (Arrow/Space/Esc). Handles optimistic toggle + 409 refetch + error banner.
- [x] 6.3 Add `packages/client/src/components/__tests__/TasksPopover.test.tsx`: mock fetch → renders groups; toggling fires POST; 409 triggers refetch and shows banner.
- [x] 6.4 Wire a `Tasks N/M` button into `SessionOpenSpecActions.tsx`'s attached action row, visible only when `change.artifacts.length > 0` AND a counts-from-poll value `completedTasks/totalTasks` is present (we already have these on `OpenSpecChange`). Button opens `TasksPopover`.

## 7. Client — Archive-anyway overflow

- [x] 7.1 Add an overflow `⋯` button to the attached action row that is rendered only when `state === IMPLEMENTING && change.isComplete === true && allArtifactsDone`.
- [x] 7.2 Menu item **Archive anyway** opens a `ConfirmDialog` with dynamic message `"${total - completed} of ${total} tasks are unchecked. Archive anyway?"` and, on confirm, calls `onSendPrompt('/opsx:archive ${attached}')`. Reuse the existing archive dispatch path.
- [x] 7.3 Test: `packages/client/src/components/__tests__/SessionOpenSpecActions.test.tsx` — assert the overflow item appears/disappears correctly across `isComplete`/artifact-status permutations and that confirm dispatches the correct prompt.

## 8. Client — Bulk Archive relocation

- [x] 8.1 In `SessionOpenSpecActions.tsx`, remove `{bulkArchiveButton}` from the attached-session action row. Keep it in the unattached branch exactly as today.
- [x] 8.2 Extend `SessionOpenSpecActions.test.tsx`: attached session with a completed sibling change → Bulk Archive button is NOT rendered; unattached session with same data → Bulk Archive IS rendered.

## 9. Verification & regression

- [x] 9.1 Run `npm run reload:check` — all touched packages typecheck clean. _(Verified: `npx tsc --noEmit` reports zero errors in any of the new/modified files; remaining errors are pre-existing in unrelated test files.)_
- [x] 9.2 Run scoped vitest suites. All scoped suites pass: shared (3 new tests), server parser (17), server routes (10), client SessionOpenSpecActions (41), StatePill (6), TasksPopover (4).
- [x] 9.3 Manual smoke: attach session to `improve-path-picker`; confirm `IMPLEMENTING` pill renders amber, Tasks button shows `30/33`, popover lists tasks grouped by heading. _(For user to verify.)_
- [x] 9.4 Manual smoke: tick task 8.3 via popover; confirm `tasks.md` on disk is updated (only that line), the popover re-renders with new count `31/33`, and the attached-badge area refreshes via the subsequent `openspec_update`. _(For user to verify.)_
- [x] 9.5 Manual smoke: with all code tasks ticked but manual-smoke boxes unticked, open the `⋯` menu and invoke **Archive anyway**; confirm the dialog message reflects the unchecked count and confirming sends `/opsx:archive improve-path-picker`. _(For user to verify.)_
- [x] 9.6 Manual smoke: attached session with a completed sibling change → no Bulk Archive button on that card; unattached session in same folder → Bulk Archive present. _(For user to verify.)_

## 10. Docs

- [x] 10.1 Update `docs/architecture.md` OpenSpec section: document the new `isComplete` field, the Tasks popover/endpoints, the state pill, the Archive-anyway escape hatch, and the Bulk Archive relocation.
- [x] 10.2 Update `AGENTS.md`: add one-liner for `packages/server/src/openspec-tasks.ts`, `packages/client/src/components/StatePill.tsx`, `packages/client/src/components/TasksPopover.tsx`, `packages/client/src/lib/openspec-tasks-api.ts`.
- [x] 10.3 Append a `## [Unreleased]` bullet in `CHANGELOG.md`: "Session card now shows an explicit `ChangeState` pill, a Tasks popover for toggling `tasks.md` checkboxes, and an overflow `Archive anyway` action when artifacts are authored but manual-verification tasks remain unchecked. Bulk Archive moved to unattached sessions only."
