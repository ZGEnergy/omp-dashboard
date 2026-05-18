/**
 * Tests for the standard tool definitions (strategies + registration).
 *
 * We inject fake `exists` / `which` / `npmRootGlobal` so tests are
 * deterministic across platforms and don't depend on the test host's
 * real filesystem or PATH.
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import {
  ToolRegistry,
  registerDefaultTools,
  OverridesStore,
} from "../tool-registry/index.js";

function freshRegistry(opts: {
  exists?: (p: string) => boolean;
  which?: (name: string) => string | null;
  npmRootGlobal?: () => string;
  resourcesPath?: () => string | null;
  overrides?: Record<string, string>;
  platform?: NodeJS.Platform;
}) {
  const store = new OverridesStore({
    filePath: path.join(os.tmpdir(), `tool-registry-test-${Math.random()}.json`),
    warn: () => {},
  });
  for (const [k, v] of Object.entries(opts.overrides ?? {})) store.set(k, v);

  const r = new ToolRegistry({
    overrides: store,
    platform: opts.platform ?? "linux",
  });
  registerDefaultTools(r, {
    exists: opts.exists ?? (() => false),
    which: opts.which ?? (() => null),
    npmRootGlobal: opts.npmRootGlobal ?? (() => ""),
    resourcesPath: opts.resourcesPath ?? (() => null),
  });
  return r;
}

describe("pi binary definition", () => {
  it("chain order: override → managed → where", () => {
    const r = freshRegistry({ which: (n) => (n === "pi" ? "/usr/bin/pi" : null) });
    const res = r.resolve("pi");
    expect(res.tried.map((t) => t.strategy)).toEqual([
      "override",
      "managed",
      "where",
    ]);
    expect(res.ok).toBe(true);
    expect(res.path).toBe("/usr/bin/pi");
    expect(res.source).toBe("system");
  });

  it("managed wins over system when MANAGED_BIN/pi exists", () => {
    const managed = path.join(os.homedir(), ".pi-dashboard", "node_modules", ".bin", "pi");
    const r = freshRegistry({
      exists: (p) => p === managed,
      which: () => "/usr/bin/pi",
      platform: "linux",
    });
    const res = r.resolve("pi");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(managed);
    expect(res.source).toBe("managed");
  });

  it("picks .cmd extension on Windows", () => {
    const managed = path.join(os.homedir(), ".pi-dashboard", "node_modules", ".bin", "pi.cmd");
    const r = freshRegistry({
      exists: (p) => p === managed,
      platform: "win32",
    });
    const res = r.resolve("pi");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(managed);
  });

  it("override wins when set and path exists", () => {
    const custom = "/opt/custom/pi";
    const r = freshRegistry({
      overrides: { pi: custom },
      exists: (p) => p === custom, // validate() passes
    });
    const res = r.resolve("pi");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(custom);
    expect(res.source).toBe("override");
  });

  it("invalid override falls through to next strategy with 'invalid:' reason", () => {
    const r = freshRegistry({
      overrides: { pi: "/does/not/exist" },
      which: () => "/usr/bin/pi",
      exists: (p) => p === "/usr/bin/pi", // override path fails validate
    });
    const res = r.resolve("pi");
    expect(res.ok).toBe(true);
    expect(res.source).toBe("system");
    expect(res.tried[0].strategy).toBe("override");
    expect(res.tried[0].result).toMatch(/^invalid:/);
  });
});

describe("pi-coding-agent module definition", () => {
  it("probes both @earendil-works (preferred) and @mariozechner (legacy fallback) alias names", () => {
    const r = freshRegistry({ exists: () => false });
    const res = r.resolve("pi-coding-agent");
    const names = res.tried.map((t) => t.strategy);
    // First strategy: override. Then two bare-import (one per alias),
    // then two managed, then two npm-global.
    expect(names[0]).toBe("override");
    expect(names.filter((n) => n === "bare-import").length).toBe(2);
    expect(names.filter((n) => n === "managed").length).toBe(2);
    expect(names.filter((n) => n === "npm-global").length).toBe(2);
  });

  it("managed strategy hits ~/.pi-dashboard/node_modules/<pkg>/dist/index.js", () => {
    const managed = path.join(
      os.homedir(), ".pi-dashboard", "node_modules",
      "@mariozechner", "pi-coding-agent", "dist", "index.js",
    );
    const r = freshRegistry({ exists: (p) => p === managed });
    const res = r.resolve("pi-coding-agent");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(managed);
    expect(res.source).toBe("managed");
  });

  it("npm-global strategy uses <npm root -g>/<pkg>/dist/index.js", () => {
    const npmRoot = "/npm/global/root";
    const entry = path.join(npmRoot, "@mariozechner", "pi-coding-agent", "dist", "index.js");
    const r = freshRegistry({
      exists: (p) => p === entry,
      npmRootGlobal: () => npmRoot,
    });
    const res = r.resolve("pi-coding-agent");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(entry);
    expect(res.source).toBe("npm-global");
  });

  it("fails cleanly when no strategy succeeds", () => {
    const r = freshRegistry({
      exists: () => false,
      npmRootGlobal: () => "",
    });
    const res = r.resolve("pi-coding-agent");
    expect(res.ok).toBe(false);
    expect(res.path).toBeNull();
    expect(res.source).toBeNull();
    // Trail should include override + 2 bare-import + 2 managed + 2 npm-global.
    expect(res.tried.length).toBeGreaterThanOrEqual(5);
    expect(res.tried.some((t) => t.strategy === "npm-global")).toBe(true);
  });
});

describe("openspec binary definition", () => {
  it("finds openspec.cmd under managed bin on Windows", () => {
    const managed = path.join(os.homedir(), ".pi-dashboard", "node_modules", ".bin", "openspec.cmd");
    const r = freshRegistry({ exists: (p) => p === managed, platform: "win32" });
    const res = r.resolve("openspec");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(managed);
  });

  it("falls through managed → where on Unix when managed is absent", () => {
    const r = freshRegistry({
      exists: () => false,
      which: (n) => (n === "openspec" ? "/usr/local/bin/openspec" : null),
      platform: "darwin",
    });
    const res = r.resolve("openspec");
    expect(res.ok).toBe(true);
    expect(res.source).toBe("system");
    expect(res.path).toBe("/usr/local/bin/openspec");
  });
});

describe("registered tool set", () => {
  it("registers pi, pi-coding-agent, openspec, npm, node, git, jj, zrok, wt", () => {
    const r = freshRegistry({});
    for (const name of ["pi", "pi-coding-agent", "openspec", "npm", "node", "git", "jj", "zrok", "wt"]) {
      expect(r.has(name)).toBe(true);
    }
  });

  it("jj resolves via where when found", () => {
    const r = freshRegistry({
      which: (name) => (name === "jj" ? "/usr/local/bin/jj" : null),
    });
    const res = r.resolve("jj");
    expect(res.ok).toBe(true);
    expect(res.path).toBe("/usr/local/bin/jj");
    expect(res.source).toBe("system");
  });

  it("jj unavailable returns ok:false without throwing", () => {
    const r = freshRegistry({ which: () => null });
    const res = r.resolve("jj");
    expect(res.ok).toBe(false);
  });

  it("wt resolves via where when found", () => {
    const r = freshRegistry({
      platform: "win32",
      which: (name) => (name === "wt" ? "C:\\WindowsApps\\wt.exe" : null),
    });
    const res = r.resolve("wt");
    expect(res.ok).toBe(true);
    expect(res.path).toBe("C:\\WindowsApps\\wt.exe");
    expect(res.source).toBe("system");
  });

  it("wt unavailable returns ok:false without error", () => {
    const r = freshRegistry({ platform: "win32", which: () => null });
    const res = r.resolve("wt");
    expect(res.ok).toBe(false);
  });

  it("does NOT register tsx (it's a loader, not a spawn target)", () => {
    const r = freshRegistry({});
    expect(r.has("tsx")).toBe(false);
  });

  it("registers Windows-only process utilities on win32, NOT ps/pgrep", () => {
    const r = freshRegistry({ platform: "win32" });
    expect(r.has("tasklist")).toBe(true);
    expect(r.has("taskkill")).toBe(true);
    expect(r.has("wmic")).toBe(true);
    expect(r.has("powershell")).toBe(true);
    // ps/pgrep are POSIX-only; they'd always show "not found" on Windows
    // and pollute the Tools UI with red rows the code never calls.
    expect(r.has("ps")).toBe(false);
    expect(r.has("pgrep")).toBe(false);
  });

  it("registers POSIX process utilities on linux/darwin, NOT tasklist etc.", () => {
    for (const platform of ["linux", "darwin"] as NodeJS.Platform[]) {
      const r = freshRegistry({ platform });
      expect(r.has("ps")).toBe(true);
      expect(r.has("pgrep")).toBe(true);
      expect(r.has("tasklist")).toBe(false);
      expect(r.has("taskkill")).toBe(false);
      expect(r.has("wmic")).toBe(false);
      expect(r.has("powershell")).toBe(false);
    }
  });

  it("does NOT register pi-dashboard (it's the package this code is part of)", () => {
    const r = freshRegistry({});
    expect(r.has("pi-dashboard")).toBe(false);
  });
});

/**
 * Tests for the electron-bundled strategy wiring into npm + node
 * executor chains. See change: fix-electron-wizard-npm-root-enoent.
 */
describe("electron-bundled strategy: npm chain", () => {
  const RESOURCES_UNIX = "/Applications/PI-Dashboard.app/Contents/Resources";
  const RESOURCES_WIN = "C:\\Program Files\\PI Dashboard\\resources";

  it("unix: resolves npm to <resources>/node/lib/node_modules/npm/bin/npm-cli.js when bundled tree present and managed-runtime absent", () => {
    const bundledNpm = path.join(
      RESOURCES_UNIX,
      "node",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const r = freshRegistry({
      platform: "linux",
      exists: (p) => p === bundledNpm,
      resourcesPath: () => RESOURCES_UNIX,
    });
    const res = r.resolve("npm");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(bundledNpm);
    // Per design D2: electron-bundled classifies as "managed".
    expect(res.source).toBe("managed");
    // tried[] must record the electron-bundled strategy distinctly.
    expect(res.tried.some((t) => t.strategy === "electron-bundled" && t.result === "ok")).toBe(true);
  });

  it("win32: resolves npm to <resources>/node/node_modules/npm/bin/npm-cli.js (no `lib/` segment)", () => {
    const bundledNpm = path.join(
      RESOURCES_WIN,
      "node",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const r = freshRegistry({
      platform: "win32",
      exists: (p) => p === bundledNpm,
      resourcesPath: () => RESOURCES_WIN,
    });
    const res = r.resolve("npm");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(bundledNpm);
    expect(res.source).toBe("managed");
  });

  it("managed-runtime wins over electron-bundled when both exist (unix)", () => {
    const managedNpm = path.join(os.homedir(), ".pi-dashboard", "node", "bin", "npm");
    const bundledNpm = path.join(
      RESOURCES_UNIX,
      "node",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const r = freshRegistry({
      platform: "linux",
      exists: (p) => p === managedNpm || p === bundledNpm,
      resourcesPath: () => RESOURCES_UNIX,
    });
    const res = r.resolve("npm");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(managedNpm);
    // managed-runtime wins; electron-bundled should NOT appear in tried[]
    // (chain terminates at the first ok).
    expect(res.tried.some((t) => t.strategy === "electron-bundled")).toBe(false);
    expect(res.tried.find((t) => t.strategy === "managed" && t.result === "ok")).toBeDefined();
  });

  it("override wins over electron-bundled", () => {
    const override = "/opt/homebrew/bin/npm";
    const bundledNpm = path.join(
      RESOURCES_UNIX,
      "node",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const r = freshRegistry({
      platform: "linux",
      exists: (p) => p === override || p === bundledNpm,
      resourcesPath: () => RESOURCES_UNIX,
      overrides: { npm: override },
    });
    const res = r.resolve("npm");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(override);
    expect(res.source).toBe("override");
  });

  it("electron-bundled yields cleanly when resourcesPath is null (non-Electron)", () => {
    const r = freshRegistry({
      platform: "linux",
      exists: () => false,
      resourcesPath: () => null,
    });
    const res = r.resolve("npm");
    expect(res.ok).toBe(false);
    // electron-bundled MUST be tried (and fail with the canonical reason).
    const trail = res.tried.find((t) => t.strategy === "electron-bundled");
    expect(trail).toBeDefined();
    expect(trail?.result).toBe("not running in Electron (no resourcesPath)");
  });

  it("resolveExecutor(npm) returns [<bundled-node>, <bundled-npm-cli.js>] so SafePackageManager.runCommandSync spawns successfully on first Electron boot (acceptance test for pi DefaultPackageManager construction)", () => {
    const RESOURCES = "/Applications/PI-Dashboard.app/Contents/Resources";
    const bundledNode = path.join(RESOURCES, "node", "bin", "node");
    const bundledNpmCli = path.join(
      RESOURCES,
      "node",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    const r = freshRegistry({
      platform: "linux",
      exists: (p) => p === bundledNode || p === bundledNpmCli,
      which: () => null, // No system npm/node on PATH (GUI process)
      resourcesPath: () => RESOURCES,
    });
    const exec = r.resolveExecutor("npm");
    expect(exec.ok).toBe(true);
    // npm is a node-script tool: argv MUST start with the resolved node
    // interpreter, then the npm-cli.js path. This is what the
    // package-manager-wrapper feeds to adapter.spawnSync — no more bare
    // "npm" ENOENT.
    expect(exec.argv.length).toBe(2);
    expect(exec.argv[0]).toBe(bundledNode);
    expect(exec.argv[1]).toBe(bundledNpmCli);
  });
});

describe("electron-bundled strategy: node chain", () => {
  const RESOURCES_UNIX = "/Applications/PI-Dashboard.app/Contents/Resources";
  const RESOURCES_WIN = "C:\\Program Files\\PI Dashboard\\resources";

  it("unix: resolves node to <resources>/node/bin/node", () => {
    const bundledNode = path.join(RESOURCES_UNIX, "node", "bin", "node");
    const r = freshRegistry({
      platform: "linux",
      exists: (p) => p === bundledNode,
      resourcesPath: () => RESOURCES_UNIX,
    });
    const res = r.resolve("node");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(bundledNode);
    expect(res.source).toBe("managed");
  });

  it("win32: resolves node to <resources>/node/node.exe", () => {
    const bundledNode = path.join(RESOURCES_WIN, "node", "node.exe");
    const r = freshRegistry({
      platform: "win32",
      exists: (p) => p === bundledNode,
      resourcesPath: () => RESOURCES_WIN,
    });
    const res = r.resolve("node");
    expect(res.ok).toBe(true);
    expect(res.path).toBe(bundledNode);
    expect(res.source).toBe("managed");
  });
});

describe("electron-bundled strategy: chain ordering", () => {
  it("npm chain order on unix is override \u2192 managed \u2192 electron-bundled \u2192 where", () => {
    // Force every strategy to fail so we can inspect the full tried[] trail.
    const r = freshRegistry({
      platform: "linux",
      exists: () => false,
      which: () => null,
      resourcesPath: () => "/fake/resources",
    });
    const res = r.resolve("npm");
    expect(res.ok).toBe(false);
    const names = res.tried.map((t) => t.strategy);
    // We don't assert exact length (the chain may include other strategies
    // we haven't named here) but the relative order MUST be:
    //   override < managed < electron-bundled < where (system)
    const idxOverride = names.indexOf("override");
    const idxManaged = names.indexOf("managed");
    const idxElectron = names.indexOf("electron-bundled");
    const idxWhere = names.indexOf("where");
    expect(idxOverride).toBeGreaterThanOrEqual(0);
    expect(idxManaged).toBeGreaterThan(idxOverride);
    expect(idxElectron).toBeGreaterThan(idxManaged);
    expect(idxWhere).toBeGreaterThan(idxElectron);
  });

  it("node chain order on unix is override \u2192 managed \u2192 electron-bundled \u2192 where", () => {
    const r = freshRegistry({
      platform: "linux",
      exists: () => false,
      which: () => null,
      resourcesPath: () => "/fake/resources",
    });
    const res = r.resolve("node");
    expect(res.ok).toBe(false);
    const names = res.tried.map((t) => t.strategy);
    const idxOverride = names.indexOf("override");
    const idxManaged = names.indexOf("managed");
    const idxElectron = names.indexOf("electron-bundled");
    expect(idxOverride).toBeGreaterThanOrEqual(0);
    expect(idxManaged).toBeGreaterThan(idxOverride);
    expect(idxElectron).toBeGreaterThan(idxManaged);
  });
});
