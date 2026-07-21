import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalJson,
  resolveProofPath,
  sha256Canonical,
  validateLedger,
  validatePlan,
  validateRequest,
} from "../upstream-sync/contracts.mjs";
import canonicalLedger from "../../upstream-sync/ledger/obligations.json" with { type: "json" };
import validLedger from "../upstream-sync/fixtures/valid-ledger.json" with { type: "json" };
import validRequest from "../upstream-sync/fixtures/valid-request.json" with { type: "json" };
import validPlan from "../upstream-sync/fixtures/valid-plan.json" with { type: "json" };

describe("upstream sync contracts", () => {
  it("accepts the versioned ledger and all contract fixtures", () => {
    expect(validateLedger(validLedger)).toEqual(validLedger);
    expect(validateRequest(validRequest)).toEqual(validRequest);
    expect(validatePlan(validPlan)).toEqual(validPlan);
  });

  it("validates the canonical ledger and resolves every evidence path", () => {
    expect(validateLedger(canonicalLedger)).toEqual(canonicalLedger);
    const repoRoot = path.resolve(".");
    for (const obligation of canonicalLedger.obligations) {
      for (const [kind, evidencePaths] of Object.entries(obligation.evidence)) {
        for (const evidencePath of evidencePaths) {
          const resolved = resolveProofPath(repoRoot, evidencePath);
          expect(existsSync(resolved), `${obligation.id} ${kind}: ${evidencePath}`).toBe(true);
        }
      }
    }
  });

  it("canonicalizes object keys deterministically while preserving array order", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, c: 3 }, list: [2, 1] })).toBe(
      '{"a":{"c":3,"d":2},"list":[2,1],"z":1}',
    );
    expect(sha256Canonical({ b: 1, a: 2 })).toBe(
      "d3626ac30a87e6f7a6428233b3c68299976865fa5508e4267c5415c76af7a772",
    );
    expect(sha256Canonical({ a: 2, b: 1 })).toBe(sha256Canonical({ b: 1, a: 2 }));
    expect(sha256Canonical({ a: 3, b: 1 })).not.toBe(sha256Canonical({ a: 2, b: 1 }));
  });

  it.each([
    ["ledger", validateLedger, validLedger, (value) => delete value.schema_version],
    ["request", validateRequest, validRequest, (value) => delete value.base_sha],
    ["plan", validatePlan, validPlan, (value) => delete value.plan_hash],
  ])("rejects %s missing required fields", (_name, validator, fixture, mutate) => {
    const value = structuredClone(fixture);
    mutate(value);
    expect(() => validator(value)).toThrow();
  });

  it("rejects unknown fields and duplicate stable obligation IDs", () => {
    const unknown = structuredClone(validLedger);
    unknown.extra = true;
    expect(() => validateLedger(unknown)).toThrow(/unknown/i);

    const duplicate = structuredClone(validLedger);
    duplicate.obligations.push(structuredClone(duplicate.obligations[0]));
    expect(() => validateLedger(duplicate)).toThrow(/duplicate/i);
  });

  it("rejects unsupported dispositions and changed plan hashes", () => {
    const unsupported = structuredClone(validPlan);
    unsupported.decisions[0].disposition = "merge-anything";
    expect(() => validatePlan(unsupported)).toThrow(/disposition/i);

    const changed = structuredClone(validPlan);
    changed.plan_hash = "0".repeat(64);
    expect(() => validatePlan(changed)).toThrow(/hash/i);
  });

  it("rejects absolute and parent-traversal proof paths", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "upstream-proof-"));
    mkdirSync(path.join(root, "proof"));
    writeFileSync(path.join(root, "proof", "ok.txt"), "proof\n", "utf8");
    try {
      expect(() => resolveProofPath(root, "/etc/passwd")).toThrow(/absolute|relative/i);
      expect(() => resolveProofPath(root, "../outside.txt")).toThrow(/traversal/i);
      expect(resolveProofPath(root, "proof/ok.txt")).toBe(path.join(root, "proof", "ok.txt"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a proof path whose symlink escapes the worktree", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "upstream-proof-link-"));
    const outside = mkdtempSync(path.join(os.tmpdir(), "upstream-proof-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "secret\n", "utf8");
    try {
      symlinkSync(outside, path.join(root, "proof-link"), "dir");
      expect(() => resolveProofPath(root, "proof-link/secret.txt")).toThrow(/outside|symlink/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
