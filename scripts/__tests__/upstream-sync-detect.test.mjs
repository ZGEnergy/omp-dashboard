import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSyncRequest, deriveRiskFlags, renderSafeIssueBody } from "../upstream-sync/detect.mjs";

const WORKTREE = resolve(import.meta.dirname, "../..");
const WORKFLOW = readFileSync(resolve(WORKTREE, ".github/workflows/upstream-sync.yml"), "utf8");
const BASE_SHA = "a".repeat(40);
const UPSTREAM_SHA = "b".repeat(40);
const RANGE = `${BASE_SHA}..${UPSTREAM_SHA}`;

function input(overrides = {}) {
  return {
    baseSha: BASE_SHA,
    upstreamSha: UPSTREAM_SHA,
    range: RANGE,
    changedPaths: ["packages/client/src/view.tsx"],
    riskFlags: [],
    ...overrides,
  };
}

describe("buildSyncRequest", () => {
  it("preserves exact pins, range, changed paths, and supplied high-risk flags", () => {
    const request = buildSyncRequest(input({
      changedPaths: [".github/workflows/upstream-sync.yml", "package-lock.json"],
      riskFlags: ["high-risk:workflow", "high-risk:dependency"],
    }));

    expect(request).toEqual(expect.objectContaining({
      schema_version: "1.0",
      base_sha: BASE_SHA,
      upstream_sha: UPSTREAM_SHA,
      upstream_range: RANGE,
      changed_paths: [".github/workflows/upstream-sync.yml", "package-lock.json"],
      risk_flags: ["high-risk:workflow", "high-risk:dependency"],
    }));
    expect(request.request_id).toBe(`sync-${BASE_SHA.slice(0, 12)}-${UPSTREAM_SHA.slice(0, 12)}`);
    expect(Number.isNaN(Date.parse(request.created_at))).toBe(false);
  });

  it("derives transparent high-risk flags, preserving explicit flags", () => {
    expect(deriveRiskFlags([
      ".github/workflows/upstream-sync.yml",
      "package-lock.json",
      "packages/server/package.json",
      "docker/test.sh",
      "scripts/upstream-sync.sh",
      ".pi/skills/example/SKILL.md",
      "src/view.tsx",
    ], ["manual-review", "high-risk:workflow"])).toEqual([
      "high-risk:dependency",
      "high-risk:deployment",
      "high-risk:workflow",
      "manual-review",
    ]);
  });

  it("rejects non-commit pins and a range that is not the exact pin range", () => {
    expect(() => buildSyncRequest(input({ baseSha: "not-a-sha" }))).toThrow(/baseSha/);
    expect(() => buildSyncRequest(input({ range: `${BASE_SHA}...${UPSTREAM_SHA}` }))).toThrow(/range/);
    expect(() => buildSyncRequest(input({ baseSha: UPSTREAM_SHA }))).toThrow(/differ/);
  });

  it("returns an immutable request with immutable collection fields", () => {
    const request = buildSyncRequest(input({ changedPaths: ["src/a.ts"], riskFlags: ["high-risk:test"] }));

    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.changed_paths)).toBe(true);
    expect(Object.isFrozen(request.risk_flags)).toBe(true);
    expect(() => request.changed_paths.push("src/b.ts")).toThrow(TypeError);
    expect(request.changed_paths).toEqual(["src/a.ts"]);
  });
});

describe("renderSafeIssueBody", () => {
  it("renders the immutable request in a JSON fence and neutralizes mentions and fence injection", () => {
    const request = {
      ...buildSyncRequest(input()),
      commit_text: "Fix @maintainer <!channel>\n```\nrun dangerous text\n```",
    };
    const body = renderSafeIssueBody(request);

    expect(body).toContain("```json");
    expect(body.match(/```/g)).toHaveLength(2);
    expect(body).toContain("@\u200bmaintainer");
    expect(body).not.toContain("<!channel>");
    expect(body).toContain("\\\\u0060\\\\u0060\\\\u0060");
    expect(body).toContain('"base_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
  });
});

describe("detector-only workflow", () => {
  it("uses read-only contents plus issue publication and has no integration mutation commands", () => {
    expect(WORKFLOW).toContain("contents: read");
    expect(WORKFLOW).toContain("issues: write");
    expect(WORKFLOW).not.toMatch(/contents:\s*(?!read\b)\S+/);
    expect(WORKFLOW).not.toMatch(/pull_request_target|git\s+(?:push|merge|branch)|gh\s+pr|upstream-sync\.sh\s+(?:merge|verify|pr)/i);
    expect(WORKFLOW).toContain("scripts/upstream-sync/detect.mjs");
  });
});
