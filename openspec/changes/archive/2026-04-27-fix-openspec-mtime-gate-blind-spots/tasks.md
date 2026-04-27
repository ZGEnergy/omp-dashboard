## 1. Failing tests first (TDD)

- [x] 1.1 Add regression test to `packages/server/src/__tests__/directory-service.test.ts`: poll once, edit `tasks.md` in place (no rename, no entry change), poll again with `pollDirectoryGated`, assert one new `openspec list` spawn AND one new `openspec status --change <name>` spawn for the edited change.
- [x] 1.2 Already covered by existing test `"second poll with unchanged mtimes makes zero CLI calls"` — no new test needed.
- [x] 1.3 Add regression test for archive-refresh efficiency: seed cache for a directory with 5 changes, simulate one being archived (move its dir out of `<changes>/`), call `refreshOpenSpec(cwd)`, assert `openspec list` runs exactly once and `openspec status` runs at most once.
- [x] 1.4 Skipped — the unit-level test (1.1) is the strong fence; an additional REST-level test would only confirm `refreshOpenSpec` is called, which is mocked in the existing routes test. No new signal.
- [x] 1.5 Tests written; the gate logic in `pollOne` is the unit under test — verified failing pre-implementation by the per-change cache hit-on-dir-mtime-only path.

## 2. Implementation

- [x] 2.1 Add `effectiveMtimeOr(paths: string[]): number | undefined` helper in `packages/server/src/directory-service.ts`. Treats missing paths as skip; returns `undefined` only when every path is missing.
- [x] 2.2 Update list-step gate in `pollOne`: compute list mtime as `effectiveMtimeOr([<changes>/, ...cachedChangeNames.map(n => <changes>/<n>/tasks.md)])`. On first poll (no cached `listResult`) skip the gate as today.
- [x] 2.3 Update per-change status-step gate in `pollOne`: compute change mtime as `effectiveMtimeOr([<change>/, <change>/tasks.md, <change>/proposal.md, <change>/design.md])`.
- [x] 2.4 Change `refreshOpenSpec(cwd)` to call `pollOne(cwd, false)` instead of `pollOne(cwd, true)`. Add a one-line comment at the callsite citing this change.
- [x] 2.5 Re-run the tests from §1, confirm they all pass. (7/7 mtime-gate tests pass.)

## 3. Validation

- [x] 3.1 Run full vitest suite (`npm test`); 3338 tests pass / 9 skipped / 0 failures.
- [ ] 3.2 Manual smoke: in dev mode, edit a `tasks.md` outside the dashboard (in a separate terminal), wait for the next poll tick, confirm the change-row counter updates without manual refresh. *(Deferred: requires running dev server.)*
- [ ] 3.3 Manual smoke: click "Archive completed" in folder OpenSpec section on a folder with ≥5 active changes; confirm UI updates within ~1 s (was ~3-5 s). *(Deferred: requires running dev server with multiple changes.)*
- [ ] 3.4 Manual smoke: with no filesystem changes, watch logs for one minute on a folder with 5+ changes; confirm no `openspec list` or `openspec status` invocations are logged on idle ticks. *(Deferred: requires DEBUG-enabled dev server.)*

## 4. Spec sync

- [x] 4.1 Update `openspec/changes/fix-openspec-mtime-gate-blind-spots/specs/server-openspec-polling/spec.md` (delta) with revised wording for the "Change-detection gate" requirement and a new scenario covering in-place artifact edits.
- [x] 4.2 Run `openspec validate fix-openspec-mtime-gate-blind-spots --strict`, fix any issues. (Validates clean.)

## 5. Documentation

- [x] 5.1 Add a one-paragraph note to `docs/architecture.md` (in the OpenSpec polling subsection) explaining the file-list-based mtime gate.
- [x] 5.2 No README / AGENTS.md changes (no new files, no new config, no new commands).
