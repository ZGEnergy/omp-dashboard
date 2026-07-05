/**
 * Unit tests for the pure ownership + zombie classifiers.
 * See change: electron-attach-ownership-fixes.
 */
import { describe, it, expect } from "vitest";
import { decideOwnership, decideIsZombie } from "../server-lifecycle.js";

describe("decideOwnership", () => {
  it("electron + pid match → electron", () => {
    expect(
      decideOwnership({ healthLaunchSource: "electron", healthPid: 1234, storedSpawnedPid: 1234 }),
    ).toBe("electron");
  });

  it("electron + pid mismatch → foreign", () => {
    expect(
      decideOwnership({ healthLaunchSource: "electron", healthPid: 9999, storedSpawnedPid: 1234 }),
    ).toBe("foreign");
  });

  it("bridge-orphaned launchSource → foreign", () => {
    expect(
      decideOwnership({ healthLaunchSource: "bridge-orphaned", healthPid: 1234, storedSpawnedPid: 1234 }),
    ).toBe("foreign");
  });

  it("standalone launchSource → foreign", () => {
    expect(
      decideOwnership({ healthLaunchSource: "standalone", healthPid: 1234, storedSpawnedPid: 1234 }),
    ).toBe("foreign");
  });

  it("no stored pid (didn't spawn) → foreign", () => {
    expect(
      decideOwnership({ healthLaunchSource: "electron", healthPid: 1234, storedSpawnedPid: null }),
    ).toBe("foreign");
  });

  it("null health (unreachable) → none", () => {
    expect(
      decideOwnership({ healthLaunchSource: null, healthPid: undefined, storedSpawnedPid: 1234 }),
    ).toBe("none");
  });
});

describe("decideIsZombie — POSIX", () => {
  const base = {
    healthLaunchSourceEffective: "electron" as const,
    healthPid: 5000,
    healthPpid: 42, // reparented (subreaper), != bootParentPid
    healthBootParentPid: 1234,
    healthBootParentAlive: false,
    storedSpawnedPid: null,
    platform: "darwin" as NodeJS.Platform,
  };

  it("reparented + dead boot parent + no stored pid → true", () => {
    expect(decideIsZombie(base)).toBe(true);
  });

  it("boot parent still alive → false", () => {
    expect(decideIsZombie({ ...base, healthBootParentAlive: true })).toBe(false);
  });

  it("not reparented (ppid === bootParentPid) → false", () => {
    expect(decideIsZombie({ ...base, healthPpid: 1234 })).toBe(false);
  });

  it("we own it (stored pid set) → false", () => {
    expect(decideIsZombie({ ...base, storedSpawnedPid: 5000 })).toBe(false);
  });

  it("standalone launchSource → false", () => {
    expect(decideIsZombie({ ...base, healthLaunchSourceEffective: "standalone" })).toBe(false);
  });

  it("bridge launchSource → false", () => {
    expect(decideIsZombie({ ...base, healthLaunchSourceEffective: "bridge" })).toBe(false);
  });
});

describe("decideIsZombie — Windows", () => {
  const base = {
    healthLaunchSourceEffective: "electron" as const,
    healthPid: 5000,
    healthPpid: 1234, // Windows never reparents; ppid irrelevant
    healthBootParentPid: 1234,
    healthBootParentAlive: false,
    storedSpawnedPid: null,
    platform: "win32" as NodeJS.Platform,
  };

  it("dead boot parent + electron + no stored pid → true (regardless of ppid)", () => {
    expect(decideIsZombie(base)).toBe(true);
    expect(decideIsZombie({ ...base, healthPpid: 9999 })).toBe(true);
  });

  it("boot parent alive → false", () => {
    expect(decideIsZombie({ ...base, healthBootParentAlive: true })).toBe(false);
  });

  it("we own it (stored pid set) → false", () => {
    expect(decideIsZombie({ ...base, storedSpawnedPid: 5000 })).toBe(false);
  });

  it("non-electron launchSource → false", () => {
    expect(decideIsZombie({ ...base, healthLaunchSourceEffective: "bridge-orphaned" })).toBe(false);
  });
});
