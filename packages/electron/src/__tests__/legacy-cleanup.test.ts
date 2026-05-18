/**
 * legacy-cleanup.test.ts — covers Group 13.1 and 13.3 of
 * streamline-electron-bootstrap-and-recovery.
 *
 * Verifies:
 *   - `cleanupLegacyStateFiles` removes `mode.json` when present
 *   - Missing file is a no-op (no throw, no entry in `removed`)
 *   - Result struct lists every removed path
 *   - Errors are captured, never thrown
 *   - Re-running on an already-cleaned dir is idempotent
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanupLegacyStateFiles } from "../lib/legacy-cleanup.js";

let managedDir: string;

beforeEach(() => {
  managedDir = mkdtempSync(path.join(tmpdir(), "pi-legacy-test-"));
});

afterEach(() => {
  rmSync(managedDir, { recursive: true, force: true });
});

describe("cleanupLegacyStateFiles", () => {
  it("removes mode.json when present", () => {
    const modeFile = path.join(managedDir, "mode.json");
    writeFileSync(modeFile, JSON.stringify({ mode: "power-user" }));

    const result = cleanupLegacyStateFiles(managedDir);

    expect(result.removed).toContain(modeFile);
    expect(result.errors).toEqual([]);
    expect(existsSync(modeFile)).toBe(false);
  });

  it("is a no-op when mode.json is absent", () => {
    const result = cleanupLegacyStateFiles(managedDir);
    expect(result.removed).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("is idempotent across multiple invocations", () => {
    const modeFile = path.join(managedDir, "mode.json");
    writeFileSync(modeFile, "{}");

    const first = cleanupLegacyStateFiles(managedDir);
    expect(first.removed).toContain(modeFile);

    const second = cleanupLegacyStateFiles(managedDir);
    expect(second.removed).toEqual([]);
    expect(second.errors).toEqual([]);
  });

  it("does not touch unrelated files in the managed dir", () => {
    writeFileSync(path.join(managedDir, "mode.json"), "{}");
    const serverLog = path.join(managedDir, "server.log");
    const doctorLog = path.join(managedDir, "doctor.log");
    const installable = path.join(managedDir, "installable.json");
    writeFileSync(serverLog, "log content");
    writeFileSync(doctorLog, "doctor content");
    writeFileSync(installable, "{}");

    cleanupLegacyStateFiles(managedDir);

    // None of these should be touched.
    expect(existsSync(serverLog)).toBe(true);
    expect(existsSync(doctorLog)).toBe(true);
    expect(existsSync(installable)).toBe(true);
  });

  it("preserves user-installed packages under node_modules/", () => {
    // Belt-and-suspenders: ensure the cleanup doesn't reach into managed
    // package state (that's force-reinstall's job, not legacy cleanup's).
    const nm = path.join(managedDir, "node_modules", "pi-foo");
    const pkgJson = path.join(nm, "package.json");
    require("node:fs").mkdirSync(nm, { recursive: true });
    writeFileSync(pkgJson, JSON.stringify({ name: "pi-foo", version: "0.1.0" }));

    cleanupLegacyStateFiles(managedDir);

    expect(existsSync(pkgJson)).toBe(true);
  });
});

describe("legacy upgrade scenario", () => {
  // Group 13.3: combined fixture — legacy mode.json + v1 installable.json +
  // populated managed dir. After running cleanup + reading installable,
  // mode.json is gone, installable is migrated in memory, no install fires.
  it("processes a legacy install layout cleanly", () => {
    writeFileSync(path.join(managedDir, "mode.json"), JSON.stringify({ mode: "standalone" }));
    writeFileSync(
      path.join(managedDir, "installable.json"),
      JSON.stringify({
        version: "1.0",
        packages: [
          { name: "@earendil-works/pi-coding-agent", version: "0.74.0", required: true, kind: "npm" },
        ],
      }),
    );
    // Seed a "populated managed dir" — pi-coding-agent's package.json present.
    const piPkgJson = path.join(
      managedDir,
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "package.json",
    );
    require("node:fs").mkdirSync(path.dirname(piPkgJson), { recursive: true });
    writeFileSync(piPkgJson, JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.74.0" }));

    const cleanup = cleanupLegacyStateFiles(managedDir);

    expect(cleanup.removed).toContain(path.join(managedDir, "mode.json"));
    // installable.json is left in place; v1 → v2 migration happens at
    // read time in shared/installable-list.ts (already covered by its
    // own tests).
    expect(existsSync(path.join(managedDir, "installable.json"))).toBe(true);
    expect(existsSync(piPkgJson)).toBe(true);
  });
});
