import { describe, it, expect } from "vitest";
import { pickNodeForServer, isBundledNodeAffected } from "../lib/pick-node.js";

describe("isBundledNodeAffected", () => {
  it("flags Node v22.0–v22.17 as affected", () => {
    expect(isBundledNodeAffected("v22.0.0")).toBe(true);
    expect(isBundledNodeAffected("v22.12.0")).toBe(true);
    expect(isBundledNodeAffected("v22.17.999")).toBe(true);
  });
  it("clears Node v22.18+", () => {
    expect(isBundledNodeAffected("v22.18.0")).toBe(false);
    expect(isBundledNodeAffected("v22.22.0")).toBe(false);
  });
  it("flags Node v24.1–v24.2 as affected", () => {
    expect(isBundledNodeAffected("v24.1.0")).toBe(true);
    expect(isBundledNodeAffected("v24.2.5")).toBe(true);
  });
  it("clears Node v24.0, v24.3+, v25.x", () => {
    expect(isBundledNodeAffected("v24.0.0")).toBe(false);
    expect(isBundledNodeAffected("v24.3.0")).toBe(false);
    expect(isBundledNodeAffected("v25.0.0")).toBe(false);
  });
  it("returns false for unparseable input", () => {
    expect(isBundledNodeAffected("garbage")).toBe(false);
    expect(isBundledNodeAffected("")).toBe(false);
  });
});

describe("pickNodeForServer — bundledNodeVersion gating", () => {
  const baseInput = {
    bundledNodeDir: "/app/Resources/node",
    processExecPath: "/Applications/PI-Dashboard.app/Contents/MacOS/PI-Dashboard",
    platform: "darwin" as NodeJS.Platform,
    existsSync: () => true,
  };

  it("uses bundled when no version provided (legacy)", () => {
    const r = pickNodeForServer({
      ...baseInput,
      systemNode: { found: true, path: "/usr/local/bin/node", version: "v22.22.0" },
    });
    expect(r).toEqual({ kind: "bundled", nodeBin: "/app/Resources/node/bin/node" });
  });

  it("uses bundled when version is safe", () => {
    const r = pickNodeForServer({
      ...baseInput,
      bundledNodeVersion: "v22.22.0",
      systemNode: { found: true, path: "/usr/local/bin/node", version: "v22.22.0" },
    });
    expect(r.kind).toBe("bundled");
  });

  it("falls through to system when bundled version is affected", () => {
    const r = pickNodeForServer({
      ...baseInput,
      bundledNodeVersion: "v22.12.0",
      systemNode: { found: true, path: "/usr/local/bin/node", version: "v22.22.0" },
    });
    expect(r).toEqual({ kind: "system", nodeBin: "/usr/local/bin/node", version: "v22.22.0" });
  });

  it("falls through to execpath when bundled is affected and no system Node", () => {
    const r = pickNodeForServer({
      ...baseInput,
      bundledNodeVersion: "v22.12.0",
      systemNode: { found: false },
    });
    expect(r.kind).toBe("execpath-fallback");
  });

  it("Windows path layout works with affected gating", () => {
    const r = pickNodeForServer({
      bundledNodeDir: "C:\\Program Files\\PI-Dashboard\\resources\\node",
      bundledNodeVersion: "v22.12.0",
      systemNode: { found: true, path: "C:\\Program Files\\nodejs\\node.exe", version: "v22.22.0" },
      processExecPath: "C:\\Program Files\\PI-Dashboard\\PI-Dashboard.exe",
      platform: "win32",
      existsSync: () => true,
    });
    expect(r.kind).toBe("system");
  });
});
