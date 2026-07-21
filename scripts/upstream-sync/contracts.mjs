import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = "1.0";
const SHA256 = /^[a-f0-9]{64}$/i;
const SHA1 = /^[a-f0-9]{40}$/i;
const DISPOSITIONS = new Set([
  "unaffected",
  "adopt-upstream",
  "preserve-zge",
  "combine",
  "retire",
  "blocked",
]);
const STATUSES = new Set([
  "accepted",
  "assessed",
  "planned",
  "in-PR",
  "merged",
  "retired",
  "blocked",
  "closed-unmerged",
]);
const DECISION_STATUSES = new Set(["proposed", "approved", "blocked"]);

function fail(message) {
  throw new Error(`Invalid upstream sync contract: ${message}`);
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${label} contains unknown field(s): ${unknown.join(", ")}`);
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
}

function assertStringArray(value, label, { paths = false } = {}) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array`);
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    assertString(item, `${label}[${index}]`);
    if (seen.has(item)) fail(`${label} contains duplicate value: ${item}`);
    seen.add(item);
    if (paths) assertRelativePath(item, `${label}[${index}]`);
  }
}

function assertSchemaVersion(value, label) {
  if (value !== SCHEMA_VERSION) fail(`${label} must be ${SCHEMA_VERSION}`);
}

function assertSha(value, label, pattern = SHA1) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${label} must be a hexadecimal ${pattern === SHA1 ? "SHA-1" : "SHA-256"}`);
}

function assertDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must be an ISO date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) fail(`${label} must be a valid ISO date`);
}

function assertRelativePath(value, label) {
  assertString(value, label);
  if (value.includes("\0")) fail(`${label} contains a NUL byte`);
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^\/\//.test(value)) {
    fail(`${label} must be relative`);
  }
  if (value.split(/[\\/]/).includes("..")) fail(`${label} contains parent traversal`);
}

function assertProofPaths(value, label) {
  assertStringArray(value, label, { paths: true });
}

function validateEvidence(value, label) {
  assertObject(value, label);
  assertKeys(value, new Set(["behavior", "test", "wiring"]), label);
  assertProofPaths(value.behavior, `${label}.behavior`);
  assertProofPaths(value.test, `${label}.test`);
  assertProofPaths(value.wiring, `${label}.wiring`);
}

function validateObligation(value, index) {
  const label = `obligations[${index}]`;
  assertObject(value, label);
  assertKeys(
    value,
    new Set([
      "id",
      "intent",
      "observable_contract",
      "origin_commit",
      "evidence",
      "scope",
      "dependency_roots",
      "owner",
      "review_date",
      "expiry",
      "recheck_trigger",
      "status",
      "schema_version",
    ]),
    label,
  );
  assertSchemaVersion(value.schema_version, `${label}.schema_version`);
  assertString(value.id, `${label}.id`);
  if (!/^[a-z][a-z0-9-]+$/.test(value.id)) fail(`${label}.id must be a stable kebab-case identifier`);
  assertString(value.intent, `${label}.intent`);
  assertString(value.observable_contract, `${label}.observable_contract`);
  assertSha(value.origin_commit, `${label}.origin_commit`);
  validateEvidence(value.evidence, `${label}.evidence`);
  assertObject(value.scope, `${label}.scope`);
  assertKeys(value.scope, new Set(["paths", "behaviors"]), `${label}.scope`);
  assertStringArray(value.scope.paths, `${label}.scope.paths`, { paths: true });
  assertStringArray(value.scope.behaviors, `${label}.scope.behaviors`);
  assertStringArray(value.dependency_roots, `${label}.dependency_roots`);
  assertString(value.owner, `${label}.owner`);
  assertDate(value.review_date, `${label}.review_date`);
  assertDate(value.expiry, `${label}.expiry`);
  assertString(value.recheck_trigger, `${label}.recheck_trigger`);
  if (!STATUSES.has(value.status)) fail(`${label}.status is unsupported: ${value.status}`);
}

export function validateLedger(value) {
  assertObject(value, "ledger");
  assertKeys(value, new Set(["schema_version", "ledger_revision", "obligations"]), "ledger");
  assertSchemaVersion(value.schema_version, "ledger.schema_version");
  assertString(value.ledger_revision, "ledger.ledger_revision");
  if (!Array.isArray(value.obligations) || value.obligations.length === 0) fail("ledger.obligations must be a non-empty array");
  const ids = new Set();
  value.obligations.forEach((obligation, index) => {
    validateObligation(obligation, index);
    if (ids.has(obligation.id)) fail(`duplicate stable obligation ID: ${obligation.id}`);
    ids.add(obligation.id);
  });
  return value;
}

export function validateRequest(value) {
  assertObject(value, "request");
  assertKeys(
    value,
    new Set([
      "schema_version",
      "request_id",
      "base_sha",
      "upstream_sha",
      "upstream_range",
      "changed_paths",
      "risk_flags",
      "ledger_revision",
      "created_at",
    ]),
    "request",
  );
  assertSchemaVersion(value.schema_version, "request.schema_version");
  assertString(value.request_id, "request.request_id");
  assertSha(value.base_sha, "request.base_sha");
  assertSha(value.upstream_sha, "request.upstream_sha");
  if (value.base_sha === value.upstream_sha) fail("request pins must differ");
  assertString(value.upstream_range, "request.upstream_range");
  assertStringArray(value.changed_paths, "request.changed_paths", { paths: true });
  if (!Array.isArray(value.risk_flags)) fail("request.risk_flags must be an array");
  value.risk_flags.forEach((flag, index) => assertString(flag, `request.risk_flags[${index}]`));
  assertString(value.ledger_revision, "request.ledger_revision");
  assertString(value.created_at, "request.created_at");
  if (Number.isNaN(Date.parse(value.created_at))) fail("request.created_at must be an ISO timestamp");
  return value;
}

function validateDecision(value, index) {
  const label = `decisions[${index}]`;
  assertObject(value, label);
  assertKeys(
    value,
    new Set([
      "obligation_id",
      "disposition",
      "behavior_proof",
      "test_proof",
      "wiring_proof",
      "verification",
      "decision_status",
    ]),
    label,
  );
  assertString(value.obligation_id, `${label}.obligation_id`);
  if (!DISPOSITIONS.has(value.disposition)) fail(`${label}.disposition is unsupported: ${value.disposition}`);
  assertProofPaths(value.behavior_proof, `${label}.behavior_proof`);
  assertProofPaths(value.test_proof, `${label}.test_proof`);
  assertProofPaths(value.wiring_proof, `${label}.wiring_proof`);
  assertObject(value.verification, `${label}.verification`);
  assertKeys(value.verification, new Set(["commands", "required_checks"]), `${label}.verification`);
  assertStringArray(value.verification.commands, `${label}.verification.commands`);
  assertStringArray(value.verification.required_checks, `${label}.verification.required_checks`);
  if (!DECISION_STATUSES.has(value.decision_status)) fail(`${label}.decision_status is unsupported: ${value.decision_status}`);
}

function planHashPayload(value) {
  const payload = structuredClone(value);
  delete payload.plan_hash;
  return payload;
}

export function validatePlan(value) {
  assertObject(value, "plan");
  assertKeys(
    value,
    new Set([
      "schema_version",
      "plan_id",
      "base_sha",
      "upstream_sha",
      "ledger_revision",
      "decisions",
      "plan_commit",
      "plan_hash",
      "verifier_version",
      "verifier_digest",
      "created_at",
    ]),
    "plan",
  );
  assertSchemaVersion(value.schema_version, "plan.schema_version");
  assertString(value.plan_id, "plan.plan_id");
  assertSha(value.base_sha, "plan.base_sha");
  assertSha(value.upstream_sha, "plan.upstream_sha");
  assertString(value.ledger_revision, "plan.ledger_revision");
  if (!Array.isArray(value.decisions) || value.decisions.length === 0) fail("plan.decisions must be a non-empty array");
  const obligationIds = new Set();
  value.decisions.forEach((decision, index) => {
    validateDecision(decision, index);
    if (obligationIds.has(decision.obligation_id)) fail(`duplicate decision obligation ID: ${decision.obligation_id}`);
    obligationIds.add(decision.obligation_id);
  });
  assertSha(value.plan_commit, "plan.plan_commit");
  assertSha(value.plan_hash, "plan.plan_hash", SHA256);
  const expectedHash = sha256Canonical(planHashPayload(value));
  if (value.plan_hash !== expectedHash) fail("plan.plan_hash does not match canonical plan contents");
  assertString(value.verifier_version, "plan.verifier_version");
  assertSha(value.verifier_digest, "plan.verifier_digest", SHA256);
  assertString(value.created_at, "plan.created_at");
  if (Number.isNaN(Date.parse(value.created_at))) fail("plan.created_at must be an ISO timestamp");
  return value;
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) fail("canonical JSON cannot contain non-finite numbers");
    if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
      fail("canonical JSON cannot contain unsupported values");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function realPathInside(root, candidate) {
  const rootReal = realpathSync(root);
  const candidateReal = realpathSync(candidate);
  const relative = path.relative(rootReal, candidateReal);
  if (relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    return candidateReal;
  }
  fail("proof path resolves outside worktree through a symlink");
}

export function resolveProofPath(worktree, relativePath) {
  assertString(worktree, "worktree");
  assertRelativePath(relativePath, "proof path");
  const root = path.resolve(worktree);
  if (!existsSync(root)) fail("worktree does not exist");
  const candidate = path.resolve(root, relativePath);
  if (!existsSync(candidate)) fail("proof path does not exist");
  return realPathInside(root, candidate);
}

export const CONTRACT_SCHEMA_VERSION = SCHEMA_VERSION;
export const APPROVED_DISPOSITIONS = Object.freeze([...DISPOSITIONS]);
