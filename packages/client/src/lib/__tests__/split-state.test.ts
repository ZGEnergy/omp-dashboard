import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  clampRatio,
  DEFAULT_SPLIT_STATE,
  loadSplitState,
  RATIO_MAX,
  RATIO_MIN,
  saveSplitState,
  SPLIT_KEY_PREFIX,
  type SplitState,
  useSplitState,
} from "../split-state.js";

describe("clampRatio", () => {
  it("passes through values in range", () => {
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(RATIO_MIN)).toBe(RATIO_MIN);
    expect(clampRatio(RATIO_MAX)).toBe(RATIO_MAX);
  });

  it("clamps below the minimum", () => {
    expect(clampRatio(0.1)).toBe(RATIO_MIN);
  });

  it("clamps above the maximum", () => {
    expect(clampRatio(0.99)).toBe(RATIO_MAX);
  });

  it("coerces NaN to the default ratio", () => {
    expect(clampRatio(Number.NaN)).toBe(DEFAULT_SPLIT_STATE.ratio);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage", () => {
    const state: SplitState = { open: true, ratio: 0.6, orientation: "h" };
    saveSplitState("sess1", state);
    expect(loadSplitState("sess1")).toEqual(state);
  });

  it("returns default state when nothing is stored", () => {
    expect(loadSplitState("absent")).toEqual(DEFAULT_SPLIT_STATE);
  });

  it("recovers from corrupt JSON without throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(`${SPLIT_KEY_PREFIX}bad`, "{not json");
    expect(loadSplitState("bad")).toEqual(DEFAULT_SPLIT_STATE);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("discards structurally-invalid state", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(`${SPLIT_KEY_PREFIX}weird`, JSON.stringify({ open: "yes", ratio: "big" }));
    expect(loadSplitState("weird")).toEqual(DEFAULT_SPLIT_STATE);
    spy.mockRestore();
  });

  it("clamps an out-of-range persisted ratio on load", () => {
    localStorage.setItem(`${SPLIT_KEY_PREFIX}wide`, JSON.stringify({ open: true, ratio: 0.95, orientation: "h" }));
    expect(loadSplitState("wide").ratio).toBe(RATIO_MAX);
  });
});

describe("useSplitState", () => {
  beforeEach(() => localStorage.clear());

  it("persists patched changes and reloads them", () => {
    const { result, unmount } = renderHook(() => useSplitState("sX"));
    expect(result.current[0].open).toBe(false);
    act(() => result.current[1]({ open: true, ratio: 0.6 }));
    expect(result.current[0]).toMatchObject({ open: true, ratio: 0.6 });
    unmount();

    const reopened = renderHook(() => useSplitState("sX"));
    expect(reopened.result.current[0]).toMatchObject({ open: true, ratio: 0.6 });
  });

  it("loads distinct state per session id", () => {
    saveSplitState("sA", { open: true, ratio: 0.5, orientation: "h" });
    saveSplitState("sB", { open: false, ratio: 0.5, orientation: "h" });
    const { result, rerender } = renderHook(({ id }) => useSplitState(id), {
      initialProps: { id: "sA" },
    });
    expect(result.current[0].open).toBe(true);
    rerender({ id: "sB" });
    expect(result.current[0].open).toBe(false);
  });

  it("clamps ratio through the patch updater", () => {
    const { result } = renderHook(() => useSplitState("sClamp"));
    act(() => result.current[1]({ ratio: 0.99 }));
    expect(result.current[0].ratio).toBe(RATIO_MAX);
  });

  it("isolates split state per session and restores it after reload (7.2)", () => {
    // Session A: open 50/50. Session B: closed. Switch A→B→A.
    const { result, rerender } = renderHook(({ id }) => useSplitState(id), {
      initialProps: { id: "A" },
    });
    act(() => result.current[1]({ open: true, ratio: 0.5 }));
    rerender({ id: "B" });
    expect(result.current[0].open).toBe(false); // B independent (default closed)
    rerender({ id: "A" });
    expect(result.current[0]).toMatchObject({ open: true, ratio: 0.5 });

    // "Reload": fresh hook instances read persisted state from localStorage.
    expect(loadSplitState("A")).toMatchObject({ open: true, ratio: 0.5 });
    expect(loadSplitState("B").open).toBe(false);
  });
});
