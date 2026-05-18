/**
 * Cross-failure regression checkpoint test.
 *
 * Each of Failures 1\u20135 in streamline-electron-bootstrap-and-recovery has its
 * own focused unit test under the corresponding sub-group. This file asserts
 * the *wiring* between them \u2014 i.e. the contracts visible at module
 * boundaries that someone could break in one PR without noticing the
 * cross-failure interaction.
 *
 * Strategy: real-fs simulation in a tmp dir for the parts that exchange
 * paths (paths, managed-dir layout, log-file site); no spawning of real
 * processes. Each `it` pins ONE checkpoint that a clean-install path must
 * satisfy.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getDashboardServerLogPath,
  getInstallerLogPath,
  getManagedDir,
  getDashboardConfigDir,
} from "@blackbelt-technology/pi-dashboard-shared/dashboard-paths.js";
import {
  materializeWorkspaceSymlinks,
  BUNDLED_WORKSPACE_PKGS,
} from "@blackbelt-technology/pi-dashboard-shared/managed-workspace-materialize.js";
import { resolveManagedDirRoot } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import { isDashboardRunning } from "@blackbelt-technology/pi-dashboard-shared/server-identity.js";
import {
  makeServerWatchdog,
  isGracefulShutdownInProgress,
  setGracefulShutdownInProgress,
} from "../lib/server-lifecycle.js";

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "clean-install-smoke-"));
  process.env.HOME = tmpHome;
});
afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("clean-install regression checkpoints", () => {
  it("Failure 3: dashboard server log + installer log are distinct paths", () => {
    const serverLog = getDashboardServerLogPath();
    const installerLog = getInstallerLogPath();
    expect(serverLog).not.toBe(installerLog);
    expect(serverLog).toContain(path.join(".pi", "dashboard"));
    expect(installerLog).toContain(".pi-dashboard");
    expect(getDashboardConfigDir()).toBe(path.dirname(serverLog));
    expect(getManagedDir()).toBe(path.dirname(installerLog));
  });

  it("Failure 1: scope-dir wipe is recoverable from `<managed>/packages/` sources", () => {
    const managed = getManagedDir();
    // Seed workspace sources.
    const sources: Array<[string, string]> = [
      ["shared", "pi-dashboard-shared"],
      ["server", "pi-dashboard-server"],
      ["extension", "pi-dashboard-extension"],
      ["dashboard-plugin-runtime", "dashboard-plugin-runtime"],
    ];
    for (const [short, name] of sources) {
      const dir = path.join(managed, "packages", short);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name, version: "0.0.1-test" }),
      );
    }
    // Seed bundled client.
    const clientDir = path.join(managed, "packages", "dist", "client");
    fs.mkdirSync(clientDir, { recursive: true });
    fs.writeFileSync(path.join(clientDir, "index.html"), "<html></html>");
    fs.mkdirSync(path.join(managed, "packages", "client"), { recursive: true });
    fs.writeFileSync(
      path.join(managed, "packages", "client", "package.json"),
      JSON.stringify({ name: "@blackbelt-technology/pi-dashboard-web" }),
    );
    // Simulate the wipe (scope-dir absent).
    const result = materializeWorkspaceSymlinks(managed);
    expect(result.errors).toEqual({});
    for (const name of BUNDLED_WORKSPACE_PKGS) {
      expect(result.materialized).toContain(name);
    }
  });

  it("Failure 2: client static-file resolution finds the managed-dir layout", () => {
    const managed = getManagedDir();
    fs.mkdirSync(managed, { recursive: true });
    fs.writeFileSync(path.join(managed, ".version"), "1.0.0\n");

    const clientDir = path.join(managed, "packages", "dist", "client");
    fs.mkdirSync(clientDir, { recursive: true });
    fs.writeFileSync(path.join(clientDir, "index.html"), "<html></html>");

    // Simulate the server's __dirname deep under the managed dir.
    const serverDir = path.join(
      managed,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-server",
      "src",
    );
    fs.mkdirSync(serverDir, { recursive: true });

    // resolveManagedDirRoot is the foundation of strategy #6 in
    // `resolveClientDir`. The full chain is exercised in the server-package
    // `static-client-resolution.test.ts`; here we just pin the cross-package
    // wiring boundary.
    expect(resolveManagedDirRoot(serverDir)).toBe(managed);
    expect(fs.existsSync(path.join(managed, "packages", "dist", "client", "index.html"))).toBe(true);
  });

  it("Failure 4: isDashboardRunning honors opts (legacy single-shot still works)", async () => {
    // Probe a closed port. Default (no opts) returns running:false quickly.
    const result = await isDashboardRunning(1, "127.0.0.1");
    expect(result.running).toBe(false);
  });

  it("Failure 5: watchdog routes crash unless graceful flag is set", () => {
    const crashes: number[] = [];
    const watchdog = makeServerWatchdog({
      isGraceful: () => false,
      log: () => {},
      onCrash: (c) => crashes.push(c ?? -1),
    });
    watchdog(137, "SIGSEGV");
    expect(crashes).toEqual([137]);

    setGracefulShutdownInProgress(true);
    const watchdog2 = makeServerWatchdog({
      isGraceful: isGracefulShutdownInProgress,
      log: () => {},
      onCrash: (c) => crashes.push(c ?? -1),
    });
    watchdog2(0, null);
    expect(crashes).toEqual([137]); // unchanged.
    setGracefulShutdownInProgress(false);
  });
});
