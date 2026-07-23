import { cleanup, fireEvent, render } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mobileHolder = vi.hoisted(() => ({ isMobile: false }));
vi.mock("../../../hooks/useMobile.js", () => ({
  useMobile: () => mobileHolder.isMobile,
  MobileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import type { OpenFile } from "../../../lib/editor-pane-state.js";
import { EditorTabs } from "../EditorTabs.js";

const files: OpenFile[] = [{ path: "src/a.ts", viewer: "monaco" } as OpenFile];

afterEach(() => {
  cleanup();
  mobileHolder.isMobile = false;
});

function renderTabs(onClose = vi.fn()) {
  const utils = render(
    <EditorTabs
      openFiles={files}
      activeIndex={0}
      onActivate={() => {}}
      onClose={onClose}
      onReorder={() => {}}
    />,
  );
  return { onClose, ...utils };
}

describe("EditorTabs close control", () => {
  it("mobile: close × is always visible, ≥44px tap target, and closes on tap", () => {
    mobileHolder.isMobile = true;
    const { onClose, getByRole } = renderTabs();
    const btn = getByRole("button", { name: /close/i });

    expect(btn.className).not.toContain("opacity-0");
    expect(btn.className).toContain("opacity-100");
    expect(btn.className).toContain("min-h-[44px]");
    expect(btn.className).toContain("min-w-[44px]");

    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledWith(0);
  });

  it("desktop: close × stays hover-gated and has no 44px target", () => {
    mobileHolder.isMobile = false;
    const { getByRole } = renderTabs();
    const btn = getByRole("button", { name: /close/i });

    expect(btn.className).toContain("opacity-0");
    expect(btn.className).toContain("group-hover:opacity-100");
    expect(btn.className).not.toContain("min-h-[44px]");
  });
});
