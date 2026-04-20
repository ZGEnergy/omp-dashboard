## Context

`npm test` on an isolated HOME reports 38 failures in 12 files, accumulated from prior refactors where tests silently relied on developer-specific ambient state. Now that isolation is enforced, these failures are deterministic and reproducible — but they obscure CI signal: a new regression is indistinguishable from the existing noise.

Root-cause categorization (from quick diagnostic runs):

```
  FAILURE TAXONOMY
  ════════════════════════════════════════════════════════════════

  A) Assertion drift (stale expected values)          19 tests
     └─ auto-attach (7), config (3), SessionList (4),
        PiResourcesView (5 — also fetch-mock drift)

  B) Environment assumption (git branch name)          6 tests
     └─ git-operations checkoutBranch tests hard-code `master`

  C) Test passes os.homedir() — now empty              3 tests
     └─ browse-endpoint listDirectories tests

  D) Component refactor (selector / prop drift)        3 tests
     └─ PinDirectoryDialog (2), SessionCard (1)

  E) Timing-flaky / lifecycle                          7 tests
     └─ auto-shutdown (2), session-lifecycle (2),
        ws-ping-pong (2), sleep-aware-heartbeat (1)
```

## Goals / Non-Goals

**Goals**
- `npm test` exits 0 on an isolated HOME: 0 failures.
- Every test is either fixed or explicitly `.skip`'d with an inline TODO and a one-line rationale.
- Category E failures either stabilize with small, principled changes (fake timers, higher timeouts) OR move to `.skip` with a tracking note — no time sink trying to debug deep flakes in this change.

**Non-Goals**
- Not rewriting tests from scratch.
- Not adding new test coverage.
- Not refactoring test helpers unless a specific failure requires it.
- Not changing production defaults to placate a test — if a default is wrong, that's a separate change.

## Decisions

### Decision 1: Fix by category, not by file

Each category has a shared root cause and a shared fix pattern. Grouping commits by category produces atomic, reviewable diffs.

- **Category A (assertion drift)**: read the current production output, update the expected value. If the production behavior is wrong, file a separate bug, `.skip` this test with a reference.
- **Category B (git `master`)**: replace `git checkout master` with `git -c init.defaultBranch=main init` + `git checkout main` OR detect the default branch in the test setup. Prefer explicit `main` + init config so tests are deterministic across git versions.
- **Category C (os.homedir)**: tests that call `listDirectories(os.homedir())` need to instead `mkdir` a handful of fixture entries inside the isolated HOME, then assert against those — or pass an explicit fixture path.
- **Category D (selector drift)**: read current component, update `getByRole` / `getByText` / data-testid selectors.
- **Category E (timing)**: first try `vi.useFakeTimers()` + explicit `vi.advanceTimersByTimeAsync()`. If that doesn't help in ≤15min per test, `.skip` with `// TODO(fix-failing-tests-followup): timing-flaky; see ...`.

### Decision 2: Classify production-code changes separately

When a test correctly describes intended behavior and fails because the production code drifted, the fix goes in a separate commit with the prefix `fix:` (not `test:`). Commit messages explicitly state what behavior changed and why the test was right.

### Decision 3: `.skip` is a legitimate outcome for category E

Timing tests that depend on wall-clock ping intervals, heartbeat windows, and idle timers are a long-standing pain point. Attempting to stabilize them in this change risks scope creep. A documented `.skip` is preferable to a deleted test or a persistently red suite.

Each skip MUST include:
```ts
// TODO(fix-failing-tests-followup): <one-line reason>
it.skip("should log on heartbeat timeout", async () => { ... });
```

And a bullet in a follow-up section of `openspec/changes/fix-failing-tests/tasks.md` under "Deferred timing-flake investigation" listing the skipped tests.

### Decision 4: Sequencing — categories A, B, D, C first; E last

A/B/D/C are deterministic and low-risk. Doing them first yields a visible progress curve (failures drop from 38 → ~7 quickly) and reduces the chance of a category E fix interfering with a simpler fix.

### Decision 5: Order within a category

Within each category, fix the file with the **most failures first**. If a single root cause accounts for multiple failures in the same file (e.g. all 7 `auto-attach` tests likely share one setup bug), fixing that root cause collapses N failures at once.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| A "test bug" fix masks a real production regression | Each category-A commit message must state what production value was observed and why the test's old expectation was wrong. Reviewer can catch. |
| Category E skips pile up and never get revisited | Follow-up tasks file lists them; a separate change proposal is the backlog entry. |
| Fixing one test destabilizes another via shared state | Vitest runs each file in isolation (fork pool, maxWorkers:1); shared-state risk is bounded to same-file. |
| `master` → `main` migration breaks on an older git | Tests already require a recent-enough git for init; using `-c init.defaultBranch=main` avoids system config dependency. |

## Migration Plan

Single phase, one category at a time:

```
 1. Category A  (19 tests) →  read current behavior, update expected values
 2. Category B  (6 tests)  →  git default branch fix
 3. Category D  (3 tests)  →  update selectors/mocks
 4. Category C  (3 tests)  →  fixture dirs in isolated HOME
 5. Category E  (7 tests)  →  try fake timers, else .skip with TODO
 6. Final run  →  expect 0 failures (some skips are OK)
```

Commit per category (or sub-file within a category). Each commit leaves the suite in a better-or-equal state.

Rollback: `git revert` the category commit. No production state is affected.
