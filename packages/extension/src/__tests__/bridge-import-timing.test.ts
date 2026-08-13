/**
 * Import timing test for packages/extension/src/bridge.ts (#113).
 *
 * Verifies that evaluating bridge.js does not statically import
 * bonjour-service / mdns-discovery.js.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../provider-register.js", () => ({
  activate: vi.fn(),
  onProviderChanged: vi.fn(),
  reloadProviders: vi.fn(),
  buildProviderCatalogue: vi.fn(),
  toModelInfo: vi.fn(),
}));
vi.mock("../role-manager.js", () => ({ activate: vi.fn() }));

describe("bridge import timing", () => {
  it("does not load bonjour-service during module evaluation of bridge", async () => {
    const isBonjourLoaded = () => {
      const cacheKeys = Object.keys(require.cache);
      return cacheKeys.some((key) => key.includes("bonjour-service"));
    };

    expect(isBonjourLoaded()).toBe(false);

    await import("../bridge.js");

    expect(isBonjourLoaded()).toBe(false);
  });
});
