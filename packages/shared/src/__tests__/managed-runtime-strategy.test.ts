/**
 * Unit tests for `managedRuntimeStrategy` in isolation.
 *
 * Strategy receives a `StrategyCtx` (overrides + platform + env). We
 * inject a fake `exists` so no real filesystem is touched.
 *
 * See change: embed-managed-node-runtime (task 2.6).
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { managedRuntimeStrategy } from "../tool-registry/strategies.js";
import type { StrategyCtx } from "../tool-registry/types.js";

function ctx(opts: Partial<StrategyCtx> = {}): StrategyCtx {
  return {
    overrides: {},
    platform: opts.platform ?? "linux",
    env: opts.env ?? { homedir: "/fake/home" },
  };
}

describe("managedRuntimeStrategy", () => {
  it("Unix node: returns <managedDir>/node/bin/node when present", () => {
    const expected = path.join("/fake/home", ".omp-dashboard", "node", "bin", "node");
    const s = managedRuntimeStrategy("node", { exists: (p) => p === expected });
    const r = s.run(ctx({ platform: "linux" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(expected);
  });

  it("Unix npm: returns <managedDir>/node/bin/npm when present", () => {
    const expected = path.join("/fake/home", ".omp-dashboard", "node", "bin", "npm");
    const s = managedRuntimeStrategy("npm", { exists: (p) => p === expected });
    const r = s.run(ctx({ platform: "linux" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(expected);
  });

  it("Windows node: returns <managedDir>/node/node.exe when present", () => {
    const expected = path.join("/fake/home", ".omp-dashboard", "node", "node.exe");
    const s = managedRuntimeStrategy("node", { exists: (p) => p === expected });
    const r = s.run(ctx({ platform: "win32" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(expected);
  });

  it("Windows npm: returns <managedDir>/node/npm.cmd when present", () => {
    const expected = path.join("/fake/home", ".omp-dashboard", "node", "npm.cmd");
    const s = managedRuntimeStrategy("npm", { exists: (p) => p === expected });
    const r = s.run(ctx({ platform: "win32" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(expected);
  });

  it("Windows npx: returns <managedDir>/node/npx.cmd when present", () => {
    const expected = path.join("/fake/home", ".omp-dashboard", "node", "npx.cmd");
    const s = managedRuntimeStrategy("npx", { exists: (p) => p === expected });
    const r = s.run(ctx({ platform: "win32" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(expected);
  });

  it("returns failure with reason when binary absent", () => {
    const s = managedRuntimeStrategy("node", { exists: () => false });
    const r = s.run(ctx({ platform: "linux" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing:/);
  });

  it("strategy is named 'managed' (classifies as managed source)", () => {
    const s = managedRuntimeStrategy("node");
    expect(s.name).toBe("managed");
  });
});
