/**
 * Unit tests for `installManagedNode` from `bootstrap-install.ts`.
 *
 * Uses a real tmp HOME (per the global setup-home tripwire) and a
 * real-on-disk fake bundled-node directory. The bundled-Node version
 * is read via the `_readVersion` test seam so we never spawn `node`
 * here.
 *
 * See change: embed-managed-node-runtime (task 2.4).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installManagedNode } from "../bootstrap-install.js";

const isWin = process.platform === "win32";

function makeFakeBundle(dir: string, opts?: { partial?: boolean }): void {
  fs.mkdirSync(dir, { recursive: true });
  if (isWin) {
    fs.writeFileSync(path.join(dir, "node.exe"), "fake-node-binary");
    if (!opts?.partial) {
      fs.writeFileSync(path.join(dir, "npm.cmd"), "@echo off\nnpm");
      fs.writeFileSync(path.join(dir, "npx.cmd"), "@echo off\nnpx");
    }
    fs.mkdirSync(path.join(dir, "node_modules", "npm", "bin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, "node_modules", "npm", "bin", "npm-cli.js"),
      "// npm-cli",
    );
  } else {
    fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(dir, "bin", "node"), "fake-node-binary");
    fs.writeFileSync(path.join(dir, "bin", "npm"), "#!/bin/sh\nnpm");
    fs.writeFileSync(path.join(dir, "bin", "npx"), "#!/bin/sh\nnpx");
    fs.mkdirSync(path.join(dir, "lib", "node_modules", "npm", "bin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
      "// npm-cli",
    );
  }
}

describe("installManagedNode", () => {
  let tmpRoot: string;
  let bundledDir: string;
  let managedDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "managed-node-test-"));
    bundledDir = path.join(tmpRoot, "bundled");
    managedDir = path.join(tmpRoot, "managed");
    makeFakeBundle(bundledDir);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("first run: copies tree and writes .version marker", async () => {
    const r = await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.12.0",
    });
    expect(r.ok).toBe(true);
    expect(r.copied).toBe(true);
    expect(r.version).toBe("v22.12.0");

    const targetBinary = isWin
      ? path.join(managedDir, "node", "node.exe")
      : path.join(managedDir, "node", "bin", "node");
    expect(fs.existsSync(targetBinary)).toBe(true);

    const marker = fs.readFileSync(
      path.join(managedDir, "node", ".version"),
      "utf-8",
    );
    expect(marker.trim()).toBe("v22.12.0");
  });

  it("idempotent re-run with matching version is a no-op", async () => {
    await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.12.0",
    });
    const targetBinary = isWin
      ? path.join(managedDir, "node", "node.exe")
      : path.join(managedDir, "node", "bin", "node");
    const mtimeBefore = fs.statSync(targetBinary).mtimeMs;

    // Wait one tick to ensure mtime would change if we recopied.
    await new Promise((r) => setTimeout(r, 10));

    const r = await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.12.0",
    });
    expect(r.ok).toBe(true);
    expect(r.copied).toBe(false);
    expect(r.reason).toMatch(/version matches/);
    const mtimeAfter = fs.statSync(targetBinary).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it("mismatched version triggers a re-copy", async () => {
    await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.12.0",
    });

    // Bundle now reports a newer version.
    const r = await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.13.0",
    });
    expect(r.ok).toBe(true);
    expect(r.copied).toBe(true);
    expect(r.version).toBe("v22.13.0");

    const marker = fs.readFileSync(
      path.join(managedDir, "node", ".version"),
      "utf-8",
    );
    expect(marker.trim()).toBe("v22.13.0");
  });

  it("missing bundled source: no-op without error", async () => {
    const r = await installManagedNode({
      bundledNodeDir: null,
      managedDir,
    });
    expect(r.ok).toBe(true);
    expect(r.copied).toBe(false);
    expect(r.reason).toMatch(/no bundled source/);
    expect(fs.existsSync(path.join(managedDir, "node"))).toBe(false);
  });

  it("bundled binary missing: no-op (treat as no source)", async () => {
    const emptyBundled = path.join(tmpRoot, "empty");
    fs.mkdirSync(emptyBundled, { recursive: true });
    const r = await installManagedNode({
      bundledNodeDir: emptyBundled,
      managedDir,
      _readVersion: () => null,
    });
    expect(r.ok).toBe(true);
    expect(r.copied).toBe(false);
    expect(r.reason).toMatch(/bundled node binary/);
  });

  it("dir present but marker missing: re-copies (treats as mismatch)", async () => {
    // Pretend a partial copy left behind a directory with no marker.
    fs.mkdirSync(path.join(managedDir, "node", "leftover"), { recursive: true });

    const r = await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.12.0",
    });
    expect(r.ok).toBe(true);
    expect(r.copied).toBe(true);
    // Leftover should be gone after the rm-then-copy.
    expect(
      fs.existsSync(path.join(managedDir, "node", "leftover")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(managedDir, "node", ".version")),
    ).toBe(true);
  });

  it("reports progress through the callback", async () => {
    const events: Array<{ step: string; status: string }> = [];
    await installManagedNode({
      bundledNodeDir: bundledDir,
      managedDir,
      _readVersion: () => "v22.12.0",
      progress: (p) => events.push({ step: p.step, status: p.status }),
    });
    expect(events.some((e) => e.step === "node-runtime" && e.status === "running")).toBe(true);
    expect(events.some((e) => e.step === "node-runtime" && e.status === "done")).toBe(true);
  });
});
