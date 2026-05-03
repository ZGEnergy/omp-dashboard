/**
 * Unit tests for `prependManagedNodeToPath` and friends.
 *
 * Real tmp HOME (per setup-home tripwire) so `getManagedDir()` resolves
 * under the tmp tree. We create / remove the managed Node binary on
 * disk to flip the present/absent branches.
 *
 * See change: embed-managed-node-runtime (task 2.5).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getManagedNodeBinDir,
  getManagedNodeBinary,
  isManagedNodePresent,
  prependManagedNodeToPath,
} from "../platform/managed-node-path.js";
import { getManagedDir } from "../managed-paths.js";

const isWin = process.platform === "win32";

describe("getManagedNodeBinDir", () => {
  it("returns <managedDir>/node on Windows", () => {
    const env = { homedir: "/fake/home" };
    expect(getManagedNodeBinDir(env, "win32")).toBe(
      path.join("/fake/home", ".pi-dashboard", "node"),
    );
  });

  it("returns <managedDir>/node/bin on Unix", () => {
    const env = { homedir: "/fake/home" };
    expect(getManagedNodeBinDir(env, "linux")).toBe(
      path.join("/fake/home", ".pi-dashboard", "node", "bin"),
    );
    expect(getManagedNodeBinDir(env, "darwin")).toBe(
      path.join("/fake/home", ".pi-dashboard", "node", "bin"),
    );
  });
});

describe("getManagedNodeBinary", () => {
  it("uses node.exe on Windows", () => {
    expect(getManagedNodeBinary({ homedir: "/h" }, "win32")).toBe(
      path.join("/h", ".pi-dashboard", "node", "node.exe"),
    );
  });

  it("uses bin/node on Unix", () => {
    expect(getManagedNodeBinary({ homedir: "/h" }, "linux")).toBe(
      path.join("/h", ".pi-dashboard", "node", "bin", "node"),
    );
  });
});

describe("prependManagedNodeToPath", () => {
  let tmpHome: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "managed-node-path-"));
    origHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function installFakeManagedNode(): string {
    // os.homedir() reads HOME on Unix and USERPROFILE on Windows. The
    // setup-home tripwire only sets HOME, so on Windows tests we set
    // USERPROFILE here too.
    if (isWin) process.env.USERPROFILE = tmpHome;
    const dir = getManagedNodeBinDir();
    fs.mkdirSync(dir, { recursive: true });
    const binary = getManagedNodeBinary();
    fs.writeFileSync(binary, "fake");
    return dir;
  }

  it("no-op (returns clone) when managed runtime is absent", () => {
    const base = { PATH: "/usr/bin:/bin", FOO: "bar" };
    const out = prependManagedNodeToPath(base);
    expect(out).not.toBe(base);
    expect(out.PATH).toBe("/usr/bin:/bin");
    expect(out.FOO).toBe("bar");
  });

  it("does not mutate process.env", () => {
    const beforePath = process.env.PATH;
    prependManagedNodeToPath();
    expect(process.env.PATH).toBe(beforePath);
  });

  it("prepends managed Node bin dir when present", () => {
    const dir = installFakeManagedNode();
    const base = { PATH: "/usr/bin:/bin", X: "y" };
    const out = prependManagedNodeToPath(base);
    expect(out).not.toBe(base);
    expect(out.PATH?.startsWith(dir)).toBe(true);
    expect(out.PATH).toBe(`${dir}${path.delimiter}/usr/bin:/bin`);
    expect(out.X).toBe("y");
  });

  it("does not double-prepend when dir already at head", () => {
    const dir = installFakeManagedNode();
    const initial = `${dir}${path.delimiter}/usr/bin`;
    const base = { PATH: initial };
    const out = prependManagedNodeToPath(base);
    expect(out.PATH).toBe(initial);
  });

  it("isManagedNodePresent flips with the binary on disk", () => {
    expect(isManagedNodePresent()).toBe(false);
    installFakeManagedNode();
    expect(isManagedNodePresent()).toBe(true);
  });
});
