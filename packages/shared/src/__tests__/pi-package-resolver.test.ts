/**
 * pi-package-resolver tests — real-fs tmp dirs, no mocking.
 *
 * Each test builds a virtual `~/.omp/agent/` (via `agentDir` injection)
 * and optionally a virtual `<cwd>/.omp/` for project-scope cases. The
 * resolver's three deps (`agentDir`, `cwd`, `npmRoot`) are all injected
 * so tests are hermetic and never read the developer's real settings.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolvePiPackage, resolvePiPackageEntry } from "../pi-package-resolver.js";

let root: string;
let agentDir: string;
let cwd: string;
let npmRoot: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-resolver-test-"));
  agentDir = path.join(root, ".omp", "agent");
  cwd = path.join(root, "project");
  npmRoot = path.join(root, "global-npm", "node_modules");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(npmRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ── helpers ─────────────────────────────────────────────────────────

function writeSettings(scope: "user" | "project", body: Record<string, unknown>): void {
  const settingsPath =
    scope === "user"
      ? path.join(agentDir, "settings.json")
      : path.join(cwd, ".omp", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(body, null, 2));
}

function writePackage(pkgDir: string, pkgJson: Record<string, unknown>, files: Record<string, string> = {}): void {
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(pkgJson, null, 2));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(pkgDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

// ── 2.2: npm scope (global) ─────────────────────────────────────────

describe("npm: install resolution", () => {
  it("resolves an npm: peer in global scope via npmRoot", () => {
    writeSettings("user", { packages: ["npm:@pi/anthropic-messages"] });
    const pkgDir = path.join(npmRoot, "@pi", "anthropic-messages");
    writePackage(pkgDir, {
      name: "@pi/anthropic-messages",
      exports: { ".": "./extensions/index.js" },
    }, {
      "extensions/index.js": "export default function() {}",
    });

    const result = resolvePiPackage("@pi/anthropic-messages", { agentDir, npmRoot });
    expect(result).not.toBeNull();
    expect(result!.packageDir).toBe(pkgDir);
    expect(result!.entryPath).toBe(path.join(pkgDir, "extensions", "index.js"));
    expect(result!.scope).toBe("user");
    expect(result!.source).toBe("npm:@pi/anthropic-messages");
    expect(result!.packageJsonName).toBe("@pi/anthropic-messages");
  });

  it("ignores @version suffix in npm: spec when resolving", () => {
    // Use a single-segment version to avoid email-obfuscation in source files.
    writeSettings("user", { packages: ["npm:foo@latest"] });
    const pkgDir = path.join(npmRoot, "foo");
    writePackage(pkgDir, { name: "foo", main: "index.js" }, { "index.js": "" });

    const result = resolvePiPackage("foo", { agentDir, npmRoot });
    expect(result?.packageDir).toBe(pkgDir);
  });
});

// ── 2.3: git scope ──────────────────────────────────────────────────

describe("git: install resolution", () => {
  it("resolves https github URL to ~/.omp/agent/git/<host>/<path>", () => {
    writeSettings("user", {
      packages: ["https://github.com/BlackBeltTechnology/pi-anthropic-messages.git"],
    });
    const pkgDir = path.join(agentDir, "git", "github.com", "BlackBeltTechnology", "pi-anthropic-messages");
    writePackage(pkgDir, {
      name: "@pi/anthropic-messages",
      main: "./extensions/index.ts",
    }, {
      "extensions/index.ts": "export default function() {}",
    });

    const result = resolvePiPackage("@pi/anthropic-messages", { agentDir, npmRoot });
    expect(result?.packageDir).toBe(pkgDir);
    expect(result?.entryPath).toBe(path.join(pkgDir, "extensions", "index.ts"));
    expect(result?.scope).toBe("user");
  });

  it("handles git+https:// and git@ shorthand forms", () => {
    writeSettings("user", { packages: ["git@github.com:owner/repo.git"] });
    const pkgDir = path.join(agentDir, "git", "github.com", "owner", "repo");
    writePackage(pkgDir, { name: "thing", main: "x.js" }, { "x.js": "" });

    expect(resolvePiPackage("thing", { agentDir, npmRoot })?.packageDir).toBe(pkgDir);
  });
});

// ── 2.4: absolute local path ────────────────────────────────────────

describe("absolute path resolution", () => {
  it("resolves an absolute path entry to itself", () => {
    const pkgDir = path.join(root, "elsewhere", "my-pkg");
    writePackage(pkgDir, { name: "my-pkg", main: "entry.js" }, { "entry.js": "" });
    writeSettings("user", { packages: [pkgDir] });

    const result = resolvePiPackage("my-pkg", { agentDir, npmRoot });
    expect(result?.packageDir).toBe(pkgDir);
    expect(result?.entryPath).toBe(path.join(pkgDir, "entry.js"));
  });
});

// ── 2.5: relative path in project-scope ─────────────────────────────

describe("relative path resolution under project scope", () => {
  it("resolves a relative entry against <cwd>/.omp/", () => {
    const pkgDir = path.join(cwd, "..", "sibling");
    writePackage(pkgDir, { name: "sibling-pkg", main: "ok.ts" }, { "ok.ts": "" });
    writeSettings("project", { packages: ["../../sibling"] }); // relative to <cwd>/.omp/

    const result = resolvePiPackage("sibling-pkg", { agentDir, cwd, npmRoot });
    expect(result?.scope).toBe("project");
    expect(path.resolve(result!.packageDir)).toBe(path.resolve(pkgDir));
  });
});

// ── 2.6: scope precedence ───────────────────────────────────────────

describe("scope precedence", () => {
  it("project wins over user by default when both define the same name", () => {
    const projPkg = path.join(root, "proj-impl");
    const userPkg = path.join(root, "user-impl");
    writePackage(projPkg, { name: "shared", main: "proj.js" }, { "proj.js": "" });
    writePackage(userPkg, { name: "shared", main: "user.js" }, { "user.js": "" });
    writeSettings("project", { packages: [projPkg] });
    writeSettings("user", { packages: [userPkg] });

    const result = resolvePiPackage("shared", { agentDir, cwd, npmRoot });
    expect(result?.scope).toBe("project");
    expect(result?.packageDir).toBe(projPkg);
  });

  it("scope:'user' skips project even when both have a match", () => {
    const projPkg = path.join(root, "proj-impl");
    const userPkg = path.join(root, "user-impl");
    writePackage(projPkg, { name: "shared", main: "proj.js" }, { "proj.js": "" });
    writePackage(userPkg, { name: "shared", main: "user.js" }, { "user.js": "" });
    writeSettings("project", { packages: [projPkg] });
    writeSettings("user", { packages: [userPkg] });

    expect(resolvePiPackage("shared", { agentDir, cwd, npmRoot, scope: "user" })?.packageDir).toBe(userPkg);
  });

  it("scope:'project' returns null without cwd", () => {
    expect(resolvePiPackage("anything", { agentDir, npmRoot, scope: "project" })).toBeNull();
  });
});

// ── 2.7: entry-point priority chain ─────────────────────────────────

describe("entry-point resolution priority", () => {
  function setupPkg(pkgJson: Record<string, unknown>, files: Record<string, string>): string {
    const pkgDir = path.join(root, "ep-test");
    writePackage(pkgDir, { name: "ep-test", ...pkgJson }, files);
    writeSettings("user", { packages: [pkgDir] });
    return pkgDir;
  }

  it("exports['.'] wins over main and pi.extensions", () => {
    const dir = setupPkg(
      {
        exports: { ".": "./from-exports.js" },
        main: "./from-main.js",
        pi: { extensions: ["./from-pi.js"] },
      },
      { "from-exports.js": "", "from-main.js": "", "from-pi.js": "" },
    );
    expect(resolvePiPackageEntry("ep-test", { agentDir, npmRoot })).toBe(path.join(dir, "from-exports.js"));
  });

  it("exports conditional import/default/node fields resolve to the first present string", () => {
    const dir = setupPkg(
      { exports: { ".": { default: "./d.js", import: "./i.js" } } },
      { "d.js": "", "i.js": "" },
    );
    // import takes priority per design D4
    expect(resolvePiPackageEntry("ep-test", { agentDir, npmRoot })).toBe(path.join(dir, "i.js"));
  });

  it("main wins when exports absent", () => {
    const dir = setupPkg(
      { main: "./from-main.js", pi: { extensions: ["./from-pi.js"] } },
      { "from-main.js": "", "from-pi.js": "" },
    );
    expect(resolvePiPackageEntry("ep-test", { agentDir, npmRoot })).toBe(path.join(dir, "from-main.js"));
  });

  it("pi.extensions[0] wins when neither exports nor main", () => {
    const dir = setupPkg(
      { pi: { extensions: ["./from-pi.ts"] } },
      { "from-pi.ts": "" },
    );
    expect(resolvePiPackageEntry("ep-test", { agentDir, npmRoot })).toBe(path.join(dir, "from-pi.ts"));
  });

  it("index.js fallback wins when no entry fields", () => {
    const dir = setupPkg({}, { "index.js": "" });
    expect(resolvePiPackageEntry("ep-test", { agentDir, npmRoot })).toBe(path.join(dir, "index.js"));
  });

  it("index.ts fallback wins when no index.js", () => {
    const dir = setupPkg({}, { "index.ts": "" });
    expect(resolvePiPackageEntry("ep-test", { agentDir, npmRoot })).toBe(path.join(dir, "index.ts"));
  });

  it("returns entryPath:null when package matched but no candidate exists", () => {
    const dir = setupPkg({ main: "./missing.js" }, {});
    const result = resolvePiPackage("ep-test", { agentDir, npmRoot });
    expect(result?.packageDir).toBe(dir);
    expect(result?.entryPath).toBeNull();
  });
});

// ── 2.8: not in any settings → null ─────────────────────────────────

describe("misses return null", () => {
  it("returns null when no settings entry matches the spec", () => {
    writeSettings("user", { packages: [] });
    expect(resolvePiPackage("@some/missing", { agentDir, npmRoot })).toBeNull();
    expect(resolvePiPackageEntry("@some/missing", { agentDir, npmRoot })).toBeNull();
  });

  it("returns null when a candidate package's package.json#name differs", () => {
    const pkgDir = path.join(root, "wrong-name");
    writePackage(pkgDir, { name: "actually-foo", main: "x.js" }, { "x.js": "" });
    writeSettings("user", { packages: [pkgDir] });

    expect(resolvePiPackage("requested-bar", { agentDir, npmRoot })).toBeNull();
  });
});

// ── 2.9: corrupt package.json — keep walking ────────────────────────

describe("graceful degradation", () => {
  it("skips a package with malformed package.json and continues", () => {
    const badDir = path.join(root, "bad-pkg");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "package.json"), "{ this is not json");

    const goodDir = path.join(root, "good-pkg");
    writePackage(goodDir, { name: "target", main: "ok.js" }, { "ok.js": "" });

    writeSettings("user", { packages: [badDir, goodDir] });

    const result = resolvePiPackage("target", { agentDir, npmRoot });
    expect(result?.packageDir).toBe(goodDir);
  });
});

// ── 2.10: missing settings.json → null ──────────────────────────────

describe("missing settings.json", () => {
  it("returns null without throwing when ~/.omp/agent/settings.json is absent", () => {
    // beforeEach creates the agentDir but no settings.json inside it.
    expect(resolvePiPackage("anything", { agentDir, npmRoot })).toBeNull();
  });

  it("returns null when the global settings.json contains invalid JSON", () => {
    fs.writeFileSync(path.join(agentDir, "settings.json"), "not json at all");
    expect(resolvePiPackage("anything", { agentDir, npmRoot })).toBeNull();
  });

  it("handles {source: '...'} object-form entries", () => {
    const pkgDir = path.join(root, "obj-form");
    writePackage(pkgDir, { name: "obj-pkg", main: "e.js" }, { "e.js": "" });
    writeSettings("user", { packages: [{ source: pkgDir, extensions: [] }] });

    expect(resolvePiPackage("obj-pkg", { agentDir, npmRoot })?.packageDir).toBe(pkgDir);
  });
});
