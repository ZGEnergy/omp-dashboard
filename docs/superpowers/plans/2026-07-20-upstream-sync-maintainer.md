# Upstream Sync Maintainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic upstream sync with detector, immutable request, behavior-ledger assessment, plan-bound executor, and audited PR flow defined in [`docs/superpowers/specs/2026-07-20-upstream-sync-maintainer-design.md`](../specs/2026-07-20-upstream-sync-maintainer-design.md).

**Architecture:** Canonical skill source lives at `.pi/skills/omp-dashboard-upstream-sync/`. Detector publishes immutable request to persistent inbox. Maintainer writes committed assessment plan. Executor validates exact plan bindings, mutates fresh pinned-base worktree, and emits candidate metadata. Required checks finish before push. PR manager handles one audited PR outside detector and executor mutation paths.

**Tech Stack:** Node.js ESM, Bash, GitHub Actions, GitHub API, JSON fixtures, Vitest, Python eval-viewer.

## Global Constraints

- [ ] Keep all mutations inside isolated worktree.
- [ ] Use `.pi/skills/omp-dashboard-upstream-sync/` as canonical skill source.
- [ ] Use `upstream-sync/ledger/obligations.json` as repo-relative mutable ledger path.
- [ ] Let explicit checked installer alone update `/home/joe/.omp/agent/managed-skills/omp-dashboard-upstream-sync/`.
- [ ] Copy `SKILL.md` only. Never copy ledger, assessment, or approval artifacts.
- [ ] Keep real `/home/joe/.omp/agent/managed-skills/omp-dashboard-upstream-sync/` installation after merge and explicit user deployment request only.
- [ ] Do not auto-merge, auto-land, or auto-deploy.
- [ ] Do not create draft PRs.
- [ ] Open one normal ready-for-review PR only after local validation.
- [ ] Grant detector `contents: read` and `issues: write` only.
- [ ] Do not use `pull_request_target`.
- [ ] Start executor only after immutable assessment plan commit and hash exist.
- [ ] Run all checks before push.
- [ ] Keep required CI failures from landing automatically.
- [ ] Escape and treat upstream prose and data as untrusted.
- [ ] Preserve exact upstream pins, ledger revision, decision set, plan commit, plan hash, verifier version, and verifier digest.
- [ ] Keep path classes as investigation hints, never disposition authority.
- [ ] Route docs writes, including `docs/upstream-sync.md` and `docs/AGENTS.md`, through general-purpose subagent using project caveman style.
- [ ] Keep `unaffected`, `adopt-upstream`, `preserve-zge`, `combine`, `retire`, and `blocked` disposition semantics from approved design.

## Dependencies

- [ ] Complete Task 1 before Task 6 skill packaging and fixture execution.
- [ ] Complete Task 2 before Tasks 3, 4, and 5 contract consumers.
- [ ] Complete Task 3 before Task 4 executor cutover.
- [ ] Complete Tasks 1 through 5 before Task 6 end-to-end skill evaluation.
- [ ] Complete Tasks 1 through 6 before Task 7 CI and documentation cutover.

## Task 1: Canonical skill packaging and deterministic installer

**Files:**

- Create `.pi/skills/omp-dashboard-upstream-sync/SKILL.md`.
- Create `.pi/skills/omp-dashboard-upstream-sync/evals/evals.json`.
- Create `.pi/skills/omp-dashboard-upstream-sync/AGENTS.md`.
- Create `scripts/install-managed-skill.sh`.
- Create `scripts/upstream-sync/install-managed-skill.mjs`.
- Modify `.pi/skills/AGENTS.md`.
- Modify `scripts/AGENTS.md`.
- Test `scripts/__tests__/install-managed-skill.test.mjs`.

**Consumes:** Canonical `SKILL.md` bytes; fixed managed destination; `--check` or `--install` command; helper `{source, destination, mode}` arguments.

**Produces:** `installManagedSkill({source, destination, mode})`; deterministic skill artifact; byte-equality report; atomic managed `SKILL.md` replacement; installer exit status; skill frontmatter with push-trigger sync/audit requests and deterministic artifact references.

- [ ] Write installer tests before implementation. Test helper with temporary controlled source/destination paths. Test `--check` drift detection, byte-identical `--install` synchronization, destination traversal rejection, destination symlink rejection, and atomic replacement boundary. Test shell CLI argument handling without invoking real managed-runtime `--install`.
- [ ] Run focused test in RED state: `npm test -- scripts/__tests__/install-managed-skill.test.mjs`. Expected: FAIL because `scripts/install-managed-skill.sh` and canonical skill artifacts do not exist.
- [ ] Define shell CLI source and destination as fixed constants. Accept only `--check` and `--install`. Reject any destination outside `/home/joe/.omp/agent/managed-skills/omp-dashboard-upstream-sync/`. Resolve symlink and parent traversal before mutation.
- [ ] Export `installManagedSkill({source, destination, mode})` for tests. Let shell CLI call helper with fixed production paths.
- [ ] Keep implementation tests inside isolated worktree. Never invoke real managed-runtime `--install` during implementation.
- [ ] Implement `--check` as byte comparison with nonzero drift result. Implement `--install` as temporary-file write, byte verification, atomic rename, and post-install byte comparison. Keep installer as only managed-copy writer.
- [ ] Write skill frontmatter that triggers sync/audit requests on push and references repo-relative `upstream-sync/ledger/obligations.json`, request, plan, validator, verifier, and fixture artifacts. Keep upstream text escaped and untrusted. Document canonical-source boundary in local `AGENTS.md` files.
- [ ] Run focused test in GREEN state: `npm test -- scripts/__tests__/install-managed-skill.test.mjs`. Expected: PASS with drift, synchronization, traversal, symlink, and atomicity assertions.
- [ ] Run code review gate. Reviewer checks fixed paths, byte equality, atomic replacement, symlink defense, trigger scope, and canonical-source wording against approved design spec.
- [ ] Commit Task 1: `git add .pi/skills/omp-dashboard-upstream-sync .pi/skills/AGENTS.md scripts/install-managed-skill.sh scripts/upstream-sync/install-managed-skill.mjs scripts/AGENTS.md scripts/__tests__/install-managed-skill.test.mjs && git commit -m "feat: add deterministic upstream sync skill installer"`.

## Task 2: Versioned ledger, request, assessment, and plan contract

**Files:**

- Create `scripts/upstream-sync/contracts.mjs`.
- Create `upstream-sync/ledger/obligations.json`.
- Create `upstream-sync/AGENTS.md`.
- Create `scripts/upstream-sync/fixtures/valid-ledger.json`.
- Create `scripts/upstream-sync/fixtures/valid-request.json`.
- Create `scripts/upstream-sync/fixtures/valid-plan.json`.
- Create `scripts/__tests__/upstream-sync-contracts.test.mjs`.
- Modify `scripts/AGENTS.md`.
- Modify `.pi/skills/omp-dashboard-upstream-sync/AGENTS.md`.

**Consumes:** Repo-relative `upstream-sync/ledger/obligations.json`; request and plan JSON values; worktree root; relative proof path.

**Produces:** `validateLedger(value)`; `validateRequest(value)`; `validatePlan(value)`; `canonicalJson(value)`; `sha256Canonical(value)`; `resolveProofPath(worktree, relativePath)`; versioned fixture contracts.

- [ ] Write contract tests before implementation. Cover canonical ledger and valid ledger, request, and plan; missing fields; unknown fields; duplicate stable obligation IDs; unsupported disposition; changed canonical hash; absolute proof path; parent traversal proof path; symlink proof path escape.
- [ ] Run focused test in RED state: `npm test -- scripts/__tests__/upstream-sync-contracts.test.mjs`. Expected: FAIL because contract exports and fixtures do not exist.
- [ ] Define schemas with required schema versions, stable obligation IDs, scope and dependency roots, expiry and recheck trigger, owner, pins, ledger revision, dispositions, behavior/test/wiring proof, plan commit/hash, verifier version, and verifier digest. Reject unknown fields and duplicate IDs.
- [ ] Seed canonical repo-relative `upstream-sync/ledger/obligations.json` with `schema_version` and reviewed accepted obligations for ZGE-only push/VAPID, OMP settings/agent paths, deploy/installer, and sync tooling. Give each stable ID, observable contract, provenance, evidence paths, scope, dependency roots, owner, review date, expiry, and recheck trigger. Keep valid fixtures separate.
- [ ] Implement deterministic canonical JSON ordering and SHA-256 hashing. Implement `resolveProofPath(worktree, relativePath)` with absolute, parent traversal, and symlink escape rejection while preserving a path inside worktree.
- [ ] Add valid fixtures that exercise every required field and approved disposition. Keep fixture paths relative and machine-checkable.
- [ ] Run focused test in GREEN state: `npm test -- scripts/__tests__/upstream-sync-contracts.test.mjs`. Expected: PASS for valid inputs and every rejection boundary.
- [ ] Run code review gate. Reviewer compares field requirements, disposition enum, hash algorithm, proof-path confinement, and fixture shape with approved design spec.
- [ ] Commit Task 2: `git add upstream-sync/ledger/obligations.json upstream-sync/AGENTS.md .pi/skills/omp-dashboard-upstream-sync/AGENTS.md scripts/upstream-sync/contracts.mjs scripts/upstream-sync/fixtures/valid-ledger.json scripts/upstream-sync/fixtures/valid-request.json scripts/upstream-sync/fixtures/valid-plan.json scripts/__tests__/upstream-sync-contracts.test.mjs scripts/AGENTS.md && git commit -m "feat: define upstream sync contracts and proof paths"`.

## Task 3: Deterministic assessment, plan binding, and invariant validation

**Files:**

- Create `scripts/upstream-sync/validator.mjs`.
- Delete `scripts/upstream-sync/approval.mjs`.
- Create `scripts/__tests__/upstream-sync-validator.test.mjs`.
- Delete `scripts/__tests__/upstream-sync-approval.test.mjs`.
- Modify `scripts/AGENTS.md`.

**Consumes:** Upstream range; repo-relative `upstream-sync/ledger/obligations.json`; request; plan; worktree.

**Produces:** `evaluateAffectedObligations({upstreamRange, ledger})`; `validatePlanBinding({request, ledger, plan})`; `validatePostMergeInvariants({worktree, plan})`; deterministic decision, binding, and invariant verdicts.

- [ ] Write validator tests before implementation. Cover unaffected, adopt-upstream, preserve-zge, combine, retire, and blocked outcomes; stale and expired isolation; missing proof; affected blocked hard stop; unaffected blocked carry-forward; changed pin, ledger revision, and plan hash; post-merge preservation invariant loss.
- [ ] Run focused test in RED state: `npm test -- scripts/__tests__/upstream-sync-validator.test.mjs`. Expected: FAIL because validator exports do not exist.
- [ ] Implement deterministic affected-obligation isolation from scope and dependency roots. Mark stale and expired records. Block affected missing-proof, expired non-tombstoned, and blocked records. Carry forward unrelated blocked records with owner and recheck trigger.
- [ ] Implement plan binding across base SHA, upstream SHA, ledger revision, complete decision set, plan commit, plan hash, verifier version, and verifier digest. Reject changed binding values. Keep command and file contracts free from review artifacts.
- [ ] Implement post-merge preservation invariants and return failure before push when required push, OMP, deploy, workflow, or dependency wiring disappears.
- [ ] Run focused test in GREEN state: `npm test -- scripts/__tests__/upstream-sync-validator.test.mjs`. Expected: PASS for every decision, isolation, binding, injection, and invariant assertion.
- [ ] Run code review gate. Reviewer checks deterministic outcomes, exact plan binding, stale/expiry rules, no external review dependency, no review artifact, and pre-push invariant failure.
- [ ] Commit Task 3: `git add scripts/upstream-sync/validator.mjs scripts/__tests__/upstream-sync-validator.test.mjs scripts/AGENTS.md && git rm scripts/upstream-sync/approval.mjs scripts/__tests__/upstream-sync-approval.test.mjs && git commit -m "feat: add deterministic sync assessment validator"`.

## Task 4: Cut over shell executor; create audited ready-for-review PR

**Files:**

- Replace `scripts/upstream-sync.sh`.
- Delete `scripts/lib/upstream-sync-policy.sh`.
- Delete `scripts/__tests__/upstream-sync-policy.test.mjs`.
- Create `scripts/__tests__/upstream-sync-executor.test.mjs`.
- Modify `scripts/AGENTS.md`.

**Consumes:** `detect`, `validate`, `execute --request <path> --ledger <path> --plan <path>`, and `verify` commands; repo-relative `upstream-sync/ledger/obligations.json`; pinned-base Node validators; immutable request, ledger, and plan artifacts.

**Produces:** Deterministic shell command boundary; fresh worktree at base SHA; exact upstream SHA merge; plan-disposition mutations; exact audited sync branch commit and push; one normal ready-for-review PR; candidate metadata.

- [ ] Write executor tests before implementation. Cover no push or PR before local validation, exact pin use, upstream-result script exclusion, affected blocked hard stop, failed verification hard stop, failed validator preventing push and PR, changed plan hash preventing execution, and absence of `--ours` or `--theirs` conflict defaults.
- [ ] Run focused test in RED state: `npm test -- scripts/__tests__/upstream-sync-executor.test.mjs`. Expected: FAIL because replacement executor behavior does not exist.
- [ ] Replace shell policy flow with `detect`, `validate`, `execute`, and `verify`. Invoke validators from pinned-base Node copy outside merge-result tree. Create fresh isolated worktree at pinned base SHA, merge exact upstream SHA, apply only plan dispositions, validate exact upstream pin, plan hash, affected blocked state, post-merge invariants, and all required checks before commit, push, or PR creation.
- [ ] Remove `scripts/lib/upstream-sync-policy.sh` and its test. Remove automatic path-policy merge and every merge-result script invocation. Preserve ordinary conflict handling; do not add `--ours` or `--theirs` defaults.
- [ ] Commit exact audited sync branch after local validation. Push exact branch. Open one normal ready-for-review PR after push. Never create draft PR. Never merge main. Never deploy.
- [ ] Hard-stop affected blocked records, failed verification, plan-hash mismatch, and exact-pin mismatch before push or PR creation.
- [ ] Render PR body only after every hard stop passes. Include upstream pin and range, disposition and content summary, verification results, residual risks, and near-miss decisions. Keep upstream prose and data escaped and inert.
- [ ] Run focused test in GREEN state: `npm test -- scripts/__tests__/upstream-sync-executor.test.mjs`. Expected: PASS with binding, pin, validator, mutation, branch, push, PR readiness, conflict, and PR-body assertions.
- [ ] Run code review gate. Reviewer checks command surface, pinned-base validator provenance, exact SHA merge, mutation ordering, plan-disposition boundary, pre-push validation, hard-stop outcomes, exact branch identity, normal ready-for-review PR state, no draft, no main merge, no deploy, deleted policy path, and absent conflict shortcut.
- [ ] Commit Task 4: `git add scripts/upstream-sync.sh scripts/__tests__/upstream-sync-executor.test.mjs scripts/AGENTS.md && git rm scripts/lib/upstream-sync-policy.sh scripts/__tests__/upstream-sync-policy.test.mjs && git commit -m "feat: cut over upstream sync executor and audited PR"`.

## Task 5: Convert GitHub Action into detector-only inbox publisher

**Files:**

- Modify `.github/workflows/upstream-sync.yml`.
- Create `scripts/upstream-sync/detect.mjs`.
- Create `scripts/__tests__/upstream-sync-detect.test.mjs`.
- Modify `.github/AGENTS.md`.
- Modify `scripts/AGENTS.md`.

**Consumes:** Fork base SHA; canonical upstream SHA; exact commit range; changed paths; risk flags; escaped issue-body values.

**Produces:** `buildSyncRequest({baseSha, upstreamSha, range, changedPaths, riskFlags})`; `renderSafeIssueBody(request)`; immutable inbox issue/comment containing request and link; detector-only workflow permissions and commands.

- [ ] Write detector tests before implementation. Cover SHA and exact range calculation; escaped and code-fenced commit text; neutralized mentions; high-risk flagging; immutable request rendering; absence of branch, PR, merge, and verify mutation commands.
- [ ] Run focused test in RED state: `npm test -- scripts/__tests__/upstream-sync-detect.test.mjs`. Expected: FAIL because detector exports and safe rendering do not exist.
- [ ] Implement `buildSyncRequest` with base SHA, upstream SHA, exact range, changed paths, and risk flags. Implement `renderSafeIssueBody` with escaping, code fencing, and mention neutralization. Treat commit text as inert data.
- [ ] Convert workflow to canonical upstream fetch, pinned-commit verification, exact range and risk computation, and immutable persistent inbox issue/link publication. Grant `contents: read` and `issues: write` only. Retain read-only `actions/checkout` pinned to `main` so detector runs checked-in `scripts/upstream-sync/detect.mjs`. Remove `pull_request_target`, merge, verify, branch, and PR mutation commands.
- [ ] Run focused test in GREEN state: `npm test -- scripts/__tests__/upstream-sync-detect.test.mjs`. Expected: PASS for SHA/range, risk, escaping, mention, and detector-only assertions.
- [ ] Run code review gate. Reviewer checks permissions, absence of `pull_request_target`, immutable request fields, canonical remote pin verification, safe issue rendering, and no integration mutation.
- [ ] Commit Task 5: `git add .github/workflows/upstream-sync.yml scripts/upstream-sync/detect.mjs scripts/__tests__/upstream-sync-detect.test.mjs .github/AGENTS.md scripts/AGENTS.md && git commit -m "feat: publish detector-only upstream sync requests"`.

## Task 6: Implement senior-maintainer skill and three eval scenarios

**Files:**

- Modify canonical `.pi/skills/omp-dashboard-upstream-sync/SKILL.md`.
- Modify `.pi/skills/omp-dashboard-upstream-sync/evals/evals.json`.
- Create sibling `.pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1/with-skill/` result tree during evaluation.
- Create sibling `.pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1/no-skill/` result tree during evaluation.
- Create `.pi/skills/omp-dashboard-upstream-sync/evals/fixtures/` fixture repositories.
- Create `scripts/upstream-sync/run-fixtures.mjs`.
- Create `scripts/__tests__/upstream-sync-fixtures.test.mjs`.
- Modify `.gitignore`.
- Modify `.pi/skills/omp-dashboard-upstream-sync/AGENTS.md`.

**Consumes:** Immutable sync request; accepted entries from repo-relative `upstream-sync/ledger/obligations.json`; detector, contract, validator, executor, and verifier interfaces; fixture repositories; three eval prompts.

**Produces:** Senior-maintainer procedure; mandatory stop conditions and non-goals; three with-skill and no-skill result trees; timing records; assertion grades; aggregate benchmark; generated review.

- [ ] Write eval definitions before skill implementation. Define upstream UI adoption; ZGE push/OMP/deploy preservation; shared-hub combination prompts. Define negative fixtures for stale pin, plan binding mismatch, missing wiring, preservation loss, corrupt ledger, expired ledger, `retire`, `unaffected`, `blocked`, injection, and retry identity.
- [ ] Run eval definitions in RED state: `npm test -- scripts/__tests__/upstream-sync-fixtures.test.mjs scripts/__tests__/upstream-sync-contracts.test.mjs scripts/__tests__/upstream-sync-validator.test.mjs scripts/__tests__/upstream-sync-detect.test.mjs`. Expected: FAIL because fixture runner and fixture test do not exist.
- [ ] Write senior-maintainer skill procedure: consume request; mine candidates; require accepted ledger entries; create evidence-backed assessment and committed plan; invoke executor after deterministic plan binding; verify; manage one audited PR; record decision. Stop on changed pins, stale or expired affected record, blocked obligation, missing proof, preservation loss, failed check, divergent identity, or untrusted instruction. Exclude auto acceptance, path-only policy, auto merge/land/deploy, and detector mutation.
- [ ] Create fixture repositories and result-tree layout. Add `.pi/skills/omp-dashboard-upstream-sync-workspace/` to `.gitignore`. Keep result trees uncommitted. Run with-skill and no-skill baselines together. Record elapsed time, assertions, decisions, proof, stop conditions, candidate identity, and verification outcomes.
- [ ] Implement `scripts/upstream-sync/run-fixtures.mjs` with deterministic fixture ordering, paired with-skill/no-skill execution, `timing.json`, `grading.json`, `benchmark.json` aggregation, nonzero failed-assertion exit, and preserved ignored result tree.
- [ ] Run fixture tests in GREEN state: `npm test -- scripts/__tests__/upstream-sync-fixtures.test.mjs`. Expected: PASS for failed-assertion exit, positive aggregate, negative-fixture grading, and result-tree preservation.
- [ ] Run fixture benchmark: `node scripts/upstream-sync/run-fixtures.mjs --fixtures .pi/skills/omp-dashboard-upstream-sync/evals/fixtures --results .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1`. Expected: RED for any failed assertion; PASS only when positive scenarios and every negative fixture grade correctly.
- [ ] Generate review: `python /home/joe/.claude/plugins/cache/claude-plugins-official/skill-creator/unknown/skills/skill-creator/eval-viewer/generate_review.py .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1 --skill-name "omp-dashboard-upstream-sync" --benchmark .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1/benchmark.json --static .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1/review.html`. Expected: static review contains with-skill/no-skill timing, assertion grades, aggregate benchmark, and negative-fixture findings.
- [ ] Run code review gate. Reviewer checks senior-maintainer sequence, stop conditions, non-goals, fixture isolation, baseline pairing, timing capture, assertion grading, retry identity, and generated review completeness.
- [ ] Commit Task 6: `git add .pi/skills/omp-dashboard-upstream-sync/SKILL.md .pi/skills/omp-dashboard-upstream-sync/evals/evals.json .pi/skills/omp-dashboard-upstream-sync/evals/fixtures .pi/skills/omp-dashboard-upstream-sync/AGENTS.md scripts/upstream-sync/run-fixtures.mjs scripts/__tests__/upstream-sync-fixtures.test.mjs .gitignore && git commit -m "feat: add upstream sync maintainer skill evaluations"`.

## Task 7: CI and documentation cutover

**Files:**

- Modify `.github/workflows/ci-zge.yml`.
- Modify `docs/upstream-sync.md`.
- Modify `docs/AGENTS.md`.
- Modify `.github/AGENTS.md`.
- Modify `scripts/AGENTS.md`.

**Consumes:** Contract, validator, executor, detector, installer, and fixture-runner tests from Tasks 1 through 6; implementation path set; detector → inbox → assessment → audited PR flow.

**Produces:** CI path filters; updated upstream-sync documentation; docs ownership row.

- [ ] Run fixture-runner contract before CI/docs wiring: `npm test -- scripts/__tests__/upstream-sync-fixtures.test.mjs`. Expected: PASS because Task 6 creates runner and fixture test.
- [ ] Add CI jobs for contract, validator, executor, detector, installer, and skill fixture tests.
- [ ] Add CI path filters for `.pi/skills/omp-dashboard-upstream-sync/**`, `upstream-sync/**`, `scripts/upstream-sync/**`, `scripts/upstream-sync.sh`, `.github/workflows/upstream-sync.yml`, and `.github/workflows/ci-zge.yml`. Keep required CI failures from automatic landing.
- [ ] Rewrite `docs/upstream-sync.md` to remove auto-policy and preview-PR instructions. Document detector → inbox → assessment → audited PR flow, exact pins, ledger dispositions, proof, stop conditions, isolated checks, and explicit installer boundary.
- [ ] Add path-alphabetical row for `superpowers/plans/2026-07-20-upstream-sync-maintainer.md` in `docs/AGENTS.md`. Keep existing index entries unchanged.
- [ ] Run focused test in GREEN state: `npm test -- scripts/__tests__/install-managed-skill.test.mjs scripts/__tests__/upstream-sync-contracts.test.mjs scripts/__tests__/upstream-sync-validator.test.mjs scripts/__tests__/upstream-sync-executor.test.mjs scripts/__tests__/upstream-sync-detect.test.mjs scripts/__tests__/upstream-sync-fixtures.test.mjs`. Expected: PASS. Run fixture runner: `node scripts/upstream-sync/run-fixtures.mjs --fixtures .pi/skills/omp-dashboard-upstream-sync/evals/fixtures --results .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1`. Expected: PASS with zero failed assertions and nonzero behavior proven by failure fixture test.
- [ ] Run code review gate. Reviewer checks every changed implementation surface in CI filters, fixture failure status, documentation flow, no auto-policy wording, no preview-PR path, docs index ordering, and required CI landing rule.
- [ ] Commit Task 7: `git add .github/workflows/ci-zge.yml docs/upstream-sync.md docs/AGENTS.md .github/AGENTS.md scripts/AGENTS.md && git commit -m "docs: document and gate upstream sync cutover"`.

## Final Verification

- [ ] Run full deterministic suite: `npm test -- scripts/__tests__/install-managed-skill.test.mjs scripts/__tests__/upstream-sync-contracts.test.mjs scripts/__tests__/upstream-sync-validator.test.mjs scripts/__tests__/upstream-sync-executor.test.mjs scripts/__tests__/upstream-sync-detect.test.mjs scripts/__tests__/upstream-sync-fixtures.test.mjs`.
- [ ] Run fixture evaluation: `node scripts/upstream-sync/run-fixtures.mjs --fixtures .pi/skills/omp-dashboard-upstream-sync/evals/fixtures --results .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1`.
- [ ] Verify every check completes before push.
- [ ] Verify detector grants `contents: read` and `issues: write` only.
- [ ] Verify workflow contains no `pull_request_target`.
- [ ] Verify executor binds exact plan commit and hash.
- [ ] Verify required CI failure prevents landing.
- [ ] Verify upstream prose/data remains escaped and inert.
- [ ] Run final code review gate against approved design spec and all seven task boundaries.
