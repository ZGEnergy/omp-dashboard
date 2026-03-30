import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { ResizableSidebar } from "../ResizableSidebar.js";
import type { SidebarState } from "../../hooks/useSidebarState.js";

afterEach(() => cleanup());

function makeSidebar(overrides: Partial<SidebarState> = {}): SidebarState {
  return {
    width: 256,
    collapsed: false,
    setWidth: vi.fn(),
    toggleCollapse: vi.fn(),
    ...overrides,
  };
}

describe("ResizableSidebar", () => {
  it("renders children when expanded", () => {
    render(
      <ResizableSidebar sidebar={makeSidebar()}>
        <div data-testid="child">Hello</div>
      </ResizableSidebar>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("renders at specified width", () => {
    const { container } = render(
      <ResizableSidebar sidebar={makeSidebar({ width: 350 })}>
        <div>Content</div>
      </ResizableSidebar>,
    );
    // The outer div should have width style
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper?.style.width).toBe("350px");
  });

  it("shows collapsed strip with expand button when collapsed", () => {
    render(
      <ResizableSidebar sidebar={makeSidebar({ collapsed: true })}>
        <div data-testid="child">Hidden</div>
      </ResizableSidebar>,
    );
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByTestId("sidebar-expand")).toBeTruthy();
  });

  it("calls toggleCollapse when drag handle is clicked twice rapidly", () => {
    const sidebar = makeSidebar();
    render(
      <ResizableSidebar sidebar={sidebar}>
        <div>Content</div>
      </ResizableSidebar>,
    );
    const handle = screen.getByTestId("drag-handle");
    // The component uses custom double-click detection via two mouseDown events within 300ms
    fireEvent.mouseDown(handle);
    fireEvent.mouseDown(handle);
    expect(sidebar.toggleCollapse).toHaveBeenCalledOnce();
  });

  it("calls toggleCollapse when expand button clicked", () => {
    const sidebar = makeSidebar({ collapsed: true });
    render(
      <ResizableSidebar sidebar={sidebar}>
        <div>Content</div>
      </ResizableSidebar>,
    );
    fireEvent.click(screen.getByTestId("sidebar-expand"));
    expect(sidebar.toggleCollapse).toHaveBeenCalledOnce();
  });

  it("calls setWidth on drag end", () => {
    const sidebar = makeSidebar();
    render(
      <ResizableSidebar sidebar={sidebar}>
        <div>Content</div>
      </ResizableSidebar>,
    );
    const handle = screen.getByTestId("drag-handle");
    fireEvent.mouseDown(handle);
    fireEvent.mouseUp(document, { clientX: 400 });
    expect(sidebar.setWidth).toHaveBeenCalledWith(400);
  });

  it("toggles collapse on double-click of drag handle", () => {
    const sidebar = makeSidebar();
    render(
      <ResizableSidebar sidebar={sidebar}>
        <div>Content</div>
      </ResizableSidebar>,
    );
    const handle = screen.getByTestId("drag-handle");

    // Simulate double-click (two fast clicks)
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now).mockReturnValueOnce(now + 100);

    fireEvent.mouseDown(handle);
    fireEvent.mouseDown(handle);

    expect(sidebar.toggleCollapse).toHaveBeenCalledOnce();
  });

  it("renders drag handle", () => {
    render(
      <ResizableSidebar sidebar={makeSidebar()}>
        <div>Content</div>
      </ResizableSidebar>,
    );
    expect(screen.getByTestId("drag-handle")).toBeTruthy();
  });
});
