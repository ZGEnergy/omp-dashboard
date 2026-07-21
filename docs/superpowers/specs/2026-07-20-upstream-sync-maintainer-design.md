# omp-dashboard upstream sync maintainer design

**Date:** 2026-07-20  
**Status:** Approved design  
**Scope:** `omp-dashboard-upstream-sync` replacement

## Purpose

`omp-dashboard-upstream-sync` keeps ZGE fork close to BlackBelt upstream.

ZGE keeps only reviewed behavior obligations.

Upstream implementation wins when proof satisfies obligation.

No separate audit skill exists.

## Skill source boundary

Canonical source lives at `.pi/skills/omp-dashboard-upstream-sync/`.

Managed runtime copy lives at `/home/joe/.omp/agent/managed-skills/omp-dashboard-upstream-sync/`.

Explicit checked installer installs and syncs managed copy only from canonical source.

Managed copy never becomes source of truth.

## Non-goals

- Automatic obligation acceptance.
- Merge, landing, or deploy without human-approved plan.
- Policy decision from path alone.
- Action-created preview PR.

## Operating model

Weekly GitHub Action detects upstream change.

Dispatch workflow consumes immutable sync request.

Detection workflow records `base_sha`.

Detection workflow records `upstream_sha`.

Detection workflow records exact upstream range.

Detection workflow records changed paths.

Detection workflow records risk flags.

Detection workflow publishes immutable sync request.

Detection workflow never merges commits.

Detection workflow never creates or force-updates branch.

Detection workflow never opens PR.

Persistent GitHub issue/comment displays sync request and committed plan link only.

Issue/comment never grants approval authority.

PR represents audited candidate only.

Maintainer consumes exact request pin.

Newer upstream head supersedes older request.

Newer upstream head requires fresh assessment and approval.

Conservative freshness policy rejects path-limited re-pinning.

Pin verification resolves commit against canonical upstream remote.

Merge target equals exact pinned upstream commit.

## Script fate

Retain `scripts/upstream-sync.sh` as deterministic executor and validator only.

Approved plan invokes `scripts/upstream-sync.sh`.

Script verifies immutable approval binding before mutation.

Script merges exact pinned upstream commit.

Script performs approved actions only.

Script runs deterministic validators.

Script removes automatic path-policy merge.

Script removes PR orchestration.

Delete `scripts/lib/upstream-sync-policy.sh`.

Ledger tooling migrates path classes to non-authoritative investigation hints.

Investigation hints never determine disposition or ownership.

Behavior ledger determines disposition and ownership.

## Trust boundaries

Detector Action uses `contents: read` and `issues: write`.

Detector Action lacks branch and PR write permission.

Detector Action does not use `pull_request_target`.

Detector remains read-only for integration behavior.

Executor runs through `workflow_dispatch` or protected environment.

Executor uses scoped token.

Executor independently verifies approval identity.

Executor independently verifies binding values.

Executor independently verifies request supersession state.

Upstream source remains untrusted data.

Upstream prose remains untrusted data.

Upstream commit messages remain untrusted data.

Detector text receives escaping and code fencing before display.

Detector mentions receive neutralization.

Detector text never becomes workflow command.

Detector text never becomes unquoted step output.

Commit text cannot alter workflow policy or approval state.

Validators never log secrets.

Deterministic validators check request schema.

Deterministic validators check ledger schema.

Deterministic validators check proof paths.

Deterministic validators canonicalize proof paths inside worktree.

Deterministic validators check hashes.

Deterministic validators check worktree state.

Deterministic validators check canonical upstream pin provenance.

Deterministic validators check approval plan binding.

Deterministic validators check post-merge invariants.

## Behavior obligation ledger

Versioned in-repo ledger defines ownership.

Path policy guides investigation only.

Behavior ledger decides ownership.

SHA does not identify obligation.

Stable human ID identifies obligation.

Each ledger record stores one obligation.

| Field | Contract |
|---|---|
| `id` | Stable human identifier |
| `intent` | Behavior purpose |
| `observable_contract` | Externally observable requirement |
| `origin_commit` | ZGE provenance commit |
| `evidence` | Code, test, and wiring proof paths |
| `scope` | Affected behavior and dependency roots |
| `dependency_roots` | Symbols, files, packages, or workflows that can affect obligation |
| `owner` | Responsible maintainer |
| `review_date` | Last human review date |
| `expiry` | Expiry or recheck boundary |
| `recheck_trigger` | Event that requires reassessment |
| `status` | Obligation lifecycle state |
| `schema_version` | Ledger schema revision |

`origin_commit` records provenance.

`origin_commit` does not define obligation identity.

`evidence` names machine-checkable proof paths.

`scope` limits affected-range analysis.

`dependency_roots` extends affected-range analysis beyond paths.

`expiry` prevents indefinite stale ownership.

`recheck_trigger` names upstream, code, test, or policy events that reopen review.

Ledger migration preserves stable IDs.

Ledger migration preserves intent and observable contracts.

Ledger migration preserves provenance.

Ledger migration records schema version changes.

Missing obligation evidence marks record `blocked`.

New behavior without ledger match creates candidate obligation.

Candidate obligation requires human acceptance before ledger insertion.

Removed obligation code retains explicit tombstone evidence.

Orphaned ledger record receives owner and recheck trigger.

Orphaned ledger record cannot silently disappear.

Retirement requires explicit risk acceptance.

Retirement requires tombstone evidence.

## Ledger lifecycle

Ledger supports `accepted`.

Ledger supports `assessed`.

Ledger supports `planned`.

Ledger supports `in-PR`.

Ledger supports `merged`.

Ledger supports `retired`.

Ledger supports `blocked`.

Ledger supports `closed-unmerged`.

`accepted` means human-approved obligation exists.

`assessed` means current upstream range has disposition proof.

`planned` means approved action plan exists.

`in-PR` means audited candidate contains approved action.

`merged` means candidate landed with verification proof.

`retired` means explicit risk acceptance and tombstone exist.

`blocked` means required proof or approval is absent.

`closed-unmerged` means candidate closed without landing.

## Assessment record

Each assessed obligation receives immutable assessment record.

| Field | Contract |
|---|---|
| `base_sha` | Pinned fork base commit |
| `upstream_sha` | Pinned upstream target commit |
| `ledger_revision` | Exact ledger revision used |
| `disposition` | `unaffected`, `adopt-upstream`, `preserve-zge`, `combine`, `retire`, or `blocked` |
| `behavior_proof` | Proof of contract satisfaction or conflict |
| `test_proof` | Relevant existing or added test evidence |
| `wiring_proof` | Registration, route, export, deployment, or call-site evidence |
| `verification` | Validator and command results |
| `decision_status` | Human approval state |
| `plan_commit` | Assessment-branch commit containing approved plan |
| `plan_hash` | Hash of approved plan artifact |
| `verifier_version` | Validator version bound to approval |
| `verifier_digest` | Validator artifact digest bound to approval |

Plan artifact commits to assessment branch.

Plan artifact carries complete decision set.

Plan artifact carries proof paths and verification requirements.

Plan artifact hash identifies exact plan contents.

Execution consumes referenced `plan_hash` only.

Human approval binds `base_sha`.

Human approval binds `upstream_sha`.

Human approval binds `ledger_revision`.

Human approval binds complete decision set.

Human approval binds `plan_commit`.

Human approval binds `plan_hash`.

Human approval binds `verifier_version`.

Human approval binds `verifier_digest`.

Authorized maintainer approval comes from GitHub API verified CODEOWNERS review.

CODEOWNERS review targets exact plan commit and hash.

Executor byte-matches every bound value before mutation.

Executor rejects changed pin.

Executor rejects changed ledger revision.

Executor rejects changed decision set.

Executor rejects edited plan commit.

Executor rejects changed plan hash.

Executor rejects dismissed review.

Executor rejects missing review.

Executor rejects changed verifier version.

Executor rejects changed verifier digest.

## Maintainer workflow

1. Maintainer consumes exact sync request pin.
2. Maintainer loads versioned in-repo obligation ledger.
3. Maintainer mines new fork commits for behavior candidates.
4. Maintainer never auto-accepts candidates.
5. Maintainer reconciles every accepted obligation with upstream range.
6. Maintainer assigns one disposition to each affected obligation.
7. Maintainer records behavior, test, and wiring proof.
8. Maintainer commits immutable plan artifact on assessment branch.
9. Maintainer pauses for CODEOWNERS approval of exact plan commit and hash.
10. Executor creates fresh isolated worktree from pinned base.
11. Executor merges exact pinned upstream commit.
12. Executor performs approved disposition actions only.
13. Validator runs structural and obligation checks before test/build.
14. Maintainer runs required verification.
15. Maintainer creates or updates exactly one audited PR.
16. Maintainer records decisions and evidence.

Executor does not mutate worktree before approval byte-match.

Executor does not substitute newer upstream head.

Executor does not infer approval from issue labels, comments, or path names.

## Disposition rules

| Disposition | Rule |
|---|---|
| `unaffected` | Upstream range does not change obligation or dependency roots; proof records scan. |
| `adopt-upstream` | Upstream implementation satisfies observable contract; proof covers behavior, tests, and wiring. |
| `preserve-zge` | ZGE behavior remains required; proof carries machine-checkable invariants. |
| `combine` | Shared hub needs upstream behavior and ZGE wiring; proof covers both contracts. |
| `retire` | Obligation no longer applies; human risk acceptance and tombstone evidence required. |
| `blocked` | Proof, approval, ledger, pin, or conflict state prevents safe action. |

`unaffected` still receives assessment record.

`adopt-upstream` removes duplicate ZGE implementation when proof permits.

`preserve-zge` keeps ZGE implementation and wiring required by contract.

`combine` retains ZGE wiring and adopts compatible upstream behavior.

`retire` never follows path disappearance alone.

`blocked` never receives merge approval.

## Blocked isolation and expiry

Each obligation declares scope.

Each obligation declares expiry or recheck trigger.

Scheduled validator marks expired in-scope obligations stale.

Merge-time validator blocks expired non-tombstoned in-scope records.

Affected blocked obligation prevents merge.

Affected means upstream range touches scope or dependency roots.

Unaffected blocked obligation carries forward visibly.

Carry-forward record names owner.

Carry-forward record names recheck trigger.

Long-lived blocked record triggers owner escalation.

Long-lived blocked record triggers tombstone review.

Carry-forward record does not block unrelated merge.

Retirement requires explicit risk acceptance.

Retirement requires tombstone evidence.

## Risk review

High-risk paths require named scope owner.

High-risk paths require two distinct authorized approvals.

Executor, validator, CI/workflow, and dependency-manifest changes force high-risk disposition.

High-risk disposition receives distinct authorized review.

Emergency override requires approval-bound `combine` or `retire` decision.

Emergency override records rationale.

Emergency override never bypasses binding or validation.

## Existing PR lifecycle

Candidate identity derives from `base_sha`.

Candidate identity derives from `upstream_sha`.

Candidate identity derives from `ledger_revision`.

Candidate identity derives from `plan_hash`.

Same identity updates same candidate.

Stale candidate becomes superseded.

Superseded candidate links newer candidate.

Divergent candidate stops processing.

Divergent candidate requires human resolution.

Exactly one audited PR remains active for one approved identity.

Closed unmerged candidate records `closed-unmerged` state.

Closed unmerged candidate retains assessment and verification evidence.

## Executor boundary

Executor and validator run from pinned `base_sha` copy.

Pinned executor copy stays outside merge-result tree.

Executor binds verifier version and digest.

Executor loads no executor or validator code from upstream result.

Target-tree scripts never execute before validation.

All structural checks execute in isolated worktree.

All invariant checks execute in isolated worktree.

All obligation checks execute in isolated worktree.

All tests execute in isolated worktree.

All build checks execute in isolated worktree.

All checks complete before push.

Required CI failure retains draft PR.

Required CI failure prevents landing.

## Post-merge proof

Each `preserve-zge` decision carries machine-checkable invariants.

Each `combine` decision carries machine-checkable invariants.

Validator runs before test/build.

Unprovable obligation becomes `blocked`.

Structural verification checks protected files and required wiring.

Obligation-focused verification checks each accepted contract.

Upstream regression verification checks adopted upstream behavior.

Build verification checks required build command.

CI verification checks required status checks.

All verification runs in isolated worktree before push.

Failed verification retains draft PR.

Failed verification prevents landing.

Failed verification records failure evidence.

## Implementation boundaries

| Component | Boundary |
|---|---|
| Weekly detector | Read upstream and fork metadata; emit immutable request; never mutate integration state |
| Dispatch workflow | Route request to maintainer workflow; preserve request pin |
| Sync inbox | Display immutable request and committed plan links in GitHub issue/comments; never grant approval |
| Obligation ledger | Store versioned behavior records, migrations, orphan records, and tombstones in repository |
| Candidate miner | Inspect fork commits and identify unreviewed behavior candidates |
| Reconciler | Compare accepted obligations against exact upstream range; assign dispositions and proof requirements |
| Plan artifact | Store committed immutable assessment plan and referenced hash on assessment branch |
| Approval gate | Verify CODEOWNERS review for exact plan commit/hash; bind pins, ledger revision, decision set, plan hash, and verifier version/digest |
| Executor | Use pinned-base copy outside merge-result tree; merge exact pinned upstream commit; perform approved actions |
| `scripts/upstream-sync.sh` | Deterministic approved-plan executor and validator; no automatic path-policy merge; no PR orchestration |
| Validator | Check schemas, hashes, provenance, state, invariants, expiry, sanitization, and plan binding deterministically |
| Verification runner | Run structural, obligation, regression, build, and required CI checks in isolated worktree |
| PR manager | Create or update exactly one audited PR; supersede stale candidates; stop divergent candidates |
| Decision recorder | Persist decisions, evidence, statuses, owners, and recheck triggers |

`scripts/lib/upstream-sync-policy.sh` becomes deleted.

Ledger tooling owns non-authoritative path investigation hints.

Detector owns request creation only.

Maintainer workflow owns assessment and approval pause.

Executor owns approved mutation only.

Validator owns deterministic safety gates.

PR manager owns candidate identity and lifecycle.

## End-to-end data flow

1. Detector resolves canonical upstream remote.
2. Detector verifies upstream pin provenance.
3. Detector computes fork base SHA and exact upstream range.
4. Detector classifies changed paths and risk flags.
5. Detector sanitizes displayed request text.
6. Detector publishes immutable request to persistent issue/comment inbox.
7. Maintainer commits immutable plan artifact on assessment branch.
8. Maintainer loads ledger revision from repository.
9. Candidate miner scans fork history for new behavior.
10. Reconciler maps candidates and accepted obligations to upstream range.
11. Reconciler writes assessment records and dispositions.
12. CODEOWNERS reviewers approve exact plan commit and hash through GitHub API.
13. Executor independently verifies approval identity, bindings, and supersession.
14. Executor loads pinned-base executor and validator copy outside merge-result tree.
15. Executor creates fresh worktree at pinned base SHA.
16. Executor invokes `scripts/upstream-sync.sh` with referenced plan hash.
17. Script merges exact pinned upstream SHA and performs approved actions.
18. Script validates post-merge invariants before tests and build.
19. Verification runner executes all checks in isolated worktree before push.
20. PR manager creates or updates one audited candidate PR.
21. Decision recorder links PR, evidence, verification, and ledger states.
22. Fresh upstream head supersedes request and restarts assessment.

## Validation fixtures

Three history-inspired positive scenarios run in CI.

Adopt UI scenario proves upstream UI change satisfies obligation.

Preserve ZGE-only scenario proves push, OMP, and deploy behavior remains wired.

Combine shared-hub scenario proves upstream registration and ZGE wiring coexist.

Negative fixtures cover upstream movement.

Negative fixtures cover approval mismatch.

Negative fixtures cover missing wiring.

Negative fixtures cover preservation invariant loss during conflict.

Negative fixtures cover corrupt ledger.

Negative fixtures cover expired ledger.

Negative fixtures cover `unaffected` disposition.

Negative fixtures cover `retire` disposition.

Negative fixtures cover `blocked` disposition.

Negative fixtures cover prompt injection in commit text.

Negative fixtures cover retry and PR identity behavior.

Fixture runs compare skill-enabled runs with no-skill baseline.

Fixture runs execute in CI for skill edits.

## Decision invariants

Request pins remain immutable from detection through execution.

Ledger revision remains immutable from assessment through execution.

Decision set remains immutable from approval through execution.

Plan commit remains immutable from approval through execution.

Plan hash remains immutable from approval through execution.

Verifier version remains immutable from approval through execution.

Verifier digest remains immutable from approval through execution.

Merge target remains exact pinned upstream commit.

Fresh worktree starts from exact pinned base.

Untrusted upstream text cannot issue commands or change decisions.

Missing proof blocks affected obligation.

Expired in-scope record blocks merge without tombstone.

Failed verification prevents landing.
