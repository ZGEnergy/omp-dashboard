/**
 * Unit tests for `electronBundledRuntimeStrategy` in isolation.
 *
 * Strategy probes `<process.resourcesPath>/node/...` (Electron-bundled
 * Node distribution shipped via `packages/electron/scripts/bundle-server.mjs`).
 * Tests inject `resourcesPath` + `exists` so no real Electron resources
 * or filesystem are touched.
 *
 * See change: fix-electron-wizard-npm-root-enoent.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { electronBundledRuntimeStrategy } from "../tool-registry/strategies.js";
import type { StrategyCtx } from "../tool-registry/types.js";

function ctx(opts: Partial<StrategyCtx> = {}): StrategyCtx {
  return {
    overrides: opts.overrides ?? {},
    platform: opts.platform ?? "linux",
    env: opts.env ?? { homedir: "/fake/home" },
  };
}

describe("electronBundledRuntimeStrategy", () => {
  describe("unix layout", () => {
    const RESOURCES = "/Applications/PI-Dashboard.app/Contents/Resources";

    it("npm: resolves to lib/node_modules/npm/bin/npm-cli.js", () => {
      const expected = path.join(
        RESOURCES,
        "node",
        "lib",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      );
      const s = electronBundledRuntimeStrategy("npm", {
        exists: (p) => p === expected,
        resourcesPath: () => RESOURCES,
      });
      const r = s.run(ctx({ platform: "linux" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.path).toBe(expected);
    });

    it("npm: also works on darwin", () => {
      const expected = path.join(
        RESOURCES,
        "node",
        "lib",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      );
      const s = electronBundledRuntimeStrategy("npm", {
        exists: (p) => p === expected,
        resourcesPath: () => RESOURCES,
      });
      const r = s.run(ctx({ platform: "darwin" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.path).toBe(expected);
    });

    it("node: resolves to bin/node", () => {
      const expected = path.join(RESOURCES, "node", "bin", "node");
      const s = electronBundledRuntimeStrategy("node", {
        exists: (p) => p === expected,
        resourcesPath: () => RESOURCES,
      });
      const r = s.run(ctx({ platform: "linux" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.path).toBe(expected);
    });
  });

  describe("win32 layout", () => {
    const RESOURCES = "C:\\Program Files\\PI Dashboard\\resources";

    it("npm: resolves to node_modules/npm/bin/npm-cli.js (no `lib/` prefix)", () => {
      const expected = path.join(
        RESOURCES,
        "node",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      );
      const s = electronBundledRuntimeStrategy("npm", {
        exists: (p) => p === expected,
        resourcesPath: () => RESOURCES,
      });
      const r = s.run(ctx({ platform: "win32" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.path).toBe(expected);
    });

    it("node: resolves to node.exe (no bin/ prefix)", () => {
      const expected = path.join(RESOURCES, "node", "node.exe");
      const s = electronBundledRuntimeStrategy("node", {
        exists: (p) => p === expected,
        resourcesPath: () => RESOURCES,
      });
      const r = s.run(ctx({ platform: "win32" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.path).toBe(expected);
    });
  });

  describe("non-Electron contexts", () => {
    it("returns clean failure when resourcesPath is null", () => {
      let existsProbed = false;
      const s = electronBundledRuntimeStrategy("npm", {
        exists: () => {
          existsProbed = true;
          return true;
        },
        resourcesPath: () => null,
      });
      const r = s.run(ctx({ platform: "linux" }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe("not running in Electron (no resourcesPath)");
      }
      // Critical: NO filesystem probe when not in Electron.
      expect(existsProbed).toBe(false);
    });

    it("returns 'missing: <path>' when resourcesPath set but bundled tree absent", () => {
      const RESOURCES = "/Applications/PI-Dashboard.app/Contents/Resources";
      const s = electronBundledRuntimeStrategy("npm", {
        exists: () => false,
        resourcesPath: () => RESOURCES,
      });
      const r = s.run(ctx({ platform: "linux" }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toMatch(/^missing:/);
        expect(r.reason).toContain("npm-cli.js");
      }
    });
  });

  describe("strategy identity", () => {
    it("strategy name is 'electron-bundled' (distinguishable from 'managed' in tried[])", () => {
      const s = electronBundledRuntimeStrategy("npm");
      expect(s.name).toBe("electron-bundled");
    });
  });
});
