/**
 * Cube sweep — the fail-closed invariant. Every cell must be either
 * registered (by a family-test file) or explicitly skipped (in
 * `scenarios-skipped.ts`).
 *
 * New cells added to the enumeration — by extending PLATFORMS,
 * DASH_LOCATIONS, PI_STATES, SETTINGS_STATES, or ENV_STATES in
 * `scenarios.ts` — will break this test until a decision is made.
 * This is intentional: the test forces every install mechanic to
 * be categorized.
 */
import { describe, expect, it } from "vitest";
import { sweepCube, formatUnclassifiedError } from "./cube.js";
// IMPORTANT: import the skip manifest BEFORE any family-test file, so
// the bulk skips are applied first and families override them via
// `register()`.
import "./scenarios-skipped.js";
// Then import family files so their top-level `register(cell, tag)`
// calls execute. Each family file clears the corresponding skip entry.
import "./families/index.js";

describe("bootstrap scenario cube", () => {
  it("every cell is either registered or skipped (fail-closed)", () => {
    const report = sweepCube();
    if (report.unclassified.length > 0) {
      throw new Error(formatUnclassifiedError(report));
    }
    expect(report.unclassified.length).toBe(0);
  });

  it("cube has the expected shape (3 × 5 × 6 × 4 × 3 = 1080 cells)", () => {
    const report = sweepCube();
    expect(report.total).toBe(1080);
    expect(report.registered + report.skipped).toBe(report.total);
  });

  it("at least one family registered a cell (smoke)", () => {
    const report = sweepCube();
    expect(report.registered).toBeGreaterThan(0);
    // Visible in test output so cube growth is trackable without
    // digging into internals.
    // eslint-disable-next-line no-console
    console.log(
      `[cube] registered=${report.registered} skipped=${report.skipped} total=${report.total}`,
    );
  });
});
