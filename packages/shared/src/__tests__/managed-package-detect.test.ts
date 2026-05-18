/**
 * Tests for `isPackageInstalledOnDisk` — the shared helper that replaced
 * the broken `require.resolve(name + "/package.json")` pattern.
 *
 * The bug-fix scenario (test #1) is the canonical regression pin: a
 * package with a restrictive `exports` map that omits `./package.json`
 * MUST still be detected as installed. The pre-fix code returned false
 * for these (via `ERR_PACKAGE_PATH_NOT_EXPORTED`), causing the bootstrap
 * to re-run `npm install` on every launch and prune the managed tree.
 *
 * See change: fix-is-npm-package-installed-exports-map.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isPackageInstalledOnDisk } from "../managed-package-detect.js";

function plant(
  tmp: string,
  pkgName: string,
  contents: string | object,
): void {
  const dir = path.join(tmp, "node_modules", ...pkgName.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  const body =
    typeof contents === "string" ? contents : JSON.stringify(contents);
  fs.writeFileSync(path.join(dir, "package.json"), body);
}

describe("isPackageInstalledOnDisk", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-detect-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects a package WITH a restrictive exports map (regression pin)", () => {
    plant(tmp, "@scope/restricted-exports", {
      name: "@scope/restricted-exports",
      version: "1.0.0",
      exports: { ".": "./index.js" },
    });
    // Pre-fix code would return false (require.resolve threw
    // ERR_PACKAGE_PATH_NOT_EXPORTED). The fixed helper returns true.
    expect(isPackageInstalledOnDisk("@scope/restricted-exports", tmp)).toBe(true);
  });

  it("matches when expectedVersion equals installed version", () => {
    plant(tmp, "@scope/restricted-exports", {
      name: "@scope/restricted-exports",
      version: "1.0.0",
      exports: { ".": "./index.js" },
    });
    expect(
      isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "1.0.0"),
    ).toBe(true);
  });

  it("returns false when expectedVersion differs from installed version", () => {
    plant(tmp, "@scope/restricted-exports", {
      name: "@scope/restricted-exports",
      version: "1.0.0",
    });
    expect(
      isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "2.0.0"),
    ).toBe(false);
  });

  it("treats wildcard version `*` as presence-only", () => {
    plant(tmp, "@scope/restricted-exports", {
      name: "@scope/restricted-exports",
      version: "1.0.0",
    });
    expect(
      isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "*"),
    ).toBe(true);
  });

  it("detects a package with no exports map", () => {
    plant(tmp, "no-exports", { name: "no-exports", version: "2.0.0" });
    expect(isPackageInstalledOnDisk("no-exports", tmp)).toBe(true);
  });

  it("returns false for corrupt package.json (presence-only and version-pinned)", () => {
    plant(tmp, "corrupt", "this is not json");
    // Corrupt JSON is treated as "needs reinstall" in both modes —
    // a broken install should not be reported as healthy.
    expect(isPackageInstalledOnDisk("corrupt", tmp)).toBe(false);
    expect(isPackageInstalledOnDisk("corrupt", tmp, "1.0.0")).toBe(false);
  });

  it("returns false when package.json is missing", () => {
    expect(isPackageInstalledOnDisk("not-there", tmp)).toBe(false);
    expect(isPackageInstalledOnDisk("not-there", tmp, "1.0.0")).toBe(false);
  });

  it("handles scoped names with explicit slashes", () => {
    plant(tmp, "@scope/pkg-name", { name: "@scope/pkg-name", version: "0.1.0" });
    expect(isPackageInstalledOnDisk("@scope/pkg-name", tmp)).toBe(true);
  });

  it("handles unscoped names", () => {
    plant(tmp, "unscoped-pkg", { name: "unscoped-pkg", version: "5.0.0" });
    expect(isPackageInstalledOnDisk("unscoped-pkg", tmp)).toBe(true);
  });
});
