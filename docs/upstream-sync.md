# Upstream sync

Repo tracks `BlackBeltTechnology/pi-agent-dashboard`.
Repo tracks upstream `develop`.
Repo ships ZGE product on protected `main`.

## Branches

| Branch | Role |
|---|---|
| `main` | Protected production target. Required `zge-gates` check. |
| `upstream/develop` | Canonical BlackBelt integration source. |
| `sync/upstream-develop` | Single audited sync branch. Force-updated by explicit maintainer run. |

## Flow

Detector reads canonical upstream.
Detector verifies canonical upstream SHA.
Detector records fork `base_sha`.
Detector records `upstream_sha`.
Detector records exact `upstream_range`.
Detector records changed paths.
Detector derives risk flags.
Detector publishes immutable request to persistent issue inbox.
Inbox stores request and source commit link.
Inbox grants no merge authority.

Maintainer consumes one request.
Maintainer loads exact ledger revision.
Maintainer mines upstream range for behavior candidates.
Maintainer assesses every affected obligation.
Maintainer records proof and disposition.
Maintainer commits complete `upstream-sync/plan.json`.
Maintainer computes canonical `plan_hash`.
Executor validates request, ledger, plan, and verifier identity.
Executor creates fresh worktree at exact `base_sha`.
Executor merges exact `upstream_sha`.
Executor applies plan dispositions only.
Executor runs post-merge invariants.
Executor runs required checks before push.
Executor commits exact audited branch.
Executor pushes exact audited branch.
PR manager opens one normal ready-for-review PR.
Human reviewers decide merge.
Human operators decide deployment.

Detector never creates branch.
Detector never creates PR.
Detector never merges.
Detector never deploys.
Maintainer never auto-merges.
Maintainer never auto-lands.
Maintainer never deploys.

## Detector and inbox

Workflow: [`.github/workflows/upstream-sync.yml`](../.github/workflows/upstream-sync.yml).
Detector permission: `contents: read`.
Detector permission: `issues: write`.
Detector permission excludes branch and pull-request writes.
Detector avoids `pull_request_target`.
Detector checks `upstream_sha` against canonical `develop`.
Detector checks fetched SHA against canonical SHA.
Detector computes `base_sha..upstream_sha`.
Detector stores request JSON in issue body.
Detector escapes upstream prose.
Detector code-fences upstream data.
Detector neutralizes mentions.
Upstream text stays inert data.

Request keeps these exact values:

- `request_id`
- `base_sha`
- `upstream_sha`
- `upstream_range`
- `changed_paths`
- `risk_flags`
- `ledger_revision`
- `created_at`

New upstream head supersedes older request.
New upstream head requires fresh assessment.
Path-limited re-pinning fails freshness policy.

## Assessment and ledger

Ledger path: `upstream-sync/ledger/obligations.json`.
Ledger revision binds request and plan.
Ledger stores accepted behavior obligations.
Ledger stores scope and dependency roots.
Ledger stores owner and review date.
Ledger stores expiry and recheck trigger.

Path class gives investigation hint.
Path class never decides disposition.
Behavior proof decides disposition.

Each affected obligation records:

- behavior proof
- test proof
- wiring proof
- verification commands
- required checks
- disposition reason

Allowed dispositions:

| Disposition | Meaning |
|---|---|
| `unaffected` | Range leaves obligation behavior unchanged. |
| `adopt-upstream` | Upstream behavior satisfies obligation proof. |
| `preserve-zge` | ZGE behavior remains required after merge. |
| `combine` | Upstream behavior and ZGE wiring both remain required. |
| `retire` | Reviewed obligation no longer applies. Record proof. |
| `blocked` | Proof or safety gate missing. Stop affected sync. |

Missing behavior proof blocks.
Missing test proof blocks.
Missing wiring proof blocks.
Affected expired record blocks.
Affected blocked record blocks.
Unrelated blocked record carries forward with owner and recheck trigger.

## Plan and executor

Plan path: `upstream-sync/plan.json`.
Plan commit precedes executor mutation.
Plan binds `base_sha`.
Plan binds `upstream_sha`.
Plan binds `ledger_revision`.
Plan binds complete decision set.
Plan binds `plan_commit`.
Plan binds canonical `plan_hash`.
Plan binds `verifier_version`.
Plan binds `verifier_digest`.

Changed pin stops execution.
Changed ledger revision stops execution.
Changed decision set stops execution.
Changed plan commit stops execution.
Changed plan hash stops execution.
Changed verifier identity stops execution.
Stale request stops execution.
Expired affected obligation stops execution.
Blocked affected obligation stops execution.
Missing proof stops execution.
Untrusted instruction stops execution.

Executor runs validator from pinned-base code.
Validator stays outside merge-result tree.
Fresh worktree starts at exact base pin.
Merge target equals exact upstream pin.
Executor applies only committed dispositions.
Executor rejects unresolved conflicts.
Executor rejects mutation outside plan.
Executor checks preservation invariants before tests.

Required verification runs in isolated worktree:

- structural checks
- obligation checks
- adopted-upstream regression checks
- required CI checks
- build checks

Failed validator stops push.
Failed invariant stops push.
Failed test stops push.
Failed build stops push.
Failed required CI check stops push.
Failed verification stops PR creation.

## Audited PR

PR represents audited candidate only.
PR uses one exact sync branch identity.
PR uses normal ready-for-review state.
PR is not draft.
PR body records request pins.
PR body records ledger revision.
PR body records plan commit and hash.
PR body records dispositions.
PR body records proof summary.
PR body records verification results.
PR body records residual risks.

Human reviewer merges PR.
Human operator deploys after merge.

## Managed skill installer

Canonical skill path: `.pi/skills/omp-dashboard-upstream-sync/SKILL.md`.
Managed runtime path: `/home/joe/.omp/agent/managed-skills/omp-dashboard-upstream-sync/`.
Canonical repo source remains authoritative.
Managed copy remains disposable.
Installer copies `SKILL.md` only.
Installer never copies ledger.
Installer never copies request.
Installer never copies plan.
Installer never copies assessment.
Installer never copies proof.
Installer never copies fixture results.

`scripts/install-managed-skill.sh --check` reports byte drift.
`scripts/install-managed-skill.sh --install` writes managed copy atomically.
Managed installer runs only post-merge after explicit deployment request.
No workflow invokes managed installer.

## CI gate

Workflow: [`.github/workflows/ci-zge.yml`](../.github/workflows/ci-zge.yml).
Required job: `zge-upstream-sync`.
Path filter covers skill, ledger, sync scripts, tests, workflows, and docs.
Contract test runs in CI.
Validator test runs in CI.
Executor test runs in CI.
Detector test runs in CI.
Installer test runs in CI.
Fixture test runs in CI.
Fixture runner runs in CI.
Required test failure blocks landing.

## Commands

```bash
npm test -- scripts/__tests__/install-managed-skill.test.mjs scripts/__tests__/upstream-sync-contracts.test.mjs scripts/__tests__/upstream-sync-validator.test.mjs scripts/__tests__/upstream-sync-executor.test.mjs scripts/__tests__/upstream-sync-detect.test.mjs scripts/__tests__/upstream-sync-fixtures.test.mjs
node scripts/upstream-sync/run-fixtures.mjs --fixture-root .pi/skills/omp-dashboard-upstream-sync/evals/fixtures --output .pi/skills/omp-dashboard-upstream-sync-workspace/iteration-1/benchmark.json
scripts/upstream-sync.sh verify --request upstream-sync/request.json --ledger upstream-sync/ledger/obligations.json --plan upstream-sync/plan.json
scripts/install-managed-skill.sh --check
```

`--install` requires explicit post-merge deployment request.
