/**
 * Family F — cwd variants.
 *
 * F1: cwd-with-spaces  — cwd contains spaces. Resolution unaffected.
 * F2: cwd-unicode      — cwd contains non-ASCII. Resolution unaffected.
 *
 * Today, cwd is NOT used by any strategy in the chain. Asserting that
 * invariant via snapshots means if someone later adds cwd-sensitive
 * resolution (e.g. workspace-local binaries), the change surfaces
 * loudly in these snapshots.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const F = [
  { platform: "linux", dash: "managed", pi: "present-valid", settings: "empty", env: "spaces-unicode" },
  { platform: "win32", dash: "managed", pi: "present-valid", settings: "empty", env: "spaces-unicode" },
] as const;
for (const cell of F) {
  register(cell, "families/f-cwd-variants.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family F — cwd variants", () => {
  it("F1 — resolves normally with spaces in cwd (linux)", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        cwd: "/home/r/My Project With Spaces",
        fs: fixtures.managedInstall({ homedir, platform: "linux" }),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("managed");
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });

  it("F1 — resolves normally with Program Files (x86) cwd (win32)", async () => {
    const homedir = "C:\\Users\\R";
    await withFakeEnv(
      {
        platform: "win32",
        homedir,
        cwd: "C:\\Program Files (x86)\\Pi Dashboard",
        fs: fixtures.managedInstall({ homedir, platform: "win32" }),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("managed");
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });

  it("F2 — resolves with Greek/Cyrillic/emoji in cwd", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        cwd: "/home/r/πρότζεκτ_тест_🚀",
        fs: fixtures.managedInstall({ homedir, platform: "linux" }),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });
});
