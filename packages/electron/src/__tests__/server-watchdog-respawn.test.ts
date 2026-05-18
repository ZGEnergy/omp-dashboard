/**
 * Tests for `makeServerWatchdog` \u2014 the pure factory that decides whether an
 * unexpected child exit should route the user to the loading-page recovery
 * UI. Pinned by Failure 5 of streamline-electron-bootstrap-and-recovery.
 */
import { describe, it, expect } from "vitest";

import {
  makeServerWatchdog,
  setGracefulShutdownInProgress,
  isGracefulShutdownInProgress,
  setSpawnedPid,
} from "../lib/server-lifecycle.js";

describe("makeServerWatchdog", () => {
  it("calls onCrash when the graceful flag is false", () => {
    const logs: string[] = [];
    const crashes: Array<[number | null, NodeJS.Signals | null]> = [];

    const watchdog = makeServerWatchdog({
      isGraceful: () => false,
      log: (m) => logs.push(m),
      onCrash: (c, s) => crashes.push([c, s]),
    });

    watchdog(137, "SIGTERM");
    expect(crashes).toEqual([[137, "SIGTERM"]]);
    expect(logs.some((l) => l.includes("unexpectedly"))).toBe(true);
  });

  it("does NOT call onCrash when the graceful flag is true", () => {
    const crashes: number[] = [];
    const watchdog = makeServerWatchdog({
      isGraceful: () => true,
      log: () => {},
      onCrash: (c) => crashes.push(c ?? -1),
    });

    watchdog(0, null);
    expect(crashes).toEqual([]);
  });

  it("swallows errors thrown by onCrash so watchdog never propagates", () => {
    const logs: string[] = [];
    const watchdog = makeServerWatchdog({
      isGraceful: () => false,
      log: (m) => logs.push(m),
      onCrash: () => {
        throw new Error("renderer gone");
      },
    });

    expect(() => watchdog(1, null)).not.toThrow();
    expect(logs.some((l) => l.includes("crash handler threw"))).toBe(true);
  });
});

describe("graceful-shutdown flag lifecycle", () => {
  it("setSpawnedPid resets the graceful flag (re-arm watchdog after restart)", () => {
    setGracefulShutdownInProgress(true);
    expect(isGracefulShutdownInProgress()).toBe(true);

    setSpawnedPid(12345);
    expect(isGracefulShutdownInProgress()).toBe(false);
  });

  it("setGracefulShutdownInProgress toggles in both directions", () => {
    setGracefulShutdownInProgress(false);
    expect(isGracefulShutdownInProgress()).toBe(false);
    setGracefulShutdownInProgress(true);
    expect(isGracefulShutdownInProgress()).toBe(true);
    setGracefulShutdownInProgress(false);
    expect(isGracefulShutdownInProgress()).toBe(false);
  });
});
