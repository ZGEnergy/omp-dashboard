/**
 * Family K — dashboard absent.
 *
 * K1: no dashboard anywhere; pi present. Registry behaves normally for
 *     pi. The dashboard itself isn't registered in ToolRegistry (it's
 *     the package this code is part of), so "dashboard absent" is
 *     observable only at the dependency-detector level — out of scope
 *     for this family.
 *
 * Kept as a minimal registration + assertion so the cell appears in
 * the cube.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const K = [
  { platform: "linux", dash: "absent", pi: "present-valid", settings: "valid", env: "normal" },
] as const;
for (const cell of K) {
  register(cell, "families/k-dashboard-absent.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family K — dashboard absent", () => {
  it("pi still resolves when no dashboard binary is installed", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        fs: fixtures.managedInstall({ homedir, platform: "linux" }),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("managed");
        // "Dashboard absence" is not observable at the registry level —
        // the dashboard isn't a registered tool. The observation
        // happens at `dependency-detector.ts:detectPiDashboardCli()`
        // via `which pi-dashboard`. Covered by dependency-detector
        // unit tests, not this harness.
      },
    );
  });
});
