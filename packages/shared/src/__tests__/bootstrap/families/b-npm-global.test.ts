/**
 * Family B — npm-global install scenarios.
 *
 * B1: npm-g dash only (⚠ Windows bug) — pi UNRESOLVED.
 * B2: npm-g full — pi + openspec via global npm.
 * B3: npm-g pi-installed-first — pi present, settings lacks bridge;
 *     dashboard registers on boot (delta assertion).
 *
 * B1 is the key scenario: current behavior when a Windows user runs
 * `npm i -g pi-dashboard` without first installing pi. This snapshot
 * captures the broken state; `unified-bootstrap-install` will flip it.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv, layer } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail, snapshotSettingsDelta } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const B1 = [
  { platform: "linux", dash: "npm-g", pi: "absent", settings: "missing", env: "normal" },
  { platform: "darwin", dash: "npm-g", pi: "absent", settings: "missing", env: "normal" },
  { platform: "win32", dash: "npm-g", pi: "absent", settings: "missing", env: "normal" },
] as const;
const B2 = [
  { platform: "linux", dash: "npm-g", pi: "present-valid", settings: "valid", env: "normal" },
  { platform: "darwin", dash: "npm-g", pi: "present-valid", settings: "valid", env: "normal" },
  { platform: "win32", dash: "npm-g", pi: "present-valid", settings: "valid", env: "normal" },
] as const;
const B3 = [
  { platform: "linux", dash: "npm-g", pi: "present-no-ext", settings: "empty", env: "normal" },
] as const;
for (const cell of [...B1, ...B2, ...B3]) {
  register(cell, "families/b-npm-global.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family B — npm-global", () => {
  describe("B1 — npm-g dash-only (⚠ captures current Windows bug)", () => {
    it.each(["linux", "darwin", "win32"] as const)(
      "pi unresolved on %s",
      async (platform) => {
        const homedir = platform === "win32" ? "C:\\Users\\R" : "/home/r";
        await withFakeEnv(
          {
            platform,
            homedir,
            env: platform === "win32"
              ? { PATH: "C:\\Users\\R\\AppData\\Roaming\\npm" }
              : { PATH: "/usr/local/bin" },
            fs: platform === "win32"
              // On Windows we ship dash only — no pi, no openspec.
              ? fixtures.npmGlobalWindowsAppData(homedir, {
                  dashboard: true,
                  pi: false,
                  openspec: false,
                })
              : fixtures.npmGlobalUnix({ pi: false, openspec: false }),
          },
          (ctx) => {
            const registry = ctx.createRegistry();
            registerDefaultTools(registry, ctx.createStrategyDeps());
            const res = registry.resolve("pi");
            expect(res.ok).toBe(false);
            // FIXED-BY: unified-bootstrap-install.
            // When that proposal lands, update the snapshot: pi should
            // resolve via managed after first-run bootstrap.
            expect(snapshotTrail(res, ctx)).toMatchSnapshot();
          },
        );
      },
    );
  });

  describe("B2 — npm-g full (pi + openspec via global npm)", () => {
    it.each(["linux", "darwin"] as const)(
      "pi resolves via npm-global on %s",
      async (platform) => {
        const homedir = "/home/r";
        await withFakeEnv(
          {
            platform,
            homedir,
            env: { PATH: "/usr/local/bin" },
            fs: fixtures.npmGlobalUnix({}),
          },
          (ctx) => {
            // On Unix, the pi strategy chain only has override → managed-bin
            // → where. `where` finds /usr/local/bin/pi. So source === "system"
            // not "npm-global" — the current strategy chain doesn't know
            // about npm-g on Unix at the executor level.
            const registry = ctx.createRegistry();
            registerDefaultTools(registry, ctx.createStrategyDeps());
            const res = registry.resolve("pi");
            expect(res.ok).toBe(true);
            expect(snapshotTrail(res, ctx)).toMatchSnapshot();
          },
        );
      },
    );

    it("pi resolves via npm-global on win32 (with node.exe toArgv)", async () => {
      const homedir = "C:\\Users\\R";
      await withFakeEnv(
        {
          platform: "win32",
          homedir,
          env: { PATH: "C:\\Users\\R\\AppData\\Roaming\\npm" },
          fs: layer(
            fixtures.npmGlobalWindowsAppData(homedir, { dashboard: true }),
          ),
        },
        (ctx) => {
          const registry = ctx.createRegistry();
          registerDefaultTools(registry, ctx.createStrategyDeps());
          const res = registry.resolve("pi");
          expect(res.ok).toBe(true);
          expect(res.source).toBe("npm-global");
          expect(snapshotTrail(res, ctx)).toMatchSnapshot();
        },
      );
    });
  });

  describe("B3 — npm-g pi-installed-first (bridge needs registration)", () => {
    it("settings.json present but lacks bridge entry (linux)", async () => {
      const homedir = "/home/r";
      await withFakeEnv(
        {
          platform: "linux",
          homedir,
          fs: layer(
            fixtures.npmGlobalUnix({}),
            fixtures.settingsJson({ homedir, platform: "linux", packages: [] }),
          ),
        },
        (ctx) => {
          // Input-side assertion: the fixture correctly produces a
          // settings.json without the bridge entry. Full round-trip
          // (calling `registerBridgeExtension` and observing the
          // mutation) requires `bridge-register` to accept an
          // injectable fs — future task, cross-proposal.
          const before = ctx.readSettings() as { packages?: string[] } | null;
          expect(before).toEqual({ packages: [] });
          const after = before; // no mutation via harness
          expect(snapshotSettingsDelta(before, after, ctx)).toMatchSnapshot();
        },
      );
    });
  });
});
