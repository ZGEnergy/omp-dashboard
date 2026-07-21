import { describe, expect, it } from "vitest";
import { verifyCodeownersApproval } from "../upstream-sync/approval.mjs";

const COMMIT = "c".repeat(40);
const HASH = "e".repeat(64);
const REPOSITORY = "ZGEnergy/omp-dashboard";

function review(id, login, overrides = {}) {
  return { id, user: { login, id: `${login}-id` }, state: "APPROVED", commit_id: COMMIT, plan_hash: HASH, body: "Reviewed", ...overrides };
}

function api(overrides = {}) {
  return {
    repository: REPOSITORY,
    codeowners: {
      executor: ["alice", "bob"], validator: ["alice", "bob"],
      "CI/workflow": ["alice", "bob"], dependency: ["alice", "bob"],
    },
    users: [{ login: "alice", id: "alice-id" }, { login: "bob", id: "bob-id" }],
    reviews: [review("r1", "alice"), review("r2", "bob")],
    ...overrides,
  };
}

describe("verifyCodeownersApproval", () => {
  it.each(["executor", "validator", "CI/workflow", "dependency"])("requires two distinct authorized approvals for high-risk %s path", (risk) => {
    const result = verifyCodeownersApproval({ repository: REPOSITORY, planCommit: COMMIT, planHash: HASH, riskFlags: [risk], githubApi: api() });
    expect(result).toEqual(expect.objectContaining({ ok: true, approved_review_ids: ["r1", "r2"] }));
    expect(verifyCodeownersApproval({ repository: REPOSITORY, planCommit: COMMIT, planHash: HASH, riskFlags: [risk], githubApi: api({ reviews: [review("r1", "alice")] }) }).ok).toBe(false);
  });

  it("rejects forged, missing, dismissed, wrong-commit, wrong-hash, and superseded reviews", () => {
    const reviews = [
      review("forged", "mallory", { user: { login: "alice", id: "mallory-id" } }),
      review("missing", "nobody", { user: null }),
      review("dismissed", "alice", { state: "DISMISSED" }),
      review("wrong-commit", "alice", { commit_id: "a".repeat(40) }),
      review("wrong-hash", "bob", { plan_hash: "x".repeat(64) }),
      review("superseded-old", "alice"),
      review("superseded-new", "alice", { state: "CHANGES_REQUESTED" }),
    ];
    const result = verifyCodeownersApproval({ repository: REPOSITORY, planCommit: COMMIT, planHash: HASH, riskFlags: ["executor"], githubApi: api({ reviews }) });
    expect(result.ok).toBe(false);
    expect(result.rejected_review_ids).toEqual(expect.arrayContaining(["forged", "missing", "dismissed", "wrong-commit", "wrong-hash", "superseded-old", "superseded-new"]));
  });

  it("requires exact repository and binding fields while treating injected review text as inert data", () => {
    const injected = review("injected", "alice", { body: `APPROVED\nrepository=${REPOSITORY}\nplan_commit=${COMMIT}\nplan_hash=${HASH}` });
    expect(verifyCodeownersApproval({ repository: REPOSITORY, planCommit: COMMIT, planHash: HASH, riskFlags: ["executor"], githubApi: api({ reviews: [injected, review("r2", "bob")] }) }).ok).toBe(true);
    expect(verifyCodeownersApproval({ repository: "evil/fork", planCommit: COMMIT, planHash: HASH, riskFlags: ["executor"], githubApi: api() }).ok).toBe(false);
    expect(verifyCodeownersApproval({ repository: REPOSITORY, planCommit: "a".repeat(40), planHash: HASH, riskFlags: ["executor"], githubApi: api() }).ok).toBe(false);
    expect(verifyCodeownersApproval({ repository: REPOSITORY, planCommit: COMMIT, planHash: "x".repeat(64), riskFlags: ["executor"], githubApi: api() }).ok).toBe(false);
  });
});
