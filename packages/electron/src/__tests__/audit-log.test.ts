/**
 * Tests for the managed-install audit log.
 *
 * Group 14.5 of streamline-electron-bootstrap-and-recovery requires every
 * reinstall / force-reinstall code path to write a single structured entry
 * to `~/.pi-dashboard/doctor.log`. This file pins the writer's contract
 * (JSONL, append, never-throws); call-site coverage is exercised by the
 * surrounding recovery-ipc and wizard-ipc tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeAuditEntry, getAuditLogPath } from "../lib/audit-log.js";

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "audit-log-"));
  process.env.HOME = tmpHome;
});
afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("writeAuditEntry", () => {
  it("writes a JSONL entry to ~/.pi-dashboard/doctor.log", () => {
    writeAuditEntry({
      operation: "wizard.install",
      packages: ["pi-coding-agent", "openspec"],
      outcome: "ok",
    });

    const logPath = getAuditLogPath();
    expect(logPath.endsWith(path.join(".pi-dashboard", "doctor.log"))).toBe(true);
    expect(fs.existsSync(logPath)).toBe(true);

    const raw = fs.readFileSync(logPath, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);

    const lines = raw.trim().split("\n");
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.operation).toBe("wizard.install");
    expect(entry.packages).toEqual(["pi-coding-agent", "openspec"]);
    expect(entry.outcome).toBe("ok");
    expect(typeof entry.ts).toBe("string");
    // ISO 8601 UTC.
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("appends one entry per call (does not truncate)", () => {
    writeAuditEntry({ operation: "wizard.install", packages: [], outcome: "ok" });
    writeAuditEntry({ operation: "doctor.force-reinstall", packages: [], outcome: "cancelled" });
    writeAuditEntry({ operation: "preflight.reinstall", packages: ["x"], outcome: "failed", error: "boom" });

    const lines = fs.readFileSync(getAuditLogPath(), "utf-8").trim().split("\n");
    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0]!).operation).toBe("wizard.install");
    expect(JSON.parse(lines[1]!).operation).toBe("doctor.force-reinstall");
    expect(JSON.parse(lines[1]!).outcome).toBe("cancelled");
    expect(JSON.parse(lines[2]!).error).toBe("boom");
  });

  it("creates the parent directory if absent", () => {
    // Wipe ~/.pi-dashboard/ entirely to verify mkdir is recursive.
    fs.rmSync(path.join(tmpHome, ".pi-dashboard"), { recursive: true, force: true });
    expect(fs.existsSync(path.join(tmpHome, ".pi-dashboard"))).toBe(false);

    writeAuditEntry({ operation: "wizard.install", packages: [], outcome: "ok" });

    expect(fs.existsSync(getAuditLogPath())).toBe(true);
  });

  it("returns the written entry (with ts) so callers can echo it", () => {
    const result = writeAuditEntry({
      operation: "loading-page.reinstall",
      packages: ["a"],
      outcome: "ok",
    });
    expect(result.ts).toBeTruthy();
    expect(result.operation).toBe("loading-page.reinstall");
  });

  it("never throws on filesystem failure", () => {
    // Point HOME at a path that cannot be written to. We can't easily make
    // mkdirSync fail cross-platform in a tmp dir, so simulate via a
    // pre-existing FILE where the .pi-dashboard directory should be.
    const dashboardPath = path.join(tmpHome, ".pi-dashboard");
    fs.rmSync(dashboardPath, { recursive: true, force: true });
    fs.writeFileSync(dashboardPath, "not a directory");

    // mkdirSync(recursive:true) on top of an existing FILE throws ENOTDIR.
    expect(() =>
      writeAuditEntry({
        operation: "wizard.install",
        packages: [],
        outcome: "ok",
      }),
    ).not.toThrow();
  });
});
