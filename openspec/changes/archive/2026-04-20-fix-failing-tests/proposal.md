## Why

After the `isolate-test-environment` change landed, `npm test` completes safely without touching real `~/.pi/` state, but the suite still reports **38 failing tests across 12 files**. These failures are not introduced by isolation — they are pre-existing, accumulated over time, and were masked when tests silently ran against developer-specific state. With the new isolation guarantee, the failures are reproducible and now block any meaningful CI signal: a dev can't tell whether a PR breaks something new, because red is already the baseline.

We need to restore a green baseline so that future failures are actionable.

Observed failures (from a clean `npm test` run on the isolated HOME):

| File | Failing | Likely root cause |
|---|---|---|
| `auto-attach.test.ts` | 7/7 | Assertion expects `openspecChange` to carry a value that is now `undefined` — detector output shape drifted |
| `git-operations.test.ts` | 6/21 | Tests hard-code `master` branch; modern git init creates `main` |
| `PiResourcesView.test.tsx` | 5/6 | Component refactor broke fetch/mock shape |
| `SessionList.test.tsx` | 4/16 | Spawn button selector/label drift |
| `config.test.ts` | 3/35 | Default for `autoShutdown` changed from `true` → `false` in code; tests not updated |
| `browse-endpoint.test.ts` | 3/29 | Tests pass `os.homedir()`; under isolated HOME the dir is empty |
| `auto-shutdown.test.ts` | 2/4 | Idle-timer lifecycle / port assumptions |
| `session-lifecycle-logging.test.ts` | 2/5 | Timing or log-capture mechanism drift |
| `ws-ping-pong.test.ts` | 2/3 | WS ping-pong timing-flaky |
| `PinDirectoryDialog.test.tsx` | 2/5 | onPin callback plumbing |
| `SessionCard.test.tsx` | 1/27 | Highlight-when-selected visual assertion |
| `sleep-aware-heartbeat.test.ts` | 1/3 | Heartbeat timeout timing |

All three previously reported "isolation-caused" candidates (`browse-endpoint`, `config`, and three others I flagged as possibly-isolation-caused) are in fact either pre-existing bugs or tests that were always wrong about HOME contents — this change addresses them as pre-existing issues, not isolation regressions.

## What Changes

Systematically triage and fix each failing test. Every fix MUST land in one of three categories:

1. **Test bug → fix the test** (e.g. assertion uses stale expected value, test hard-codes `master`, component test expects removed prop).
2. **Code bug the test correctly exposes → fix the code** (rare; only when the test describes intended behavior and the code drifted).
3. **Test is fundamentally flaky and out of scope to stabilize now → skip with `.skip` and an inline TODO + tracking note** (never delete; flaky timing tests in heartbeat/ping-pong/session-lifecycle likely need dedicated rework).

**Scope includes:**
- All 38 currently-failing tests, categorized and fixed per the taxonomy above.
- Per-category root-cause investigation captured in the implementation log / commit messages.
- A passing `npm test` run at the end: 0 failures, N skips where each skip is documented.

**Scope excludes:**
- No new features or tests for untested surfaces.
- No test-framework migration, no refactor of test helpers beyond what's needed to unblock a specific failure.
- No rewriting flaky timing tests from scratch — if a timing test can't be stabilized by adjusting wait times or mocking clocks within 15 minutes, it goes to `.skip` with a tracking note.
- No changes to production default config values solely to make a test pass; if a default is wrong, that's a separate change.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `test-environment-isolation`: extend with a requirement that `npm test` finishes green (zero failures) on a clean isolated HOME. Currently the capability only guarantees safety, not correctness.

## Impact

- **Fixed test files** (up to 12): assertions updated, `master` → `main`, fetch mocks re-aligned, selector strings corrected.
- **Possibly production code** (expected: low): only if a test correctly describes intended behavior and the code is wrong. Any production-code change will be explicitly called out in the implementation log with before/after behavior.
- **`package.json`**: no changes — `npm test` script already runs safely.
- **CI signal**: after this change, a red `npm test` means a regression, not background noise.

**Compatibility**: none — test-only and narrowly-scoped code fixes. No migration. Rollback = `git revert`.

**Risk**: low. Each failing test is an independent fix. Worst case: a test turns out to be testing contradictory behavior and needs `.skip` — that's explicitly allowed.
