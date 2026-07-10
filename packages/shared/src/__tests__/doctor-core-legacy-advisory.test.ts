/**
 * Legacy `~/.omp-dashboard/` advisory — exercises the row emitted by
 * `runSharedChecks(...)` via the `detectLegacyManagedDir` test seam.
 *
 * Contract:
 *   - absent  → no row with name "Legacy install directory"
 *   - present → exactly one row, status "warning", with path / pkgCount / sizeMb
 *
 * Also asserts the obsolete "Managed install (~/.omp-dashboard)" row
 * (deleted under change: fix-doctor-stale-managed-install-check) does
 * not reappear in either branch.
 *
 * See change: fix-doctor-stale-managed-install-check.
 */
import { describe, it, expect } from "vitest";
import os from "node:os";
import {
  runSharedChecks,
  type DoctorCheck,
  type SharedChecksDeps,
} from "../doctor-core.js";

function baseDeps(overrides: Partial<SharedChecksDeps> = {}): SharedChecksDeps {
  return {
    managedDir: os.tmpdir(),
    detectSystemNode: () => ({ found: true, path: "/usr/bin/node" }),
    detectPi: () => ({ found: true, path: "/usr/bin/pi", source: "system" }),
    detectOpenSpec: () => ({ found: true, path: "/usr/bin/openspec", source: "system" }),
    dnsLookup: async () => undefined,
    ...overrides,
  };
}

const ROW = "Legacy install directory";
const STALE_ROW = "Managed install (~/.omp-dashboard)";

function rows(checks: DoctorCheck[], name: string): DoctorCheck[] {
  return checks.filter((c) => c.name === name);
}

describe("legacy ~/.omp-dashboard advisory", () => {
  it("emits no row when the directory is absent", async () => {
    const checks = await runSharedChecks(
      baseDeps({ detectLegacyManagedDir: () => ({ present: false }) }),
    );
    expect(rows(checks, ROW)).toHaveLength(0);
    // Sanity: the deleted stale row stays gone too.
    expect(rows(checks, STALE_ROW)).toHaveLength(0);
  });

  it("emits exactly one warning row when the directory is present", async () => {
    const checks = await runSharedChecks(
      baseDeps({
        detectLegacyManagedDir: () => ({
          present: true,
          path: "/fake/home/.omp-dashboard",
          pkgCount: 4,
          sizeMb: 42,
        }),
      }),
    );
    const found = rows(checks, ROW);
    expect(found).toHaveLength(1);
    const row = found[0]!;
    expect(row.status).toBe("warning");
    expect(row.section).toBe("diagnostics");
    expect(row.message).toContain("/fake/home/.omp-dashboard");
    expect(row.message).toContain("Safe to delete");
    expect(row.detail).toContain("4 packages");
    expect(row.detail).toContain("42 MB");
    expect(row.suggestion).toContain("rm -rf /fake/home/.omp-dashboard");
    // Stale row never appears even in the present branch.
    expect(rows(checks, STALE_ROW)).toHaveLength(0);
  });

  it("does not throw when the detector itself throws", async () => {
    const checks = await runSharedChecks(
      baseDeps({
        detectLegacyManagedDir: () => {
          throw new Error("simulated detector failure");
        },
      }),
    );
    // Advisory is best-effort; the rest of the report still renders and
    // the legacy row is simply absent.
    expect(rows(checks, ROW)).toHaveLength(0);
  });
});
