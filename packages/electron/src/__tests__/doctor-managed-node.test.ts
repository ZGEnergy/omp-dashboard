/**
 * Tests for `checkManagedNodeRuntime` in `doctor.ts`.
 *
 * Spec scenarios pinned (managed-node-runtime, Requirement: Doctor
 * re-runs managed Node installation):
 *   - Doctor restores missing managed Node \u2192 calls install + binary
 *     present afterward.
 *   - Doctor re-copies on version mismatch \u2192 marker rewritten.
 *   - Doctor is a no-op when marker matches \u2192 install called but no
 *     copy performed.
 *
 * `installManagedNode` is injected as a stub so tests don't shell out
 * or touch real ~/.pi-dashboard/.
 *
 * See change: embed-managed-node-runtime (task 7.2).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkManagedNodeRuntime } from "../lib/doctor.js";

const isWin = process.platform === "win32";

describe("checkManagedNodeRuntime", () => {
  let tmpRoot: string;
  let managedDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-managed-node-"));
    managedDir = path.join(tmpRoot, "managed");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeManagedNode(version: string): void {
    const binDir = isWin
      ? path.join(managedDir, "node")
      : path.join(managedDir, "node", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, isWin ? "node.exe" : "node"), "fake");
    fs.writeFileSync(path.join(managedDir, "node", ".version"), version + "\n");
  }

  it("restores missing managed Node when install succeeds", async () => {
    let installCalled = false;
    const row = await checkManagedNodeRuntime({
      managedDir,
      bundledNodeBinary: "/fake/bundled/bin/node",
      install: async (opts) => {
        installCalled = true;
        // Simulate the install copying files + writing marker.
        writeManagedNode("v22.12.0");
        return {
          ok: true,
          copied: true,
          managedNodeDir: path.join(opts!.managedDir!, "node"),
          version: "v22.12.0",
        };
      },
    });
    expect(installCalled).toBe(true);
    expect(row.status).toBe("ok");
    expect(row.message).toContain("v22.12.0");
  });

  it("reports ok when install no-ops on a matching marker", async () => {
    writeManagedNode("v22.12.0");
    const row = await checkManagedNodeRuntime({
      managedDir,
      bundledNodeBinary: "/fake/bundled/bin/node",
      install: async (opts) => ({
        ok: true,
        copied: false,
        managedNodeDir: path.join(opts!.managedDir!, "node"),
        version: "v22.12.0",
        reason: "version matches bundled \u2014 no copy needed",
      }),
    });
    expect(row.status).toBe("ok");
    expect(row.message).toContain("v22.12.0");
  });

  it("re-copies on version mismatch (install rewrites marker)", async () => {
    writeManagedNode("v22.10.0");
    const row = await checkManagedNodeRuntime({
      managedDir,
      bundledNodeBinary: "/fake/bundled/bin/node",
      install: async (opts) => {
        // Simulate replacement.
        writeManagedNode("v22.12.0");
        return {
          ok: true,
          copied: true,
          managedNodeDir: path.join(opts!.managedDir!, "node"),
          version: "v22.12.0",
        };
      },
    });
    expect(row.status).toBe("ok");
    expect(row.message).toContain("v22.12.0");
    const marker = fs
      .readFileSync(path.join(managedDir, "node", ".version"), "utf-8")
      .trim();
    expect(marker).toBe("v22.12.0");
  });

  it("warns 'no bundled source' for standalone CLI install", async () => {
    const row = await checkManagedNodeRuntime({
      managedDir,
      bundledNodeBinary: null,
      install: async () => ({
        ok: true,
        copied: false,
        managedNodeDir: path.join(managedDir, "node"),
        reason: "no bundled source",
      }),
    });
    expect(row.status).toBe("warning");
    expect(row.message).toContain("standalone");
  });

  it("surfaces install error as a fixable warning", async () => {
    const row = await checkManagedNodeRuntime({
      managedDir,
      bundledNodeBinary: "/fake/bundled/bin/node",
      install: async () => ({
        ok: false,
        copied: false,
        managedNodeDir: path.join(managedDir, "node"),
        error: "ENOSPC: no space left on device",
      }),
    });
    expect(row.status).toBe("warning");
    expect(row.fixable).toBe(true);
    expect(row.message).toContain("ENOSPC");
  });
});
