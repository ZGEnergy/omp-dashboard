/**
 * Family C — dev monorepo scenarios.
 *
 * C1: mac/linux — bare-import resolves pi via workspace node_modules.
 * C2: win32 — same, plus node.exe toArgv invariant.
 *
 * The bare-import strategy only runs for pi on win32 (see pi's
 * winStrategies in definitions.ts). On Unix, pi on Unix still resolves
 * via managed-bin → where. So the interesting "dev monorepo resolves
 * via bare-import" path is Windows-only today. C1 asserts what Unix
 * actually does (no bare-import in its chain).
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv, layer } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

// C1 posix — dev dash, pi present via workspace; settings typically empty
// at dev time.
const C1 = [
  { platform: "linux", dash: "dev", pi: "present-valid", settings: "empty", env: "normal" },
  { platform: "darwin", dash: "dev", pi: "present-valid", settings: "empty", env: "normal" },
] as const;

// C2 — Windows dev layout is already skipped in scenarios-skipped.ts
// with reason "rare; capture if reported". We still add a test case
// that registers the cell so the bare-import + toArgv invariant is
// locked in — developers on Windows do exist.
const C2 = [
  { platform: "win32", dash: "dev", pi: "present-valid", settings: "empty", env: "normal" },
] as const;

for (const cell of [...C1, ...C2]) {
  register(cell, "families/c-dev-monorepo.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family C — dev monorepo", () => {
  describe("C1 — posix (managed/where chain, no bare-import for pi)", () => {
    it.each(["linux", "darwin"] as const)(
      "pi chain runs on %s",
      async (platform) => {
        const root = "/home/dev/pi-agent-dashboard";
        const homedir = "/home/dev";
        await withFakeEnv(
          {
            platform,
            homedir,
            cwd: root,
            env: { PATH: "/usr/bin" },
            fs: fixtures.devMonorepo({ root, platform }),
          },
          (ctx) => {
            const registry = ctx.createRegistry();
            registerDefaultTools(registry, ctx.createStrategyDeps());
            const res = registry.resolve("pi");
            // Nothing on PATH, nothing in ~/.pi-dashboard — unresolved.
            // The workspace node_modules is only reachable via
            // bare-import, which isn't in pi's Unix chain.
            expect(res.ok).toBe(false);
            expect(snapshotTrail(res, ctx)).toMatchSnapshot();
          },
        );
      },
    );
  });

  describe("C2 — win32 (bare-import from workspace)", () => {
    it("resolves pi via workspace bare-import", async () => {
      const root = "C:\\dev\\pi-agent-dashboard";
      const homedir = "C:\\Users\\Dev";
      await withFakeEnv(
        {
          platform: "win32",
          homedir,
          cwd: root,
          env: { PATH: "C:\\Windows\\System32" },
          fs: layer(fixtures.devMonorepo({ root, platform: "win32" })),
        },
        (ctx) => {
          // Build deps with a resolveModule anchor at the workspace
          // root so bareImportCliStrategy finds pi-coding-agent.
          const baseDeps = ctx.createStrategyDeps();
          const rootAnchor = `${root}\\packages\\shared\\src\\index.ts`;
          const deps = {
            ...baseDeps,
            resolveModule: (id: string, _from: string) =>
              baseDeps.resolveModule(id, rootAnchor),
          };
          const registry = ctx.createRegistry();
          registerDefaultTools(registry, deps);
          const res = registry.resolve("pi");
          expect(res.ok).toBe(true);
          expect(res.source).toBe("bare-import");
          expect(snapshotTrail(res, ctx)).toMatchSnapshot();
        },
      );
    });
  });
});
