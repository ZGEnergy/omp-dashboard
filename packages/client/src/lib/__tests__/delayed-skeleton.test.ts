import { describe, expect, it } from "vitest";
import { SKELETON_DELAY_MS, shouldShowSkeleton } from "../delayed-skeleton.js";

describe("shouldShowSkeleton", () => {
  it("does not show before the threshold elapses", () => {
    expect(shouldShowSkeleton(0, false)).toBe(false);
    expect(shouldShowSkeleton(SKELETON_DELAY_MS - 1, false)).toBe(false);
  });

  it("shows once the threshold has elapsed and the read is still unresolved", () => {
    expect(shouldShowSkeleton(SKELETON_DELAY_MS, false)).toBe(true);
    expect(shouldShowSkeleton(SKELETON_DELAY_MS + 500, false)).toBe(true);
  });

  it("never shows once the read has resolved, regardless of elapsed time", () => {
    expect(shouldShowSkeleton(0, true)).toBe(false);
    expect(shouldShowSkeleton(SKELETON_DELAY_MS, true)).toBe(false);
    expect(shouldShowSkeleton(10_000, true)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(shouldShowSkeleton(50, false, 100)).toBe(false);
    expect(shouldShowSkeleton(100, false, 100)).toBe(true);
  });
});
