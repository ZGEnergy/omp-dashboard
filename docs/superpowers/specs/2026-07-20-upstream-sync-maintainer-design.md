# omp-dashboard upstream sync maintainer design

**Date:** 2026-07-20  
**Status:** Approved design  
**Scope:** `omp-dashboard-upstream-sync` replacement

## Purpose

`omp-dashboard-upstream-sync` keeps ZGE fork close to BlackBelt upstream.

ZGE keeps only reviewed behavior obligations.

Upstream implementation wins when proof satisfies obligation.

No separate audit skill exists.

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

Persistent GitHub issue/comment stores sync request as sync inbox.

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

Detector Action uses least-privilege read-only permissions.

Detector Action does not use `pull_request_target`.

Upstream source remains untrusted data.

Upstream prose remains untrusted data.

Upstream commit messages remain untrusted data.

Commit text cannot alter workflow policy or approval state.

Validators never log secrets.

Deterministic validators check request schema.

Deterministic validators check ledger schema.

Deterministic validators check proof paths.

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
| `plan_hash` | Hash of approved mutation plan |
| `verifier_version` | Validator version bound to approval |

Human approval binds `base_sha`.

Human approval binds `upstream_sha`.

Human approval binds `ledger_revision`.

Human approval binds complete decision set.

Human approval binds `plan_hash`.

Human approval binds `verifier_version`.

Executor byte-matches every bound value before mutation.

Executor rejects changed pin.

Executor rejects changed ledger revision.

Executor rejects changed decision set.

Executor rejects changed plan hash.

Executor rejects changed verifier version.

## Maintainer workflow

1. Maintainer consumes exact sync request pin.
2. Maintainer loads versioned in-repo obligation ledger.
3. Maintainer mines new fork commits for behavior candidates.
4. Maintainer never auto-accepts candidates.
5. Maintainer reconciles every accepted obligation with upstream range.
6. Maintainer assigns one disposition to each affected obligation.
7. Maintainer records behavior, test, and wiring proof.
8. Maintainer pauses for human approval.
9. Executor creates fresh isolated worktree from pinned base.
10. Executor merges exact pinned upstream commit.
11. Executor performs approved disposition actions only.
12. Validator runs structural and obligation checks before test/build.
13. Maintainer runs required verification.
14. Maintainer creates or updates exactly one audited PR.
15. Maintainer records decisions and evidence.

Executor does not mutate worktree before approval byte-match.

Executor does not substitute newer upstream head.

Executor does not infer approval from issue labels or path names.

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

## Blocked isolation

Each obligation declares scope.

Each obligation declares expiry or recheck trigger.

Affected blocked obligation prevents merge.

Affected means upstream range touches scope or dependency roots.

Unaffected blocked obligation carries forward visibly.

Carry-forward record names owner.

Carry-forward record names recheck trigger.

Carry-forward record does not block unrelated merge.

Retirement requires explicit risk acceptance.

Retirement requires tombstone evidence.

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

Failed verification retains draft PR.

Failed verification prevents landing.

Failed verification records failure evidence.

## Implementation boundaries

| Component | Boundary |
|---|---|
| Weekly detector | Read upstream and fork metadata; emit immutable request; never mutate integration state |
| Dispatch workflow | Route request to maintainer workflow; preserve request pin |
| Sync inbox | Store immutable request and append-only assessment links in GitHub issue/comments |
| Obligation ledger | Store versioned behavior records, migrations, orphan records, and tombstones in repository |
| Candidate miner | Inspect fork commits and identify unreviewed behavior candidates |
| Reconciler | Compare accepted obligations against exact upstream range; assign dispositions and proof requirements |
| Approval gate | Bind pins, ledger revision, decision set, plan hash, and verifier version |
| Executor | Use fresh isolated worktree; merge exact pinned upstream commit; perform approved actions |
| `scripts/upstream-sync.sh` | Deterministic approved-plan executor and validator; no automatic path-policy merge; no PR orchestration |
| Validator | Check schemas, hashes, provenance, state, invariants, and plan binding deterministically |
| Verification runner | Run structural, obligation, regression, build, and required CI checks |
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
5. Detector publishes immutable request to persistent issue/comment inbox.
6. Dispatch workflow loads exact request.
7. Maintainer loads ledger revision from repository.
8. Candidate miner scans fork history for new behavior.
9. Reconciler maps candidates and accepted obligations to upstream range.
10. Reconciler writes assessment records and dispositions.
11. Human approves immutable assessment set and plan hash.
12. Executor byte-matches approval binding.
13. Executor creates fresh worktree at pinned base SHA.
14. Executor invokes `scripts/upstream-sync.sh` with approved plan.
15. Script merges exact pinned upstream SHA and performs approved actions.
16. Script validates post-merge invariants before tests and build.
17. Verification runner executes required checks.
18. PR manager creates or updates one audited candidate PR.
19. Decision recorder links PR, evidence, verification, and ledger states.
20. Fresh upstream head supersedes request and restarts assessment.

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

Plan hash remains immutable from approval through execution.

Verifier version remains immutable from approval through execution.

Merge target remains exact pinned upstream commit.

Fresh worktree starts from exact pinned base.

Untrusted upstream text cannot issue commands or change decisions.

Missing proof blocks affected obligation.

Failed verification prevents landing.
