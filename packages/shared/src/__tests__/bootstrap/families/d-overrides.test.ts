/**
 * Family D — overrides.
 *
 * D1: override-valid   — pi resolves via override, source = "override".
 * D2: override-invalid — broken path; falls through to next strategy.
 *
 * Overrides override platform. We test on linux; Windows is covered
 * structurally because overrideStrategy is first in every chain.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

// Overrides are orthogonal to the cube's pi-state axis — treat as
// "present-valid" scenarios for taxonomy purposes.
const D = [
  { platform: "linux", dash: "managed", pi: "present-valid", settings: "empty", env: "normal" },
  { platform: "darwin", dash: "managed", pi: "present-valid", settings: "empty", env: "normal" },
] as const;
for (const cell of D) {
  register(cell, "families/d-overrides.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family D — overrides", () => {
  it("D1 — override-valid: pi resolves via override", async () => {
    const homedir = "/home/r";
    const overridePath = "/opt/custom/bin/pi";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        fs: {
          [overridePath]: "#!/bin/sh\nexec custom-pi",
          // Also managed, to prove override wins.
          ...fixtures.managedInstall({ homedir, platform: "linux" }),
        },
        overrides: { pi: overridePath },
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("override");
        expect(res.path).toBe(overridePath);
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });

  it("D2 — override-invalid: path doesn't exist, chain falls through", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        fs: fixtures.managedInstall({ homedir, platform: "linux" }),
        overrides: { pi: "/nonexistent/broken/pi" },
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        // Override strategy returns `invalid: ...` as reason; next
        // strategy (managed-bin) succeeds.
        expect(res.ok).toBe(true);
        expect(res.source).toBe("managed");
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });
});
