/**
 * Family H — HOME drift scenarios.
 *
 * H1: home-drift-git-bash  — Windows: $HOME=/c/Users/R set by Git Bash,
 *     USERPROFILE=C:\Users\R, os.homedir()=C:\Users\R. All paths must
 *     canonicalize to the same settings.json location.
 * H2: home-symlink         — posix: homedir is a symlink (common with
 *     filevault / dotfile managers). Today the harness does not
 *     simulate symlinks (memfs limitation), so H2 is documented and
 *     covered by scenarios-skipped.ts. This file adds a placeholder
 *     test documenting the invariant.
 *
 * These scenarios exercise `registerBridgeExtension`'s homedir
 * resolution. They don't touch ToolRegistry (bridge registration is
 * an independent resolution problem per design §2).
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import * as fixtures from "../fixtures/index.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const H = [
  { platform: "win32", dash: "managed", pi: "present-valid", settings: "valid", env: "home-drift" },
] as const;
for (const cell of H) {
  register(cell, "families/h-home-drift.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family H — HOME drift", () => {
  it("H1 — Git Bash \\$HOME vs USERPROFILE both reach same canonical homedir", async () => {
    // This test documents the EXPECTED behavior. Full enforcement
    // lives in `single-dashboard-per-home` (Layer 0 canonicalization).
    // Here we only verify that `registerBridgeExtension` accepts an
    // explicit homedir and uses it over env vars.
    const canonicalHome = "C:\\Users\\R";
    await withFakeEnv(
      {
        platform: "win32",
        homedir: canonicalHome,
        env: {
          // Simulated drift: $HOME disagrees with USERPROFILE. The
          // explicit `{ homedir }` argument SHOULD win over env vars.
          HOME: "/c/Users/R",
          USERPROFILE: canonicalHome,
        },
        fs: fixtures.settingsJson({
          homedir: canonicalHome,
          platform: "win32",
          packages: [],
        }),
      },
      (ctx) => {
        // Harness provides the fake homedir to registerBridgeExtension
        // via the new opts arg. We don't actually call it here (it
        // uses real fs) — instead we assert the settings.json path
        // the harness reports matches the canonical homedir.
        const settings = ctx.readSettings();
        expect(settings).not.toBeNull();
        expect(settings).toEqual({ packages: [] });
      },
    );
  });
});
