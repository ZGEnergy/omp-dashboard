/**
 * Family E — stale / partial managed installs.
 *
 * E1: stale-managed   — managed pi version 0.0.1. TODAY the strategies
 *     don't do version gating; resolution succeeds. Snapshot locks in
 *     current behavior so version-skew detection (from proposal 2)
 *     will force a snapshot update.
 * E2: managed-partial — only package.json, no dist/cli.js. Strategy
 *     returns not-found; next strategy runs.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const E1 = [
  // present-stale-ext as cube axis for "installed but bridge registration is stale"
  { platform: "linux", dash: "electron", pi: "present-stale-ext", settings: "valid", env: "normal" },
  { platform: "darwin", dash: "electron", pi: "present-stale-ext", settings: "valid", env: "normal" },
  { platform: "win32", dash: "electron", pi: "present-stale-ext", settings: "valid", env: "normal" },
] as const;
// E2 maps to "malformed" pi-state — the managed install is present but
// broken (incomplete).
const E2 = [
  { platform: "linux", dash: "electron", pi: "malformed", settings: "empty", env: "normal" },
  { platform: "win32", dash: "electron", pi: "malformed", settings: "empty", env: "normal" },
] as const;
for (const cell of [...E1, ...E2]) {
  register(cell, "families/e-stale-partial.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family E — stale / partial", () => {
  describe("E1 — stale managed pi (old version)", () => {
    it.each(["linux", "darwin", "win32"] as const)(
      "current strategies resolve without version gating (%s)",
      async (platform) => {
        const homedir = platform === "win32" ? "C:\\Users\\R" : "/home/r";
        await withFakeEnv(
          {
            platform,
            homedir,
            fs: fixtures.managedInstall({
              homedir,
              platform,
              pi: { version: "0.0.1" }, // very old
            }),
          },
          (ctx) => {
            const registry = ctx.createRegistry();
            registerDefaultTools(registry, ctx.createStrategyDeps());
            const res = registry.resolve("pi");
            expect(res.ok).toBe(true);
            // NOTE: version-skew detection lands in
            // `unified-bootstrap-install` — resolution still
            // succeeds; the detection happens downstream in
            // dependency-detector. Snapshot will shift when that
            // detection is added to trail.
            expect(snapshotTrail(res, ctx)).toMatchSnapshot();
          },
        );
      },
    );
  });

  describe("E2 — partial managed install (package.json, no dist)", () => {
    it.each(["linux", "win32"] as const)(
      "strategy skips when entry file absent (%s)",
      async (platform) => {
        const homedir = platform === "win32" ? "C:\\Users\\R" : "/home/r";
        await withFakeEnv(
          {
            platform,
            homedir,
            fs: fixtures.managedInstall({
              homedir,
              platform,
              piPartial: true, // package.json only, no dist/cli.js, no .bin shim
            }),
          },
          (ctx) => {
            const registry = ctx.createRegistry();
            registerDefaultTools(registry, ctx.createStrategyDeps());
            const res = registry.resolve("pi");
            expect(res.ok).toBe(false);
            expect(snapshotTrail(res, ctx)).toMatchSnapshot();
          },
        );
      },
    );
  });
});
