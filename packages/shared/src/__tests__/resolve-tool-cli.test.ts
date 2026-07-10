/**
 * Unit tests for the shell-callable resolver wrapper at
 * `packages/shared/bin/pi-dashboard-resolve-tool.cjs`.
 *
 * We spawn the wrapper as a child process (matching its real-world use)
 * and assert stdout/stderr/exit-code per the spec scenarios in
 *   openspec/changes/register-build-time-tools/specs/tool-registry/spec.md
 *
 * See change: register-build-time-tools.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const SCRIPT = path.join(
  repoRoot,
  "packages",
  "shared",
  "bin",
  "pi-dashboard-resolve-tool.cjs",
);

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    // Isolate from any user override file so tests are deterministic.
    env: {
      ...process.env,
      // Point HOME at /tmp so ~/.omp/dashboard/tool-overrides.json is
      // (almost certainly) absent, keeping the resolver in the
      // bare-import branch.
      HOME: "/tmp/pi-dashboard-resolve-tool-test",
    },
  });
}

describe("pi-dashboard-resolve-tool.cjs", () => {
  it("prints absolute path to stdout for `electron`", () => {
    const r = run(["electron"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/[\\/]node_modules[\\/]electron$/);
    expect(r.stderr).toBe("");
  });

  it("prints absolute path to stdout for `node-pty`", () => {
    const r = run(["node-pty"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/[\\/]node_modules[\\/]node-pty$/);
    expect(r.stderr).toBe("");
  });

  it("emits JSON Resolution shape with --json", () => {
    const r = run(["electron", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.name).toBe("electron");
    expect(parsed.ok).toBe(true);
    expect(parsed.path).toMatch(/electron$/);
    expect(parsed.source).toBe("bare-import");
    expect(Array.isArray(parsed.tried)).toBe(true);
    // First strategy attempted is `override`, then `bare-import`.
    expect(parsed.tried.map((t: { strategy: string }) => t.strategy)).toEqual([
      "override",
      "bare-import",
    ]);
    expect(typeof parsed.resolvedAt).toBe("number");
  });

  it("exits 1 with stderr when tool name is unknown", () => {
    const r = run(["nonexistent-tool"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("nonexistent-tool");
    expect(r.stderr).toContain("not registered");
  });

  it("exits 1 with stderr when --json is passed for unknown tool", () => {
    const r = run(["nonexistent-tool", "--json"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not registered");
  });

  it("exits 1 with usage message when no tool name given", () => {
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("usage:");
    expect(r.stderr).toContain("registered:");
  });

  it("strategy chain order in --json mirrors definitions.ts", () => {
    // Both build-time tools share the same chain shape: override → bare-import.
    for (const tool of ["electron", "node-pty"]) {
      const r = run([tool, "--json"]);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(
        parsed.tried.map((t: { strategy: string }) => t.strategy),
      ).toEqual(["override", "bare-import"]);
    }
  });
});
