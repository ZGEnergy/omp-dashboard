/**
 * Regression tests for `bareImportStrategy` against packages whose
 * `exports` map declares ONLY the `"import"` condition (no `"require"`).
 *
 * Background: `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-ai`
 * ship exports maps like:
 *   { ".": { "types": "...", "import": "./dist/index.js" } }
 *
 * The legacy `createRequire(from).resolve(pkg)` path fails with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` on these because the CJS resolver
 * does not honour the `"import"` condition. The fixed strategy falls
 * back through `import.meta.resolve` and a filesystem dir-walk so the
 * registry can still resolve them.
 *
 * Live repro before the fix: `/api/packages/installed` returned
 * `ModuleResolutionError` even though `await import("@oh-my-pi/pi-coding-agent")`
 * worked. See change: fix-node-resolution-under-electron (follow-up).
 */
import path from "node:path";
import { describe, it, expect } from "vitest";
import { bareImportStrategy } from "../strategies.js";
import type { StrategyCtx } from "../types.js";

const CTX: StrategyCtx = { overrides: {}, platform: "linux", env: {} };

describe("bareImportStrategy — production default resolver", () => {
  it("resolves @oh-my-pi/pi-coding-agent against the repo's node_modules", () => {
    // No injected resolveModule → defaults run, including the
    // import.meta.resolve / dir-walk fallback for exports-map-only-import
    // packages.
    const strat = bareImportStrategy("@oh-my-pi/pi-coding-agent");
    const r = strat.run(CTX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toMatch(/@earendil-works\/pi-coding-agent\/dist\/index\.js$/);
    }
  });

  it("resolves @oh-my-pi/pi-ai against the repo's node_modules", () => {
    const strat = bareImportStrategy("@oh-my-pi/pi-ai");
    const r = strat.run(CTX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toMatch(/@earendil-works\/pi-ai\/dist\/index\.js$/);
    }
  });

  it("returns a cannot-resolve reason for a genuinely missing package", () => {
    const strat = bareImportStrategy("@earendil-works/this-package-does-not-exist");
    const r = strat.run(CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/cannot resolve/);
    }
  });
});

describe("bareImportStrategy — caller-injected resolver still honoured", () => {
  it("uses the injected resolveModule when supplied (tests inject fakes)", () => {
    const fakeEntry = path.join("/fake", "node_modules", "x", "dist", "index.js");
    const strat = bareImportStrategy("x", "file:///anywhere", {
      resolveModule: (id) => (id === "x" ? fakeEntry : null),
    });
    expect(strat.run(CTX)).toEqual({ ok: true, path: fakeEntry });
  });

  it("returns cannot-resolve when the injected resolver returns null", () => {
    const strat = bareImportStrategy("x", "file:///anywhere", {
      resolveModule: () => null,
    });
    const r = strat.run(CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("cannot resolve x");
    }
  });
});
