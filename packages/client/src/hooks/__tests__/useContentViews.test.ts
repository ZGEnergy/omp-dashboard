import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContentViews } from "../useContentViews.js";

describe("useContentViews", () => {
  it("clearAll resets all content view states", () => {
    const { result } = renderHook(() => useContentViews());

    // Open pi resources
    act(() => result.current.handleOpenPiResources("/some/cwd"));
    expect(result.current.piResourcesState).toEqual({ cwd: "/some/cwd" });

    // clearAll should reset everything
    act(() => result.current.clearAll());
    expect(result.current.piResourcesState).toBeNull();
    expect(result.current.piResourceFilePreview).toBeNull();
    expect(result.current.readmePreview).toBeNull();
  });

  it("handleOpenPiResources clears other content views via onBeforeOpen", () => {
    const onBeforeOpen = vi.fn();
    const { result } = renderHook(() => useContentViews({ onBeforeOpen }));

    act(() => result.current.handleOpenPiResources("/cwd"));
    expect(onBeforeOpen).toHaveBeenCalledOnce();
    expect(result.current.piResourcesState).toEqual({ cwd: "/cwd" });
    // piResourceFilePreview should be cleared (internal)
    expect(result.current.piResourceFilePreview).toBeNull();
  });

  it("handleViewReadme clears other content views via onBeforeOpen", async () => {
    const onBeforeOpen = vi.fn();
    const { result } = renderHook(() => useContentViews({ onBeforeOpen }));

    // Open pi resources first
    act(() => result.current.handleOpenPiResources("/cwd"));
    expect(result.current.piResourcesState).toEqual({ cwd: "/cwd" });

    // handleViewReadme should call onBeforeOpen and clear piResourcesState
    await act(async () => result.current.handleViewReadme("/readme-cwd"));
    expect(onBeforeOpen).toHaveBeenCalledTimes(2); // once for piResources, once for readme
    expect(result.current.piResourcesState).toBeNull();
  });

  it("handleViewPiResourceFile does NOT call onBeforeOpen (sub-navigation)", async () => {
    const onBeforeOpen = vi.fn();
    const { result } = renderHook(() => useContentViews({ onBeforeOpen }));

    // Open pi resources first
    act(() => result.current.handleOpenPiResources("/cwd"));
    onBeforeOpen.mockClear();

    // Viewing a file within pi resources is sub-navigation, not a new top-level view
    await act(async () => result.current.handleViewPiResourceFile("/some/file.ts", "file.ts"));
    expect(onBeforeOpen).not.toHaveBeenCalled();
  });
});
