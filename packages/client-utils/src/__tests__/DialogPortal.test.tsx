import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { DialogPortal } from "../DialogPortal.js";

afterEach(() => cleanup());

describe("DialogPortal", () => {
  it("renders children at document.body", () => {
    const { baseElement } = render(
      <div id="app-root">
        <DialogPortal>
          <div data-testid="dialog-content">Hello</div>
        </DialogPortal>
      </div>
    );
    // Child should be in body, not inside #app-root
    const content = baseElement.querySelector("[data-testid='dialog-content']");
    expect(content).toBeTruthy();
    expect(content!.textContent).toBe("Hello");
    // Should NOT be inside #app-root
    const appRoot = baseElement.querySelector("#app-root");
    expect(appRoot!.querySelector("[data-testid='dialog-content']")).toBeNull();
  });

  it("sets document.body overflow to hidden on mount", () => {
    document.body.style.overflow = "";
    render(
      <DialogPortal>
        <div>Dialog</div>
      </DialogPortal>
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores document.body overflow on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <DialogPortal>
        <div>Dialog</div>
      </DialogPortal>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("restores empty overflow on unmount when originally empty", () => {
    document.body.style.overflow = "";
    const { unmount } = render(
      <DialogPortal>
        <div>Dialog</div>
      </DialogPortal>
    );
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
