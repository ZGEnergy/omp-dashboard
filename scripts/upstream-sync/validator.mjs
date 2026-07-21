import { existsSync } from "node:fs";
import path from "node:path";
import { validateLedger, validatePlan, validateRequest } from "./contracts.mjs";

const DISPOSITIONS = new Set(["unaffected", "adopt-upstream", "preserve-zge", "combine", "retire", "blocked"]);
const TOMBSTONES = new Set(["retired", "closed-unmerged"]);
const DEFAULT_AS_OF = "2026-07-21";

const list = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const uniqueSorted = (values) => [...new Set(values)].sort();

function rangeParts(upstreamRange) {
  if (Array.isArray(upstreamRange)) return { paths: list(upstreamRange), behaviors: [], roots: [], dispositions: {}, all: false };
  if (typeof upstreamRange === "string") return { paths: [], behaviors: [], roots: [], dispositions: {}, all: true };
  const range = upstreamRange && typeof upstreamRange === "object" ? upstreamRange : {};
  const paths = list(range.changed_paths ?? range.changedPaths ?? range.paths);
  const behaviors = list(range.changed_behaviors ?? range.changedBehaviors ?? range.behaviors);
  const roots = list(range.dependency_roots ?? range.dependencyRoots ?? range.roots);
  const dispositions = range.dispositions && typeof range.dispositions === "object" ? range.dispositions : {};
  return { paths, behaviors, roots, dispositions, all: Boolean(range.all || range.unknown || range.complete === false) };
}

function overlaps(left, right) {
  return left.some((a) => right.some((b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

function isMissingProof(obligation) {
  const evidence = obligation?.evidence;
  return !evidence || ["behavior", "test", "wiring"].some((key) => !Array.isArray(evidence[key]) || evidence[key].length === 0);
}

function assessmentDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function dispositionFor(id, dispositions, affected) {
  const value = dispositions[id] ?? dispositions[id.replaceAll("-", "_")];
  if (DISPOSITIONS.has(value)) return value;
  return affected ? "adopt-upstream" : "unaffected";
}

export function evaluateAffectedObligations({ upstreamRange, ledger, asOf = DEFAULT_AS_OF } = {}) {
  const records = Array.isArray(ledger?.obligations) ? ledger.obligations : [];
  const parts = rangeParts(upstreamRange);
  const date = assessmentDate(asOf);
  const decisions = [];
  const blocked = [];
  const carryForward = [];
  const stale = [];
  const expired = [];

  for (const obligation of [...records].sort((a, b) => String(a?.id).localeCompare(String(b?.id)))) {
    const scope = obligation?.scope ?? {};
    const affected = parts.all || overlaps(list(scope.paths), parts.paths) || overlaps(list(scope.behaviors), parts.behaviors) || overlaps(list(obligation?.dependency_roots), [...parts.paths, ...parts.roots]);
    const isStale = typeof obligation?.review_date === "string" && obligation.review_date < date;
    const isExpired = typeof obligation?.expiry === "string" && obligation.expiry < date;
    if (isStale) stale.push(obligation.id);
    if (isExpired) expired.push(obligation.id);

    const reasons = [];
    if (isStale) reasons.push("stale review");
    if (isExpired) reasons.push("expired obligation");
    if (isMissingProof(obligation)) reasons.push("missing proof");
    if (obligation?.status === "blocked") reasons.push("ledger record is blocked");

    const hardBlocked = affected && (isMissingProof(obligation) || isStale || (isExpired && !TOMBSTONES.has(obligation?.status)) || obligation?.status === "blocked");
    if (hardBlocked) {
      const record = { obligation_id: obligation.id, reason: reasons.join(", "), owner: obligation.owner, recheck_trigger: obligation.recheck_trigger };
      blocked.push(record);
      decisions.push({ obligation_id: obligation.id, disposition: "blocked", affected, stale: isStale, expired: isExpired, reason: record.reason });
    } else {
      const disposition = dispositionFor(obligation.id, parts.dispositions, affected);
      decisions.push({ obligation_id: obligation.id, disposition, affected, stale: isStale, expired: isExpired, ...(reasons.length ? { reason: reasons.join(", ") } : {}) });
      if (!affected && obligation?.status === "blocked") carryForward.push({ obligation_id: obligation.id, owner: obligation.owner, recheck_trigger: obligation.recheck_trigger });
    }
  }

  return {
    decisions,
    affected_obligation_ids: decisions.filter((item) => item.affected).map((item) => item.obligation_id),
    unaffected_obligation_ids: decisions.filter((item) => !item.affected).map((item) => item.obligation_id),
    blocked,
    blocked_obligation_ids: blocked.map((item) => item.obligation_id),
    carry_forward: carryForward,
    stale: uniqueSorted(stale),
    expired: uniqueSorted(expired),
  };
}

export function validatePlanBinding({ request, ledger, plan } = {}) {
  const errors = [];
  try {
    validateRequest(request);
  } catch (error) {
    errors.push(`request: ${error.message}`);
  }
  try {
    validateLedger(ledger);
  } catch (error) {
    errors.push(`ledger: ${error.message}`);
  }
  try {
    validatePlan(plan);
  } catch (error) {
    errors.push(`plan: ${error.message}`);
  }
  if (request && plan) {
    if (plan.base_sha !== request.base_sha) errors.push("base_sha is not bound to request");
    if (plan.upstream_sha !== request.upstream_sha) errors.push("upstream_sha is not bound to request");
    if (plan.ledger_revision !== request.ledger_revision) errors.push("ledger_revision is not bound to request");
  }
  if (ledger && plan && Array.isArray(ledger.obligations) && Array.isArray(plan.decisions)) {
    const expected = uniqueSorted(ledger.obligations.map((item) => item.id));
    const actual = uniqueSorted(plan.decisions.map((item) => item.obligation_id));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push("decision set is incomplete or contains unknown obligations");
  }
  return { ok: errors.length === 0, errors };
}

function hasWorktreeValue(worktree, key) {
  if (!worktree) return false;
  if (Array.isArray(worktree)) return worktree.includes(key);
  if (typeof worktree === "string") return existsSync(path.resolve(worktree, key));
  for (const field of ["checks", "invariants", "files", "preserved", "present"]) {
    const value = worktree[field];
    if (Array.isArray(value) && value.includes(key)) return true;
    if (value && typeof value === "object" && value[key] === true) return true;
  }
  return false;
}

export function validatePostMergeInvariants({ worktree, plan } = {}) {
  const failures = [];
  const decisions = Array.isArray(plan?.decisions) ? plan.decisions : [];
  for (const decision of decisions) {
    if (decision.disposition === "blocked" || decision.disposition === "retire") continue;
    for (const check of list(decision.verification?.required_checks)) {
      if (!hasWorktreeValue(worktree, check)) failures.push({ obligation_id: decision.obligation_id, invariant: check, reason: `required invariant disappeared: ${check}` });
    }
    const hasChecks = worktree && (Array.isArray(worktree.checks) || (worktree.checks && typeof worktree.checks === "object"));
    if (!hasChecks && typeof worktree === "string") {
      for (const proof of [...list(decision.behavior_proof), ...list(decision.test_proof), ...list(decision.wiring_proof)]) {
        if (!hasWorktreeValue(worktree, proof)) failures.push({ obligation_id: decision.obligation_id, invariant: proof, reason: `preservation proof disappeared: ${proof}` });
      }
    }
  }
  return { ok: failures.length === 0, failures, before_push: failures.length > 0 };
}
