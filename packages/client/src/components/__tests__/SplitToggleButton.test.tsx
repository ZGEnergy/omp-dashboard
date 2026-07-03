import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SplitToggleButton } from "../SplitToggleButton.js";
import { SplitWorkspaceProvider } from "../SplitWorkspaceContext.js";
import { loadSplitState } from "../../lib/split-state.js";

afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

function renderWithProvider(sessionId = "s1") {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SplitWorkspaceProvider sessionId={sessionId} cwd="/proj" orientation="h">
      {children}
    </SplitWorkspaceProvider>
  );
  return render(<SplitToggleButton />, { wrapper });
}

describe("SplitToggleButton", () => {
  it("renders nothing outside a provider", () => {
    const { container } = render(<SplitToggleButton />);
    expect(container.firstChild).toBeNull();
  });

  it("toggles the split open and persists", () => {
    renderWithProvider("sTog");
    const btn = screen.getByTestId("split-toggle");
    expect(loadSplitState("sTog").open).toBe(false);
    fireEvent.click(btn);
    expect(loadSplitState("sTog").open).toBe(true);
    fireEvent.click(btn);
    expect(loadSplitState("sTog").open).toBe(false);
  });

  it("reflects open state via aria-pressed", () => {
    renderWithProvider("sAria");
    const btn = screen.getByTestId("split-toggle");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });
});
