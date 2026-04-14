/**
 * Integration tests for the smart startup detection logic.
 * Tests the decision flow: health check → detection → wizard routing.
 *
 * Since main.ts is tightly coupled to Electron APIs, we test the
 * decision logic as a pure function extracted from the flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const { mockExecSync, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: mockExecSync }));
vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

import { detectPi, detectBridgeExtension } from "../lib/dependency-detector.js";

/** Replicate the decision logic from main.ts */
type StartupDecision =
  | { action: "skip"; reason: string }
  | { action: "wizard-bridge-install" }
  | { action: "wizard-full" };

function decideStartup(opts: {
  serverRunning: boolean;
  isFirstRun: boolean;
  piFound: boolean;
  bridgeFound: boolean;
}): StartupDecision {
  // Tier 1: Server running → auto-skip
  if (opts.serverRunning && opts.isFirstRun) {
    return { action: "skip", reason: "server-running" };
  }
  if (opts.serverRunning && !opts.isFirstRun) {
    return { action: "skip", reason: "not-first-run" };
  }
  if (!opts.isFirstRun) {
    return { action: "skip", reason: "not-first-run" };
  }

  // Tier 2: Pi + bridge detected → auto-skip
  if (opts.piFound && opts.bridgeFound) {
    return { action: "skip", reason: "pi-and-bridge-detected" };
  }

  // Tier 3: Pi found, no bridge → targeted wizard
  if (opts.piFound && !opts.bridgeFound) {
    return { action: "wizard-bridge-install" };
  }

  // Tier 4: Nothing found → full wizard
  return { action: "wizard-full" };
}

describe("smart startup decision logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it("Tier 1: skips wizard when server is running (first run)", () => {
    const result = decideStartup({ serverRunning: true, isFirstRun: true, piFound: false, bridgeFound: false });
    expect(result).toEqual({ action: "skip", reason: "server-running" });
  });

  it("Tier 1: skips wizard when server is running (not first run)", () => {
    const result = decideStartup({ serverRunning: true, isFirstRun: false, piFound: false, bridgeFound: false });
    expect(result).toEqual({ action: "skip", reason: "not-first-run" });
  });

  it("skips wizard when not first run (server not running)", () => {
    const result = decideStartup({ serverRunning: false, isFirstRun: false, piFound: false, bridgeFound: false });
    expect(result).toEqual({ action: "skip", reason: "not-first-run" });
  });

  it("Tier 2: auto-skips when pi + bridge detected", () => {
    const result = decideStartup({ serverRunning: false, isFirstRun: true, piFound: true, bridgeFound: true });
    expect(result).toEqual({ action: "skip", reason: "pi-and-bridge-detected" });
  });

  it("Tier 3: targeted wizard when pi found but no bridge", () => {
    const result = decideStartup({ serverRunning: false, isFirstRun: true, piFound: true, bridgeFound: false });
    expect(result).toEqual({ action: "wizard-bridge-install" });
  });

  it("Tier 4: full wizard when nothing installed", () => {
    const result = decideStartup({ serverRunning: false, isFirstRun: true, piFound: false, bridgeFound: false });
    expect(result).toEqual({ action: "wizard-full" });
  });

  it("Tier 4: full wizard when only bridge found (unlikely, no pi)", () => {
    const result = decideStartup({ serverRunning: false, isFirstRun: true, piFound: false, bridgeFound: true });
    expect(result).toEqual({ action: "wizard-full" });
  });
});

describe("detection integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it("detects pi + bridge from settings.json for power-user auto-skip", () => {
    // Pi on PATH
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes("which pi")) return "/usr/local/bin/pi\n";
      throw new Error("not found");
    });
    // Bridge in settings.json
    mockExistsSync.mockImplementation((p: string) => String(p).includes("settings.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify({
      packages: ["../../Project/pi-agent-dashboard"],
    }));

    const pi = detectPi();
    const bridge = detectBridgeExtension();
    const decision = decideStartup({
      serverRunning: false,
      isFirstRun: true,
      piFound: pi.found,
      bridgeFound: bridge.found,
    });

    expect(pi.found).toBe(true);
    expect(bridge.found).toBe(true);
    expect(decision).toEqual({ action: "skip", reason: "pi-and-bridge-detected" });
  });

  it("detects pi without bridge → targeted wizard", () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes("which pi")) return "/usr/local/bin/pi\n";
      throw new Error("not found");
    });
    // Settings exists but no pi-dashboard entry
    mockExistsSync.mockImplementation((p: string) => String(p).includes("settings.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify({ packages: ["npm:some-other"] }));

    const pi = detectPi();
    const bridge = detectBridgeExtension();
    const decision = decideStartup({
      serverRunning: false,
      isFirstRun: true,
      piFound: pi.found,
      bridgeFound: bridge.found,
    });

    expect(pi.found).toBe(true);
    expect(bridge.found).toBe(false);
    expect(decision).toEqual({ action: "wizard-bridge-install" });
  });
});
