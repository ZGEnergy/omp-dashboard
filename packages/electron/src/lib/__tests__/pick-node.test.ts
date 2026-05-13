/**
 * Unit tests for pickNodeForServer() — all I/O injected, no real fs calls.
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { pickNodeForServer, type PickNodeInput } from "../pick-node.js";

const FAKE_EXECPATH = "/Applications/PI-Dashboard.app/Contents/MacOS/pi-dashboard";

function input(overrides: Partial<PickNodeInput> = {}): PickNodeInput {
  return {
    bundledNodeDir: null,
    systemNode: { found: false },
    processExecPath: FAKE_EXECPATH,
    platform: "darwin",
    existsSync: () => false,
    ...overrides,
  };
}

describe("pickNodeForServer — bundled branch", () => {
  it("returns bundled when bundled node exists on POSIX", () => {
    const result = pickNodeForServer(
      input({
        bundledNodeDir: "/app/Contents/Resources/node",
        existsSync: (p) => p === "/app/Contents/Resources/node/bin/node",
      }),
    );
    expect(result).toEqual({
      kind: "bundled",
      nodeBin: "/app/Contents/Resources/node/bin/node",
    });
  });

  it("returns bundled when bundled node.exe exists on Windows", () => {
    const winDir = "C:\\app\\resources\\node";
    const winNodeExe = path.win32.join(winDir, "node.exe");
    const result = pickNodeForServer(
      input({
        bundledNodeDir: winDir,
        platform: "win32",
        existsSync: (p) => p === winNodeExe,
      }),
    );
    expect(result).toEqual({
      kind: "bundled",
      nodeBin: winNodeExe,
    });
  });

  it("falls through to system when bundled binary missing", () => {
    const result = pickNodeForServer(
      input({
        bundledNodeDir: "/app/Contents/Resources/node",
        existsSync: () => false, // bundled binary doesn't exist
        systemNode: { found: true, path: "/usr/local/bin/node", version: "22.18.0" },
      }),
    );
    expect(result.kind).toBe("system");
  });
});

describe("pickNodeForServer — system branch", () => {
  it("returns system when no bundled node and system is found", () => {
    const result = pickNodeForServer(
      input({
        systemNode: { found: true, path: "/usr/local/bin/node", version: "22.18.0" },
      }),
    );
    expect(result).toEqual({
      kind: "system",
      nodeBin: "/usr/local/bin/node",
      version: "22.18.0",
    });
  });

  it("falls through when system found=false", () => {
    const result = pickNodeForServer(
      input({ systemNode: { found: false } }),
    );
    expect(result.kind).toBe("execpath-fallback");
  });

  it("returns empty string for version when version field absent", () => {
    const result = pickNodeForServer(
      input({
        systemNode: { found: true, path: "/usr/bin/node" },
      }),
    );
    expect(result).toEqual({ kind: "system", nodeBin: "/usr/bin/node", version: "" });
  });
});

describe("pickNodeForServer — execpath-fallback branch", () => {
  it("returns execpath-fallback when neither bundled nor system available", () => {
    const result = pickNodeForServer(input());
    expect(result).toEqual({
      kind: "execpath-fallback",
      nodeBin: FAKE_EXECPATH,
      needsElectronRunAsNode: true,
    });
  });

  it("needsElectronRunAsNode is only true on the fallback branch", () => {
    const bundled = pickNodeForServer(
      input({
        bundledNodeDir: "/r/node",
        existsSync: (p) => p.endsWith("/node"),
      }),
    );
    expect("needsElectronRunAsNode" in bundled).toBe(false);

    const system = pickNodeForServer(
      input({ systemNode: { found: true, path: "/usr/bin/node", version: "22.0.0" } }),
    );
    expect("needsElectronRunAsNode" in system).toBe(false);

    const fallback = pickNodeForServer(input());
    expect((fallback as { needsElectronRunAsNode?: boolean }).needsElectronRunAsNode).toBe(true);
  });
});
