import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256Canonical } from "../upstream-sync/contracts.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const executor = path.join(repoRoot, "scripts/upstream-sync.sh");
const contracts = readFileSync(path.join(repoRoot, "scripts/upstream-sync/contracts.mjs"));
const validator = readFileSync(path.join(repoRoot, "scripts/upstream-sync/validator.mjs"));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const run = (cwd, args, env = {}) => execFileSync("bash", [executor, ...args], {
  cwd,
  env: { ...process.env, SYNC_REPO_ROOT: cwd, ...env },
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fixtureRepo({ blocked = false, verificationCommand = "true", conflict = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "upstream-sync-executor-"));
  mkdirSync(path.join(root, "scripts/upstream-sync"), { recursive: true });
  writeFileSync(path.join(root, "scripts/upstream-sync/contracts.mjs"), contracts);
  writeFileSync(path.join(root, "scripts/upstream-sync/validator.mjs"), validator);
  writeFileSync(path.join(root, "proof.txt"), "base proof\n");
  writeFileSync(path.join(root, "changed.txt"), "base\n");
  writeFileSync(path.join(root, "check.txt"), "present\n");
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Executor Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  let baseSha = git(root, "rev-parse", "HEAD");

  git(root, "switch", "-c", "upstream-tip");
  writeFileSync(path.join(root, "changed.txt"), conflict ? "upstream\n" : "upstream change\n");
  git(root, "add", "changed.txt");
  git(root, "commit", "-m", "upstream");
  const upstreamSha = git(root, "rev-parse", "HEAD");
  git(root, "switch", "main");
  if (conflict) {
    writeFileSync(path.join(root, "changed.txt"), "zge conflicting change\n");
    git(root, "add", "changed.txt");
    git(root, "commit", "-m", "zge divergence");
    baseSha = git(root, "rev-parse", "HEAD");
  }

  const ledger = {
    schema_version: "1.0",
    ledger_revision: "ledger-test",
    obligations: [{
      id: "sync-tooling",
      intent: "Keep the sync tool deterministic.",
      observable_contract: "The sync tool validates exact pins.",
      origin_commit: baseSha,
      evidence: { behavior: ["proof.txt"], test: ["proof.txt"], wiring: ["proof.txt"] },
      scope: { paths: ["changed.txt"], behaviors: ["sync"] },
      dependency_roots: ["changed.txt"],
      owner: "test",
      review_date: "2026-07-21",
      expiry: "2026-10-21",
      recheck_trigger: "sync change",
      status: blocked ? "blocked" : "accepted",
      schema_version: "1.0",
    }],
  };
  const request = {
    schema_version: "1.0",
    request_id: "sync-test-0001",
    base_sha: baseSha,
    upstream_sha: upstreamSha,
    upstream_range: `${baseSha}..${upstreamSha}`,
    changed_paths: ["changed.txt"],
    risk_flags: ["test-risk"],
    ledger_revision: ledger.ledger_revision,
    created_at: "2026-07-21T12:00:00.000Z",
  };
  const planBase = {
    schema_version: "1.0",
    plan_id: "plan-test-0001",
    base_sha: baseSha,
    upstream_sha: upstreamSha,
    ledger_revision: ledger.ledger_revision,
    decisions: [{
      obligation_id: "sync-tooling",
      disposition: blocked ? "blocked" : "adopt-upstream",
      behavior_proof: ["proof.txt"],
      test_proof: ["proof.txt"],
      wiring_proof: ["proof.txt"],
      verification: { commands: [verificationCommand], required_checks: ["check.txt"] },
      decision_status: blocked ? "blocked" : "approved",
    }],
    plan_commit: baseSha,
    verifier_version: "upstream-sync-validator@1.0",
    verifier_digest: "d".repeat(64),
    created_at: "2026-07-21T12:05:00.000Z",
  };
  const plan = { ...planBase, plan_hash: sha256Canonical(planBase) };
  mkdirSync(path.join(root, "upstream-sync"), { recursive: true });
  writeJson(path.join(root, "upstream-sync/ledger.json"), ledger);
  writeJson(path.join(root, "upstream-sync/request.json"), request);
  writeJson(path.join(root, "upstream-sync/plan.json"), plan);
  git(root, "add", "upstream-sync");
  git(root, "commit", "-m", "artifacts");
  git(root, "remote", "add", "origin", root);
  return { root, baseSha, upstreamSha };
}

function fakePublishers(root) {
  const bin = path.join(root, "fake-bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "git"), `#!/usr/bin/env bash\nset -e\nfor arg in "$@"; do if [[ "$arg" == push ]]; then printf 'git %q ' "$@" >> "$SYNC_TEST_LOG"; printf '\\n' >> "$SYNC_TEST_LOG"; exit 0; fi; done\nexec /usr/bin/git "$@"\n`);
  writeFileSync(path.join(bin, "gh"), `#!/usr/bin/env bash\nset -e\nprintf 'gh ' >> "$SYNC_TEST_LOG"; printf '%q ' "$@" >> "$SYNC_TEST_LOG"; printf '\\n' >> "$SYNC_TEST_LOG"\nbody_file=""; previous=""; for arg in "$@"; do if [[ "$previous" == --body-file ]]; then body_file="$arg"; fi; previous="$arg"; done; if [[ -n "$body_file" ]]; then cat "$body_file" >> "$SYNC_TEST_LOG"; fi\nif [[ "$1" == pr && "$2" == create ]]; then echo 'https://github.test/pr/1'; fi\n`);
  execFileSync("chmod", ["+x", path.join(bin, "git"), path.join(bin, "gh")]);
  return bin;
}

describe("upstream sync executor", () => {
  it("exposes only detect/validate/execute/verify and never carries shortcut or result-script policy", () => {
    const source = readFileSync(executor, "utf8");
    expect(source).toMatch(/detect/);
    expect(source).toMatch(/validate/);
    expect(source).toMatch(/execute/);
    expect(source).toMatch(/verify/);
    expect(source).not.toContain("--ours");
    expect(source).not.toContain("--theirs");
    expect(source).not.toContain("upstream-sync-policy");
    expect(source).not.toContain("resolve_conflicts_by_policy");
  });

  it("stops before push and PR when the plan hash is changed", () => {
    const fixture = fixtureRepo();
    const log = path.join(fixture.root, "publish.log");
    const planPath = path.join(fixture.root, "upstream-sync/plan.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    plan.decisions[0].disposition = "preserve-zge";
    writeJson(planPath, plan);
    const bin = fakePublishers(fixture.root);
    expect(() => run(fixture.root, ["execute", "--request", "upstream-sync/request.json", "--ledger", "upstream-sync/ledger.json", "--plan", "upstream-sync/plan.json"], { PATH: `${bin}:${process.env.PATH}`, SYNC_TEST_LOG: log })).toThrow();
    expect(existsSync(log) ? readFileSync(log, "utf8") : "").not.toMatch(/git push|gh /);
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it.each([
    ["blocked affected record", { blocked: true }],
    ["failed verification", { verificationCommand: "false" }],
  ])("hard-stops %s before publication", (_name, options) => {
    const fixture = fixtureRepo(options);
    const log = path.join(fixture.root, "publish.log");
    const bin = fakePublishers(fixture.root);
    expect(() => run(fixture.root, ["execute", "--request", "upstream-sync/request.json", "--ledger", "upstream-sync/ledger.json", "--plan", "upstream-sync/plan.json"], { PATH: `${bin}:${process.env.PATH}`, SYNC_TEST_LOG: log })).toThrow();
    expect(existsSync(log) ? readFileSync(log, "utf8") : "").not.toMatch(/git push|gh /);
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("hard-stops an ordinary merge conflict without conflict-side defaults or publication", () => {
    const fixture = fixtureRepo({ conflict: true });
    const log = path.join(fixture.root, "publish.log");
    const bin = fakePublishers(fixture.root);
    expect(() => run(fixture.root, ["execute", "--request", "upstream-sync/request.json", "--ledger", "upstream-sync/ledger.json", "--plan", "upstream-sync/plan.json"], { PATH: `${bin}:${process.env.PATH}`, SYNC_TEST_LOG: log })).toThrow();
    const output = existsSync(log) ? readFileSync(log, "utf8") : "";
    expect(output).not.toMatch(/git push|gh /);
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("uses exact pins, mutates only the disposition path, and renders one ready PR body", () => {
    const fixture = fixtureRepo();
    const log = path.join(fixture.root, "publish.log");
    const bin = fakePublishers(fixture.root);
    run(fixture.root, ["execute", "--request", "upstream-sync/request.json", "--ledger", "upstream-sync/ledger.json", "--plan", "upstream-sync/plan.json", "--branch", "sync/upstream-test"], { PATH: `${bin}:${process.env.PATH}`, SYNC_TEST_LOG: log, SYNC_RESULT_PATH: "upstream-sync/candidate.json" });
    const output = readFileSync(log, "utf8");
    expect(output).toMatch(/git push/);
    expect(output).toMatch(/gh pr create/);
    expect(output).not.toMatch(/--draft/);
    expect(output).toMatch(fixture.baseSha);
    expect(output).toMatch(fixture.upstreamSha);
    expect(readFileSync(path.join(fixture.root, "upstream-sync/candidate.json"), "utf8")).toMatch(fixture.upstreamSha);
    rmSync(fixture.root, { recursive: true, force: true });
  });
});

it("keeps the obsolete policy implementation deleted", () => {
  expect(existsSync(path.join(repoRoot, "lib/upstream-sync-policy.sh"))).toBe(false);
  expect(existsSync(path.join(repoRoot, "__tests__/upstream-sync-policy.test.mjs"))).toBe(false);
});
