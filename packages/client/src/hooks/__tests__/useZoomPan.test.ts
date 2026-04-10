import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useZoomPan } from "../useZoomPan.js";

describe("useZoomPan", () => {
  it("starts at scale 1 with zero translate", () => {
    const { result } = renderHook(() => useZoomPan());
    expect(result.current.state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("zoomIn increases scale by step", () => {
    const { result } = renderHook(() => useZoomPan({ zoomStep: 1.2 }));
    act(() => result.current.zoomIn());
    expect(result.current.state.scale).toBeCloseTo(1.2);
  });

  it("zoomOut decreases scale by step", () => {
    const { result } = renderHook(() => useZoomPan({ zoomStep: 1.2 }));
    act(() => result.current.zoomOut());
    expect(result.current.state.scale).toBeCloseTo(1 / 1.2);
  });

  it("clamps scale at maxScale", () => {
    const { result } = renderHook(() => useZoomPan({ maxScale: 2, zoomStep: 2 }));
    act(() => result.current.zoomIn()); // 2
    act(() => result.current.zoomIn()); // clamped to 2
    expect(result.current.state.scale).toBe(2);
  });

  it("clamps scale at minScale", () => {
    const { result } = renderHook(() => useZoomPan({ minScale: 0.5, zoomStep: 2 }));
    act(() => result.current.zoomOut()); // 0.5
    act(() => result.current.zoomOut()); // clamped to 0.5
    expect(result.current.state.scale).toBe(0.5);
  });

  it("reset restores initial state", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());
    expect(result.current.state.scale).not.toBe(1);
    act(() => result.current.reset());
    expect(result.current.state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("double-click resets state", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => result.current.zoomIn());
    act(() => result.current.handlers.onDoubleClick());
    expect(result.current.state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("exposes all expected handler keys", () => {
    const { result } = renderHook(() => useZoomPan());
    const keys = Object.keys(result.current.handlers);
    expect(keys).toContain("onWheel");
    expect(keys).toContain("onPointerDown");
    expect(keys).toContain("onPointerMove");
    expect(keys).toContain("onPointerUp");
    expect(keys).toContain("onTouchMove");
    expect(keys).toContain("onTouchEnd");
    expect(keys).toContain("onDoubleClick");
  });
});
