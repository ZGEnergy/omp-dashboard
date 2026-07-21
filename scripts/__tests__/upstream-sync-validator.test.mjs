import { describe, expect, it } from "vitest";
import { evaluateAffectedObligations, validatePlanBinding, validatePostMergeInvariants } from "../upstream-sync/validator.mjs";
import { sha256Canonical } from "../upstream-sync/contracts.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const DIGEST = "d".repeat(64);

function obligation(id, overrides = {}) {
  return {
    id,
    intent: `${id} intent`,
    observable_contract: `${id} contract`,
    origin_commit: SHA_A,
    evidence: { behavior: [`src/${id}.ts`], test: [`test/${id}.test.ts`], wiring: [`wire/${id}.ts`] },
    scope: { paths: [`src/${id}.ts`], behaviors: [id] },
    dependency_roots: [`dep:${id}`],
    owner: `${id} owner`,
    review_date: "2026-07-21",
    expiry: "2026-12-31",
    recheck_trigger: `${id} changes`,
    status: "accepted",
    schema_version: "1.0",
    ...overrides,
  };
}

function ledger(obligations) {
  return { schema_version: "1.0", ledger_revision: "ledger-1", obligations };
}

function request(overrides = {}) {
  return {
    schema_version: "1.0", request_id: "req-1", base_sha: SHA_A, upstream_sha: SHA_B,
    upstream_range: `${SHA_A}..${SHA_B}`, changed_paths: ["src/adopt.ts"], risk_flags: [],
    ledger_revision: "ledger-1", created_at: "2026-07-21T12:00:00.000Z", ...overrides,
  };
}

function plan(decisions, overrides = {}) {
  const base = {
    schema_version: "1.0", plan_id: "plan-1", base_sha: SHA_A, upstream_sha: SHA_B,
    ledger_revision: "ledger-1", decisions, plan_commit: SHA_C, verifier_version: "validator@1",
    verifier_digest: DIGEST, created_at: "2026-07-21T12:01:00.000Z",
  };
  return { ...base, ...overrides, plan_hash: sha256Canonical({ ...base, ...overrides }) };
}

function decision(obligation_id, disposition = "adopt-upstream", overrides = {}) {
  return {
    obligation_id, disposition, behavior_proof: [`src/${obligation_id}.ts`],
    test_proof: [`test/${obligation_id}.test.ts`], wiring_proof: [`wire/${obligation_id}.ts`],
    verification: { commands: ["npm test"], required_checks: ["check"] }, decision_status: "approved", ...overrides,
  };
}

describe("evaluateAffectedObligations", () => {
  it("isolates scope and dependency roots and returns deterministic decisions", () => {
    const records = [obligation("adopt"), obligation("preserve", { scope: { paths: ["src/preserve.ts"], behaviors: ["preserve"] }, dependency_roots: ["dep:preserve"] }), obligation("combine", { scope: { paths: ["src/combine.ts"], behaviors: ["combine"] }, dependency_roots: ["dep:combine"] }), obligation("retire", { scope: { paths: ["src/retire.ts"], behaviors: ["retire"] }, dependency_roots: ["dep:retire"] })];
    const range = { changed_paths: ["src/adopt.ts", "dep:combine"], changed_behaviors: ["retire"], dispositions: { adopt: "adopt-upstream", combine: "combine", retire: "retire" } };
    const result = evaluateAffectedObligations({ upstreamRange: range, ledger: ledger(records) });
    expect(result.decisions.map((item) => [item.obligation_id, item.disposition])).toEqual([
      ["adopt", "adopt-upstream"], ["combine", "combine"], ["preserve", "unaffected"], ["retire", "retire"],
    ]);
    expect(result.affected_obligation_ids).toEqual(["adopt", "combine", "retire"]);
  });

  it("marks stale and expired records, blocks affected invalid records, and carries unrelated blocked records", () => {
    const records = [
      obligation("expired", { expiry: "2026-07-20" }),
      obligation("stale", { review_date: "2026-01-01", scope: { paths: ["src/other.ts"], behaviors: ["other"] }, dependency_roots: ["dep:other"] }),
      obligation("missing", { evidence: { behavior: [], test: ["test/missing.test.ts"], wiring: ["wire/missing.ts"] } }),
      obligation("blocked", { status: "blocked", scope: { paths: ["src/other.ts"], behaviors: ["other"] }, dependency_roots: ["dep:other"] }),
      obligation("carry", { status: "blocked", scope: { paths: ["src/carry.ts"], behaviors: ["carry"] }, dependency_roots: ["dep:carry"] }),
    ];
    const result = evaluateAffectedObligations({
      upstreamRange: { changed_paths: ["src/expired.ts", "src/missing.ts", "src/other.ts"] }, ledger: ledger(records), asOf: "2026-07-21",
    });
    expect(result.blocked.map((item) => item.obligation_id)).toEqual(["blocked", "expired", "missing", "stale"]);
    expect(result.carry_forward).toEqual([{ obligation_id: "carry", owner: "carry owner", recheck_trigger: "carry changes" }]);
    expect(result.decisions.find((item) => item.obligation_id === "expired").reason).toMatch(/expired/);
  });

  it.each(["unaffected", "adopt-upstream", "preserve-zge", "combine", "retire", "blocked"])("supports %s disposition", (disposition) => {
    const result = evaluateAffectedObligations({ upstreamRange: { changed_paths: ["src/item.ts"], dispositions: { item: disposition } }, ledger: ledger([obligation("item")]) });
    expect(result.decisions[0].disposition).toBe(disposition);
  });
});

describe("validatePlanBinding", () => {
  const obligations = [obligation("one"), obligation("two")];
  const decisions = [decision("one"), decision("two", "preserve-zge")];

  it("accepts exact pins, complete decisions, approval, and verifier binding", () => {
    const req = request({ risk_flags: ["executor"] });
    const p = plan(decisions);
    const approval = {
      ok: true,
      approved_review_ids: ["r1", "r2"],
      plan_commit: p.plan_commit,
      plan_hash: p.plan_hash,
      verifier_version: p.verifier_version,
      verifier_digest: p.verifier_digest,
    };
    expect(validatePlanBinding({ request: req, ledger: ledger(obligations), plan: p, approval })).toEqual(expect.objectContaining({ ok: true }));
  });

  it("rejects every stale binding and incomplete decision set", () => {
    const req = request();
    const approval = {
      ok: true,
      approved_review_ids: ["r1", "r2"],
      plan_commit: SHA_C,
      plan_hash: plan(decisions).plan_hash,
      verifier_version: "validator@1",
      verifier_digest: DIGEST,
    };
    for (const [field, value] of [["base_sha", SHA_B], ["upstream_sha", SHA_A], ["ledger_revision", "ledger-2"], ["plan_commit", SHA_A], ["verifier_version", "validator@2"], ["verifier_digest", "e".repeat(64)]]) {
      const changed = { ...plan(decisions), [field]: value };
      changed.plan_hash = sha256Canonical(Object.fromEntries(Object.entries(changed).filter(([key]) => key !== "plan_hash")));
      expect(validatePlanBinding({ request: req, ledger: ledger(obligations), plan: changed, approval })).toEqual(expect.objectContaining({ ok: false }));
    }
    const changedDecisions = plan([decision("one", "preserve-zge"), decision("two", "combine")]);
    expect(validatePlanBinding({ request: req, ledger: ledger(obligations), plan: changedDecisions, approval })).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects a plan when canonical contents change after the first hash read", () => {
    const req = request();
    const p = plan(decisions);
    const canonicalHash = p.plan_hash;
    let mutated = false;
    Object.defineProperty(p, "plan_hash", {
      configurable: true,
      enumerable: true,
      get() {
        if (!mutated) {
          mutated = true;
          p.created_at = "2026-07-22T00:00:00.000Z";
        }
        return canonicalHash;
      },
    });

    const approval = {
      ok: true,
      approved_review_ids: ["r1", "r2"],
      plan_commit: p.plan_commit,
      plan_hash: canonicalHash,
      verifier_version: p.verifier_version,
      verifier_digest: p.verifier_digest,
    };

    expect(validatePlanBinding({ request: req, ledger: ledger(obligations), plan: p, approval })).toEqual(expect.objectContaining({ ok: false, errors: expect.arrayContaining(["plan_hash approval mismatch"]) }));
  });
});

describe("validatePostMergeInvariants", () => {
  it("fails before push when a required preservation invariant disappears", () => {
    const p = plan([decision("push", "preserve-zge", { verification: { commands: ["npm test"], required_checks: ["push-wiring", "deploy-health"] } })]);
    expect(validatePostMergeInvariants({ worktree: { files: ["src/unrelated.ts"], checks: ["deploy-health"] }, plan: p })).toEqual(expect.objectContaining({ ok: false }));
  });

  it("passes when required push, OMP, deploy, workflow, and dependency wiring remain", () => {
    const p = plan([decision("wiring", "combine", { verification: { commands: ["npm test"], required_checks: ["push", "omp", "deploy", "workflow", "dependency"] } })]);
    const worktree = { files: ["push", "omp", "deploy", "workflow", "dependency"], checks: ["push", "omp", "deploy", "workflow", "dependency"] };
    expect(validatePostMergeInvariants({ worktree, plan: p })).toEqual(expect.objectContaining({ ok: true }));
  });
});
