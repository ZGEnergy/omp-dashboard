/**
 * ensure-gh-default.cjs — pin gh to ZGEnergy origin for fork checkouts.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "ensure-gh-default.cjs");

const temps = [];

function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ensure-gh-default-"));
  temps.push(d);
  return d;
}

afterEach(() => {
  for (const d of temps.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function runEnsure(cwd) {
  // Script resolves ROOT as scripts/.. of its own path; run by copying into a
  // fake tree so it operates on the temp repo, not the real checkout.
  const scriptsDir = join(cwd, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(SCRIPT, join(scriptsDir, "ensure-gh-default.cjs"));
  execFileSync("node", [join(scriptsDir, "ensure-gh-default.cjs")], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function initRepo(cwd, originUrl) {
  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "test"]);
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "@blackbelt-technology/pi-agent-dashboard",
      repository: {
        type: "git",
        url: "https://github.com/BlackBeltTechnology/pi-agent-dashboard",
      },
    }),
  );
  if (originUrl) {
    git(cwd, ["remote", "add", "origin", originUrl]);
  }
}

describe("ensure-gh-default.cjs", () => {
  it("sets remote.origin.gh-resolved=base for ZGEnergy origin", () => {
    const cwd = tempDir();
    initRepo(cwd, "git@github.com:ZGEnergy/omp-dashboard");
    expect(() => git(cwd, ["config", "--get", "remote.origin.gh-resolved"])).toThrow();
    runEnsure(cwd);
    expect(git(cwd, ["config", "--get", "remote.origin.gh-resolved"])).toBe("base");
  });

  it("is a no-op when already base", () => {
    const cwd = tempDir();
    initRepo(cwd, "https://github.com/ZGEnergy/omp-dashboard.git");
    git(cwd, ["config", "remote.origin.gh-resolved", "base"]);
    runEnsure(cwd);
    expect(git(cwd, ["config", "--get", "remote.origin.gh-resolved"])).toBe("base");
  });

  it("does not pin non-ZGEnergy origin", () => {
    const cwd = tempDir();
    initRepo(cwd, "https://github.com/BlackBeltTechnology/pi-agent-dashboard.git");
    runEnsure(cwd);
    expect(() => git(cwd, ["config", "--get", "remote.origin.gh-resolved"])).toThrow();
  });

  it("no-ops outside a git work tree", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "package.json"), "{}");
    expect(() => runEnsure(cwd)).not.toThrow();
  });
});
