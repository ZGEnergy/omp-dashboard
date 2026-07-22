import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKELETON_DELAY_MS, useDelayedSkeleton } from "../useDelayedSkeleton.js";

describe("useDelayedSkeleton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays hidden while inactive", () => {
    const { result } = renderHook(() => useDelayedSkeleton(false));
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS + 100); });
    expect(result.current).toBe(false);
  });

  it("stays hidden for a fast-resolving (cache-hit) read that clears before the threshold", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedSkeleton(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS - 1); });
    expect(result.current).toBe(false);
    // Resolves just under the threshold — never shows the skeleton at all.
    rerender({ active: false });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(false);
  });

  it("shows the skeleton once the read exceeds the threshold", () => {
    const { result } = renderHook(() => useDelayedSkeleton(true));
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS); });
    expect(result.current).toBe(true);
  });

  it("swaps back to hidden in a single commit once the slow read resolves", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedSkeleton(active),
      { initialProps: { active: true } },
    );
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS); });
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it("restarts the threshold window if re-activated", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedSkeleton(active),
      { initialProps: { active: true } },
    );
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ active: false });
    rerender({ active: true });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe(true);
  });

  it("re-arms the threshold window when resetKey changes while active stays true", () => {
    const { result, rerender } = renderHook(
      ({ active, resetKey }) => useDelayedSkeleton(active, resetKey),
      { initialProps: { active: true, resetKey: "session-a" } },
    );
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS); });
    expect(result.current).toBe(true);

    // Switching to another still-loading session must hide the skeleton
    // immediately and restart the 150ms window, not inherit session A's
    // already-fired timer.
    rerender({ active: true, resetKey: "session-b" });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS - 1); });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });
});
