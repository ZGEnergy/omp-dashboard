/**
 * Tests for the dual-write (packages[] + dashboardPluginBridges) and
 * reconciliation behaviour added by change `fix-pi-flows-end-to-end`
 * Group 1.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  registerPluginBridge,
  deregisterPluginBridge,
  reconcilePluginBridgePackages,
  ensurePackageEntry,
  removePackageEntry,
  listManagedPackageOwnership,
} from "../plugin-bridge-register.js";

let tmpDir: string;
let homedir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-bridge-pkg-test-"));
  homedir = tmpDir;
  delete process.env.PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE;
});

function settingsPath() {
  return path.join(homedir, ".omp", "agent", "settings.json");
}

function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(settingsPath(), "utf-8"));
}

function writeSettings(s: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2) + "\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────

describe("ensurePackageEntry / removePackageEntry (pure)", () => {
  it("adds new entry and records ownership", () => {
    const packages: unknown[] = [];
    const ownership: Record<string, string> = {};
    const added = ensurePackageEntry(packages, ownership, "/a", "dashboard-x");
    expect(added).toBe(true);
    expect(packages).toEqual(["/a"]);
    expect(ownership).toEqual({ "/a": "dashboard-x" });
  });

  it("is idempotent (no-op when present)", () => {
    const packages: unknown[] = ["/a"];
    const ownership: Record<string, string> = { "/a": "dashboard-x" };
    const added = ensurePackageEntry(packages, ownership, "/a", "dashboard-x");
    expect(added).toBe(false);
    expect(packages).toEqual(["/a"]);
  });

  it("records ownership for pre-existing user entry without duplicating", () => {
    const packages: unknown[] = ["/a"]; // user added
    const ownership: Record<string, string> = {};
    const added = ensurePackageEntry(packages, ownership, "/a", "dashboard-x");
    expect(added).toBe(false);
    expect(packages).toEqual(["/a"]);
    expect(ownership).toEqual({ "/a": "dashboard-x" });
  });

  it("removes only owned entries; leaves user entries", () => {
    const packages: unknown[] = ["/user", "/a"];
    const ownership: Record<string, string> = { "/a": "dashboard-x" };
    const removed = removePackageEntry(packages, ownership, "dashboard-x");
    expect(removed).toBe(true);
    expect(packages).toEqual(["/user"]);
    expect(ownership).toEqual({});
  });

  it("multi-owner round trip", () => {
    const packages: unknown[] = [];
    const ownership: Record<string, string> = {};
    ensurePackageEntry(packages, ownership, "/a", "dashboard-x");
    ensurePackageEntry(packages, ownership, "/b", "dashboard-y");
    expect(packages).toEqual(["/a", "/b"]);
    removePackageEntry(packages, ownership, "dashboard-x");
    expect(packages).toEqual(["/b"]);
    expect(ownership).toEqual({ "/b": "dashboard-y" });
  });

  it("handles object-form PackageSource entries", () => {
    const packages: unknown[] = [{ source: "/a" }];
    const ownership: Record<string, string> = {};
    const added = ensurePackageEntry(packages, ownership, "/a", "dashboard-x");
    expect(added).toBe(false);
    expect(packages).toEqual([{ source: "/a" }]);
    expect(ownership).toEqual({ "/a": "dashboard-x" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Dual-write end-to-end
// ─────────────────────────────────────────────────────────────────────────

describe("registerPluginBridge dual-write", () => {
  it("writes both dashboardPluginBridges AND packages[] entries", () => {
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    const s = readSettings();
    expect((s.dashboardPluginBridges as Record<string, string>)["dashboard-demo"]).toBe(
      "/abs/bridge.js",
    );
    expect(s.packages).toContain("/abs/bridge.js");
    expect(
      (s._dashboardManagedPackages as Record<string, string>)["/abs/bridge.js"],
    ).toBe("dashboard-demo");
  });

  it("env escape hatch skips packages[] write", () => {
    process.env.PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE = "1";
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    const s = readSettings();
    expect((s.dashboardPluginBridges as Record<string, string>)["dashboard-demo"]).toBe(
      "/abs/bridge.js",
    );
    expect(s.packages ?? []).not.toContain("/abs/bridge.js");
  });

  it("idempotent across repeated registration", () => {
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    const s = readSettings();
    const pkgs = s.packages as unknown[];
    expect(pkgs.filter((e) => e === "/abs/bridge.js")).toHaveLength(1);
  });

  it("preserves user-added packages entry on conflict-free re-register", () => {
    writeSettings({ packages: ["/user/pkg"] });
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    const s = readSettings();
    expect(s.packages).toEqual(["/user/pkg", "/abs/bridge.js"]);
  });
});

describe("deregisterPluginBridge dual-remove", () => {
  it("removes both dashboardPluginBridges AND packages[] entries; keeps user entries", () => {
    writeSettings({ packages: ["/user/pkg"] });
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    deregisterPluginBridge("demo", { homedir });
    const s = readSettings();
    expect((s.dashboardPluginBridges as Record<string, string>)["dashboard-demo"]).toBeUndefined();
    expect(s.packages).toEqual(["/user/pkg"]);
    expect((s._dashboardManagedPackages as Record<string, string>)["/abs/bridge.js"]).toBeUndefined();
  });

  it("no-op when plugin never registered", () => {
    writeSettings({ packages: ["/user/pkg"] });
    deregisterPluginBridge("ghost", { homedir });
    const s = readSettings();
    expect(s.packages).toEqual(["/user/pkg"]);
  });
});

describe("reconcilePluginBridgePackages", () => {
  it("adds missing packages[] entry for pre-existing dashboardPluginBridges key", () => {
    writeSettings({
      dashboardPluginBridges: { "dashboard-demo": "/abs/bridge.js" },
      packages: ["/user/pkg"],
    });
    const summary = reconcilePluginBridgePackages({ homedir });
    expect(summary).toEqual([
      { pluginId: "demo", bridgePath: "/abs/bridge.js", action: "added" },
    ]);
    const s = readSettings();
    expect(s.packages).toContain("/abs/bridge.js");
    expect(
      (s._dashboardManagedPackages as Record<string, string>)["/abs/bridge.js"],
    ).toBe("dashboard-demo");
  });

  it("is idempotent — second run produces no mutation", () => {
    writeSettings({
      dashboardPluginBridges: { "dashboard-demo": "/abs/bridge.js" },
    });
    reconcilePluginBridgePackages({ homedir });
    const summary = reconcilePluginBridgePackages({ homedir });
    expect(summary).toEqual([
      { pluginId: "demo", bridgePath: "/abs/bridge.js", action: "already" },
    ]);
  });

  it("env escape hatch produces empty summary and no writes", () => {
    process.env.PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE = "1";
    writeSettings({
      dashboardPluginBridges: { "dashboard-demo": "/abs/bridge.js" },
    });
    const summary = reconcilePluginBridgePackages({ homedir });
    expect(summary).toEqual([]);
    const s = readSettings();
    expect(s.packages ?? []).not.toContain("/abs/bridge.js");
  });

  it("preserves user packages while reconciling multiple managed bridges", () => {
    writeSettings({
      dashboardPluginBridges: {
        "dashboard-x": "/abs/x.js",
        "dashboard-y": "/abs/y.js",
      },
      packages: ["/user/a", { source: "/user/b" }],
    });
    reconcilePluginBridgePackages({ homedir });
    const s = readSettings();
    expect(s.packages).toEqual(["/user/a", { source: "/user/b" }, "/abs/x.js", "/abs/y.js"]);
  });
});

describe("listManagedPackageOwnership", () => {
  it("returns empty map when nothing registered", () => {
    expect(listManagedPackageOwnership({ homedir })).toEqual({});
  });

  it("returns ownership map after dual-write registration", () => {
    registerPluginBridge("demo", "/abs/bridge.js", { homedir });
    expect(listManagedPackageOwnership({ homedir })).toEqual({
      "/abs/bridge.js": "dashboard-demo",
    });
  });
});
