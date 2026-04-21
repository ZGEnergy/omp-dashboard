/**
 * Family J — minimal PATH (GUI-launched processes).
 *
 * J1: path-gui-minimal — PATH contains only /usr/bin (no /usr/local/bin,
 *     no ~/.npm). Typical of GUI-launched processes on macOS/Linux.
 *     Resolution should still succeed via npm-global strategy, which
 *     uses `npm root -g` not PATH.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const J = [
  // Use "absent" dash axis — the dashboard itself isn't relevant; we
  // only care about pi resolution.
  { platform: "linux", dash: "absent", pi: "present-valid", settings: "empty", env: "normal" },
] as const;
for (const cell of J) {
  register(cell, "families/j-path-gui-minimal.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family J — minimal PATH", () => {
  it("J1 — GUI-launched minimal PATH: pi does NOT resolve on posix (limitation)", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        // The minimal PATH a macOS GUI-launched app sees by default.
        env: { PATH: "/usr/bin" },
        // pi + openspec live in /usr/local/bin, NOT in PATH.
        fs: fixtures.npmGlobalUnix({
          root: "/usr/lib/node_modules",
          binDir: "/usr/local/bin",
        }),
        npmRootGlobal: "/usr/lib/node_modules",
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        // On Unix, the pi chain is override → managed-bin → where.
        // npm-g strategy is NOT in the Unix pi chain; with PATH missing
        // `/usr/local/bin`, `where` can't find pi either. This is a
        // real limitation worth locking in via snapshot — if a future
        // change adds npm-g to the Unix pi chain, this test surfaces
        // it loudly.
        expect(res.ok).toBe(false);
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();

        // Same limitation for openspec on Unix.
        const os = registry.resolve("openspec");
        expect(os.ok).toBe(false);
      },
    );
  });
});
