# Tasks

## 1. Reproduction + baseline (systematic-debugging, performance-optimization)

- [ ] 1.1 Write a regression test fixture: a session whose cwd has many changed files (e.g. 100) plus one >100 MB tracked file. Assert (pre-fix) that a concurrent `/api/health` call is delayed while `/api/session-diff` runs — capture the baseline latency.
- [ ] 1.2 Record baseline numbers (diff wall-time, peak event-loop block) in the test as the before/after anchor.

## 2. Batched single-spawn content diff

- [ ] 2.1 Add `diffAll` / `diffAllOr` to `packages/shared/src/platform/git.ts`: one `git diff -z HEAD` (no per-path arg) over the whole worktree, built on `runAsync` (async, non-blocking). Retain the existing sync `diffOr` for other callers.
- [ ] 2.2 Add a splitter that parses the `-z` NUL-delimited unified-diff stream into a `Map<path, diffText>`, mirroring `gitNumstat`'s per-file keying. Handle rename/copy headers to the NEW path (consistent with `parsePorcelain`).
- [ ] 2.3 In `enrichWithGitDiff`, replace the per-file `git.diffOr({ cwd, path })` call inside `files.map(...)` with a single up-front `diffAllOr({ cwd })` + map lookup. Untracked/synthetic new-file diffs keep their existing `readFileSync` path (already batched detection, no git spawn).

## 3. Tracked-file size + binary cap

- [ ] 3.1 Add `TRACKED_DIFF_MAX_BYTES` (default 5 MB) next to `SYNTHETIC_DIFF_MAX_BYTES` in `session-diff.ts`.
- [ ] 3.2 Before assigning a batched `gitDiff` to a file entry, guard on the diff text length (and/or on-disk blob size via `statSync`) against `TRACKED_DIFF_MAX_BYTES`. Over-cap → keep `additions`/`deletions` from numstat, omit `gitDiff`. Binary rows (numstat `-`) already omit counts; ensure they also omit `gitDiff`.
- [ ] 3.3 Never `git diff` a file that numstat flagged binary — rely on the batched output already excluding binary hunks; assert no utf-8 read of an oversized blob occurs.

## 4. Off the event loop (async)

- [ ] 4.1 Make `enrichWithGitDiff` and `enrichWithVcsDiff` `async` (they now `await diffAllOr`). Update `gitNumstat` call site if it stays sync (numstat is one spawn — acceptable) or migrate it to `runAsync` for consistency.
- [ ] 4.2 Make `buildSessionDiff` `async`; `await` the two `enrichWithGitDiff` calls (owned + other).
- [ ] 4.3 In `packages/server/src/routes/session-routes.ts`, `await buildSessionDiff(events, session.cwd)`. Confirm no remaining `spawnSync` git call is reachable from the session-diff route.

## 5. Result cache + single-flight

- [ ] 5.1 Add `packages/server/src/session/session-diff-cache.ts`: a per-session TTL cache keyed by `(sessionId, HEAD sha, dirty-signature)` where dirty-signature derives from the porcelain output (cheap, one spawn already run for detection). Default TTL ~2 s.
- [ ] 5.2 Add single-flight: concurrent requests for the same key coalesce onto one in-flight `Promise` instead of each spawning a diff. Evict on TTL expiry; bound the map size.
- [ ] 5.3 Wire the cache into the route (or `buildSessionDiff`): cache hit → return stored result; miss → compute once, store, return.

## 6. Tests

- [ ] 6.1 Batching: a session with 50 changed files produces exactly ONE `git diff` spawn for content (assert via a spy/mock on the git runner), not 50.
- [ ] 6.2 Size cap: a tracked file whose diff exceeds `TRACKED_DIFF_MAX_BYTES` is listed with `additions`/`deletions` present and `gitDiff` absent; no utf-8 read of the oversized blob.
- [ ] 6.3 Event-loop responsiveness: with the many-file + large-file fixture, a `/api/health`-equivalent tick resolves within the budget (< 100 ms) while the diff computes (regression guard from 1.1).
- [ ] 6.4 No `spawnSync` on the path: assert the session-diff route uses only async spawns for git (mock/spy asserts `spawnSync` git is not called).
- [ ] 6.5 Cache/single-flight: two concurrent identical requests trigger ONE diff computation; a second request within TTL returns the cached result without recomputing; a HEAD/dirty change busts the cache.
- [ ] 6.6 Contract parity: the batched path produces byte-identical `gitDiff` output to the old per-file path for a normal small-diff session (golden fixture).

## 7. Documentation

- [ ] 7.1 Update `packages/server/src/session/session-diff.ts.AGENTS.md` and `packages/shared/src/platform/git.ts` tree rows (new `diffAllOr`, async enrichers, cap constant) per the Documentation Update Protocol.
- [ ] 7.2 Note the event-loop-safety + cap contract in `docs/architecture.md` session-diff section (delegate `docs/` prose per Rule 6).
