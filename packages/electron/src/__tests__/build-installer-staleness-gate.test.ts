/**
 * Pins the build-installer staleness gate contract. Exercises
 * `packages/electron/scripts/_bundle-stamp.mjs` (the testable Node helper that
 * `build-installer.sh`'s `is_bundle_stale` wraps) against a planted source
 * tree.
 *
 * Contract being pinned:
 *   - stamp missing             → "stamp-missing"
 *   - any tracked source newer  → "source-newer:<relpath>"
 *   - bundler script newer      → "bundler-newer"
 *   - only .swp/etc. touched    → cache hit (empty)
 *   - no edits                  → cache hit (empty)
 *
 * See openspec/changes/fix-build-installer-stale-server-bundle/.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HELPER = path.resolve(
  __dirname,
  "..",
  "..",
  "scripts",
  "_bundle-stamp.mjs",
);

interface Harness {
  tmpDir: string;
  projectDir: string;
  stampPath: string;
  bundlerScript: string;
  rootsArg: string;
  serverFile: string;
  sharedFile: string;
}

function makeHarness(): Harness {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-stamp-test-"));
  const projectDir = tmpDir;
  // Plant a minimal mirror of the workspace source roots.
  const roots = [
    "packages/server/src",
    "packages/shared/src",
    "packages/client/src",
    "packages/extension/src",
    "packages/dashboard-plugin-runtime/src",
  ];
  for (const r of roots) {
    fs.mkdirSync(path.join(projectDir, r), { recursive: true });
  }
  const serverFile = path.join(projectDir, "packages/server/src/server.ts");
  fs.writeFileSync(serverFile, "// planted\n");
  const sharedFile = path.join(projectDir, "packages/shared/src/index.ts");
  fs.writeFileSync(sharedFile, "// planted\n");

  const bundlerScript = path.join(
    projectDir,
    "packages/electron/scripts/bundle-server.mjs",
  );
  fs.mkdirSync(path.dirname(bundlerScript), { recursive: true });
  fs.writeFileSync(bundlerScript, "// planted bundler\n");

  const stampPath = path.join(projectDir, "packages/electron/.bundle-stamp");
  const rootsArg = roots.map((r) => path.join(projectDir, r)).join(":");

  return { tmpDir, projectDir, stampPath, bundlerScript, rootsArg, serverFile, sharedFile };
}

function runHelper(h: Harness, cmd: "check" | "write" | "age"): string {
  return execFileSync("node", [HELPER, cmd], {
    env: {
      ...process.env,
      BUNDLE_STAMP_PATH: h.stampPath,
      BUNDLE_SRC_ROOTS: h.rootsArg,
      BUNDLER_SCRIPT: h.bundlerScript,
      PROJECT_DIR: h.projectDir,
    },
    encoding: "utf8",
  });
}

/** Set file mtime to (now + deltaSec) seconds. Negative = past, positive = future. */
function bumpMtime(file: string, deltaSec: number): void {
  const now = Date.now() / 1000;
  const t = now + deltaSec;
  fs.utimesSync(file, t, t);
}

describe("bundle-stamp staleness gate", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  afterEach(() => {
    fs.rmSync(h.tmpDir, { recursive: true, force: true });
  });

  it("reports stamp-missing when no stamp file exists", () => {
    expect(runHelper(h, "check")).toBe("stamp-missing");
  });

  it("reports cache hit immediately after write (no source edits)", () => {
    runHelper(h, "write");
    expect(runHelper(h, "check")).toBe("");
  });

  it("reports source-newer with the touched filename when a tracked file is edited", () => {
    // Backdate all source files so the stamp's srcMtime sits firmly in the past,
    // then write the stamp, then touch one file into the future.
    bumpMtime(h.serverFile, -100);
    bumpMtime(h.sharedFile, -100);
    bumpMtime(h.bundlerScript, -100);
    runHelper(h, "write");
    bumpMtime(h.serverFile, 100);
    const out = runHelper(h, "check");
    expect(out.startsWith("source-newer:")).toBe(true);
    expect(out).toContain("packages/server/src/server.ts");
  });

  it("reports stamp-missing when the stamp is deleted", () => {
    runHelper(h, "write");
    fs.unlinkSync(h.stampPath);
    expect(runHelper(h, "check")).toBe("stamp-missing");
  });

  it("reports bundler-newer when only the bundler script changes", () => {
    bumpMtime(h.serverFile, -100);
    bumpMtime(h.sharedFile, -100);
    bumpMtime(h.bundlerScript, -100);
    runHelper(h, "write");
    bumpMtime(h.bundlerScript, 100);
    expect(runHelper(h, "check")).toBe("bundler-newer");
  });

  it("ignores editor swap files (cache hit when only .swp is touched)", () => {
    bumpMtime(h.serverFile, -100);
    bumpMtime(h.sharedFile, -100);
    bumpMtime(h.bundlerScript, -100);
    runHelper(h, "write");
    const swap = path.join(
      h.projectDir,
      "packages/server/src/.server.ts.swp",
    );
    fs.writeFileSync(swap, "swap");
    bumpMtime(swap, 100);
    expect(runHelper(h, "check")).toBe("");
  });

  it("emits a human-readable age string after a successful write", () => {
    runHelper(h, "write");
    const age = runHelper(h, "age");
    expect(age).toMatch(/^\d+[smhd] ago$/);
  });

  it("emits 'unknown' age when no stamp exists", () => {
    expect(runHelper(h, "age")).toBe("unknown");
  });
});
