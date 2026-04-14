/**
 * Tests for resolveJitiFromPi() — jiti fallback when tsx is not available.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const { mockExecSync, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: mockExecSync }));
vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  realpathSync: (p: string) => p,
  mkdirSync: vi.fn(),
  openSync: vi.fn(() => 999),
  writeFileSync: vi.fn(),
}));

// Mock createRequire
const mockResolve = vi.fn();
vi.mock("node:module", () => ({
  createRequire: () => ({ resolve: mockResolve }),
}));

import { resolveJitiFromPi } from "../lib/server-lifecycle.js";

const MANAGED_DIR = path.join(os.homedir(), ".pi-dashboard");

describe("resolveJitiFromPi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });
    mockResolve.mockImplementation(() => { throw new Error("not found"); });
  });

  it("returns jiti path from managed pi install", () => {
    const managedPiPkg = path.join(MANAGED_DIR, "node_modules", "@mariozechner", "pi-coding-agent", "package.json");
    const jitiPkgJson = path.join(MANAGED_DIR, "node_modules", "@mariozechner", "jiti", "package.json");
    const jitiRegister = path.join(MANAGED_DIR, "node_modules", "@mariozechner", "jiti", "lib", "jiti-register.mjs");

    mockExistsSync.mockImplementation((p: string) => {
      if (p === managedPiPkg) return true;
      if (p === jitiRegister) return true;
      return false;
    });
    mockResolve.mockImplementation((pkg: string) => {
      if (pkg === "@mariozechner/jiti/package.json") return jitiPkgJson;
      throw new Error("not found");
    });

    expect(resolveJitiFromPi()).toBe(jitiRegister);
  });

  it("returns jiti path from system pi when managed not available", () => {
    const piBin = "/usr/local/bin/pi";
    const jitiPkgJson = "/usr/local/lib/node_modules/@mariozechner/jiti/package.json";
    const jitiRegister = "/usr/local/lib/node_modules/@mariozechner/jiti/lib/jiti-register.mjs";

    mockExistsSync.mockImplementation((p: string) => {
      if (p === piBin) return true;
      if (p === jitiRegister) return true;
      return false;
    });
    // detectPi() — system PATH succeeds
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("which pi")) return piBin;
      throw new Error("not found");
    });
    mockResolve.mockImplementation((pkg: string) => {
      if (pkg === "@mariozechner/jiti/package.json") return jitiPkgJson;
      throw new Error("not found");
    });

    expect(resolveJitiFromPi()).toBe(jitiRegister);
  });

  it("returns null when neither managed nor system pi has jiti", () => {
    mockExistsSync.mockReturnValue(false);
    expect(resolveJitiFromPi()).toBeNull();
  });

  it("returns null when pi exists but jiti package not found", () => {
    const managedPiPkg = path.join(MANAGED_DIR, "node_modules", "@mariozechner", "pi-coding-agent", "package.json");
    mockExistsSync.mockImplementation((p: string) => p === managedPiPkg);
    // createRequire().resolve throws for all jiti packages
    mockResolve.mockImplementation(() => { throw new Error("not found"); });

    expect(resolveJitiFromPi()).toBeNull();
  });

  it("tries @oh-my-pi/jiti as fallback", () => {
    const managedPiPkg = path.join(MANAGED_DIR, "node_modules", "@mariozechner", "pi-coding-agent", "package.json");
    const jitiPkgJson = "/some/path/@oh-my-pi/jiti/package.json";
    const jitiRegister = "/some/path/@oh-my-pi/jiti/lib/jiti-register.mjs";

    mockExistsSync.mockImplementation((p: string) => {
      if (p === managedPiPkg) return true;
      if (p === jitiRegister) return true;
      return false;
    });
    mockResolve.mockImplementation((pkg: string) => {
      if (pkg === "@mariozechner/jiti/package.json") throw new Error("not found");
      if (pkg === "@oh-my-pi/jiti/package.json") return jitiPkgJson;
      throw new Error("not found");
    });

    expect(resolveJitiFromPi()).toBe(jitiRegister);
  });
});
