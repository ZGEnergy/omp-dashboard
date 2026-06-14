/**
 * Unit tests for ensureBundledGitOnPath + resolveBundledGitDir.
 * See change: embed-git-bash-on-windows.
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  ensureBundledGitOnPath,
  resolveBundledGitDir,
} from "../platform/ensure-bundled-git.js";

const win = path.win32.join;
const GIT_DIR = "C:\\app\\resources\\git";

/** exists-stub: true for any path under one of `present` prefixes. */
function existsFor(present: string[]): (p: string) => boolean {
  const set = new Set(present.map((p) => p.toLowerCase()));
  return (p) => set.has(p.toLowerCase());
}

/** Full x64 bundle layout (mingw64). */
const x64Layout = existsFor([
  win(GIT_DIR, "cmd", "git.exe"),
  win(GIT_DIR, "cmd"),
  win(GIT_DIR, "usr", "bin"),
  win(GIT_DIR, "mingw64"),
  win(GIT_DIR, "mingw64", "bin"),
  win(GIT_DIR, "mingw64", "libexec", "git-core"),
  win(GIT_DIR, "mingw64", "ssl", "certs", "ca-bundle.crt"),
]);

describe("resolveBundledGitDir", () => {
  it("returns root when cmd/git.exe exists under resourcesPath/git", () => {
    const exists = existsFor([win(GIT_DIR, "cmd", "git.exe")]);
    expect(resolveBundledGitDir({ resourcesPath: "C:\\app\\resources", exists })).toBe(GIT_DIR);
  });
  it("returns null when no git launcher present", () => {
    expect(resolveBundledGitDir({ resourcesPath: "C:\\app\\resources", exists: () => false })).toBeNull();
  });
  it("honors extra candidate roots", () => {
    const alt = "D:\\standalone\\git";
    const exists = existsFor([win(alt, "cmd", "git.exe")]);
    expect(resolveBundledGitDir({ candidates: [alt], exists })).toBe(alt);
  });
});

describe("ensureBundledGitOnPath", () => {
  it("no-op on non-Windows", () => {
    const env = { PATH: "/usr/bin" };
    expect(ensureBundledGitOnPath(env, { platform: "darwin", gitDir: GIT_DIR, exists: x64Layout })).toBe(env);
  });

  it("no-op when source is host", () => {
    const env = { PATH: "C:\\Windows\\System32" };
    expect(
      ensureBundledGitOnPath(env, { platform: "win32", source: "host", gitDir: GIT_DIR, exists: x64Layout }),
    ).toBe(env);
  });

  it("no-op when no bundled git resolvable", () => {
    const env = { PATH: "C:\\Windows\\System32" };
    expect(
      ensureBundledGitOnPath(env, { platform: "win32", source: "bundled", gitDir: null, exists: x64Layout }),
    ).toBe(env);
  });

  it("prepends cmd, usr/bin, mingw64/bin and sets git env vars (bundled)", () => {
    const env = { PATH: "C:\\Windows\\System32" };
    const out = ensureBundledGitOnPath(env, {
      platform: "win32",
      source: "bundled",
      gitDir: GIT_DIR,
      exists: x64Layout,
    });
    const parts = out.PATH!.split(";");
    expect(parts.slice(0, 3)).toEqual([
      win(GIT_DIR, "cmd"),
      win(GIT_DIR, "usr", "bin"),
      win(GIT_DIR, "mingw64", "bin"),
    ]);
    expect(parts.at(-1)).toBe("C:\\Windows\\System32");
    expect(out.GIT_EXEC_PATH).toBe(win(GIT_DIR, "mingw64", "libexec", "git-core"));
    expect(out.SSL_CERT_FILE).toBe(win(GIT_DIR, "mingw64", "ssl", "certs", "ca-bundle.crt"));
  });

  it("uses clangarm64 when mingw64 absent (arm64)", () => {
    const armLayout = existsFor([
      win(GIT_DIR, "cmd", "git.exe"),
      win(GIT_DIR, "cmd"),
      win(GIT_DIR, "usr", "bin"),
      win(GIT_DIR, "clangarm64"),
      win(GIT_DIR, "clangarm64", "bin"),
      win(GIT_DIR, "clangarm64", "libexec", "git-core"),
    ]);
    const out = ensureBundledGitOnPath({ PATH: "C:\\Windows\\System32" }, {
      platform: "win32",
      source: "bundled",
      gitDir: GIT_DIR,
      exists: armLayout,
    });
    expect(out.PATH).toContain(win(GIT_DIR, "clangarm64", "bin"));
    expect(out.GIT_EXEC_PATH).toBe(win(GIT_DIR, "clangarm64", "libexec", "git-core"));
  });

  it("is idempotent (apply twice == apply once)", () => {
    const env = { PATH: "C:\\Windows\\System32" };
    const once = ensureBundledGitOnPath(env, { platform: "win32", source: "bundled", gitDir: GIT_DIR, exists: x64Layout });
    const twice = ensureBundledGitOnPath(once, { platform: "win32", source: "bundled", gitDir: GIT_DIR, exists: x64Layout });
    expect(twice).toEqual(once);
  });
});
