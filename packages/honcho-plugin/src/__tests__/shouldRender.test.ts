/**
 * Tests for `shouldRenderHonchoMemory` — the sync gate consulted by the host
 * `useSlotHasClaimsForSession` hook so the MEMORY subcard hides cleanly when
 * `pi-memory-honcho` is not installed.
 *
 * The cache is module-level state populated by `primeExtensionInstalledCache`
 * and `useExtensionInstalled`. To exercise the sync gate without mounting a
 * React tree, we stub the underlying `checkExtensionInstalled` and call
 * `primeExtensionInstalledCache` directly between assertions.
 *
 * See change: auto-hide-empty-session-subcards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { checkExtensionInstalledMock } = vi.hoisted(() => ({
  checkExtensionInstalledMock: vi.fn(),
}));

vi.mock("../client/api.js", () => ({
  checkExtensionInstalled: checkExtensionInstalledMock,
  // Other exports honcho's hooks.ts imports — stubs are fine since unused here.
  fetchConfig: vi.fn().mockResolvedValue(null),
  fetchStatus: vi.fn().mockResolvedValue(null),
}));

import {
  getHonchoExtensionInstalledSync,
  primeExtensionInstalledCache,
} from "../client/hooks.js";
import { shouldRenderHonchoMemory } from "../client/shouldRender.js";

describe("shouldRenderHonchoMemory", () => {
  beforeEach(() => {
    checkExtensionInstalledMock.mockReset();
  });

  it("returns false initially (closed-by-default before first probe)", async () => {
    // Force the cache back into the closed-by-default state by re-priming
    // with a rejected probe.
    checkExtensionInstalledMock.mockRejectedValueOnce(new Error("nope"));
    await primeExtensionInstalledCache();
    expect(getHonchoExtensionInstalledSync()).toBe(false);
    // Pass `null` to assert the gate doesn't depend on session shape
    // (function reads the module-level installed-state cache, not its arg).
    expect(shouldRenderHonchoMemory(null)).toBe(false);
  });

  it("returns false when the probe reports the extension uninstalled", async () => {
    checkExtensionInstalledMock.mockResolvedValueOnce(false);
    await primeExtensionInstalledCache();
    expect(shouldRenderHonchoMemory(null)).toBe(false);
  });

  it("returns true after the probe reports the extension installed", async () => {
    checkExtensionInstalledMock.mockResolvedValueOnce(true);
    await primeExtensionInstalledCache();
    expect(shouldRenderHonchoMemory(null)).toBe(true);
  });

  it("flips back to false when the extension is uninstalled", async () => {
    checkExtensionInstalledMock.mockResolvedValueOnce(true);
    await primeExtensionInstalledCache();
    expect(shouldRenderHonchoMemory(null)).toBe(true);

    checkExtensionInstalledMock.mockResolvedValueOnce(false);
    await primeExtensionInstalledCache();
    expect(shouldRenderHonchoMemory(null)).toBe(false);
  });
});
