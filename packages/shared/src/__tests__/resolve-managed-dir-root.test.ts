/**
 * Tests for `resolveManagedDirRoot` \u2014 the managed-dir walk-up helper used by
 * the dashboard server's client static-file resolution chain.
 *
 * See change: streamline-electron-bootstrap-and-recovery (Failure 2).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveManagedDirRoot } from "../managed-paths.js";

describe("resolveManagedDirRoot", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "managed-root-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns the managed dir when .version is 4 levels up", () => {
    const managed = path.join(tmp, "fake-managed");
    fs.mkdirSync(managed, { recursive: true });
    fs.writeFileSync(path.join(managed, ".version"), "1.2.3\n");

    const deep = path.join(
      managed,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-server",
      "src",
    );
    fs.mkdirSync(deep, { recursive: true });

    expect(resolveManagedDirRoot(deep)).toBe(managed);
  });

  it("returns null when no .version exists in any ancestor", () => {
    const deep = path.join(tmp, "a", "b", "c", "d");
    fs.mkdirSync(deep, { recursive: true });

    expect(resolveManagedDirRoot(deep)).toBe(null);
  });

  it("returns startDir itself when .version is a sibling of startDir's contents", () => {
    // i.e. startDir IS the managed dir.
    const managed = path.join(tmp, "managed");
    fs.mkdirSync(managed);
    fs.writeFileSync(path.join(managed, ".version"), "x\n");

    expect(resolveManagedDirRoot(managed)).toBe(managed);
  });

  it("stops at the filesystem root without throwing", () => {
    // Run from / \u2014 there should be no .version at any real ancestor.
    // We test with an injected existsSync that always returns false to keep
    // the test machine-independent.
    const result = resolveManagedDirRoot("/some/deep/path", {
      existsSync: () => false,
    });
    expect(result).toBe(null);
  });

  it("prefers the deepest .version when nested managed dirs exist", () => {
    // Outer managed at tmp/outer, inner at tmp/outer/sub/inner.
    const outer = path.join(tmp, "outer");
    fs.mkdirSync(outer);
    fs.writeFileSync(path.join(outer, ".version"), "outer\n");

    const inner = path.join(outer, "sub", "inner");
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, ".version"), "inner\n");

    const deep = path.join(inner, "node_modules", "x");
    fs.mkdirSync(deep, { recursive: true });

    expect(resolveManagedDirRoot(deep)).toBe(inner);
  });
});
