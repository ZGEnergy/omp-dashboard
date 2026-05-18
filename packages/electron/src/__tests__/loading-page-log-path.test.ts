/**
 * Regression test for Failure 3 of streamline-electron-bootstrap-and-recovery.
 *
 * The loading page's "Server log (last 20 lines)" surfaces stale installer
 * content unless `readServerLogTail` reads from the *dashboard server* log
 * (`~/.pi/dashboard/server.log`) and NOT the legacy installer log
 * (`~/.pi-dashboard/server.log`). This test pins that contract.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readServerLogTail } from "../lib/server-lifecycle.js";
import {
  getDashboardServerLogPath,
  getInstallerLogPath,
} from "@blackbelt-technology/pi-dashboard-shared/dashboard-paths.js";

describe("readServerLogTail (loading-page log path)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pid-log-path-"));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("reads from the dashboard server log path, NOT the installer log path", async () => {
    const serverLog = getDashboardServerLogPath();
    const installerLog = getInstallerLogPath();

    // The two paths must be distinct — that's the whole point of this test.
    expect(serverLog).not.toBe(installerLog);
    expect(serverLog.endsWith(path.join(".pi", "dashboard", "server.log"))).toBe(
      true,
    );
    expect(installerLog.endsWith(path.join(".pi-dashboard", "server.log"))).toBe(
      true,
    );

    fs.mkdirSync(path.dirname(serverLog), { recursive: true });
    fs.mkdirSync(path.dirname(installerLog), { recursive: true });
    fs.writeFileSync(serverLog, "LIVE-SERVER-LINE\n");
    fs.writeFileSync(installerLog, "STALE-INSTALLER-LINE\n");

    const tail = await readServerLogTail(10);
    expect(tail).toContain("LIVE-SERVER-LINE");
    expect(tail).not.toContain("STALE-INSTALLER-LINE");
  });

  it("returns an empty string when the dashboard server log is missing", async () => {
    // Installer log present but server log absent — must NOT fall back.
    const installerLog = getInstallerLogPath();
    fs.mkdirSync(path.dirname(installerLog), { recursive: true });
    fs.writeFileSync(installerLog, "STALE\n");

    const tail = await readServerLogTail(10);
    expect(tail).toBe("");
  });

  it("returns only the trailing N lines requested", async () => {
    const serverLog = getDashboardServerLogPath();
    fs.mkdirSync(path.dirname(serverLog), { recursive: true });
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`).join("\n");
    fs.writeFileSync(serverLog, lines + "\n");

    // readServerLogTail splits on "\n" and slices last N — file ends with a
    // trailing newline, so we request N+1 to get N non-empty lines.
    const tail = await readServerLogTail(6);
    const tailLines = tail.split("\n").filter((l) => l.length > 0);
    expect(tailLines.length).toBe(5);
    expect(tailLines[tailLines.length - 1]).toBe("line-49");
  });
});
