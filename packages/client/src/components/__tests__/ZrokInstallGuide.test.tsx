import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { ZrokInstallGuide } from "../ZrokInstallGuide.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ status: "unavailable", serverOs: "darwin" }),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ZrokInstallGuide", () => {
  it("should render the guide with back button", () => {
    render(<ZrokInstallGuide onBack={vi.fn()} />);
    expect(screen.getByTestId("tunnel-guide-back")).toBeDefined();
    expect(screen.getByText(/Tunnel Setup/)).toBeDefined();
  });

  it("should call onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<ZrokInstallGuide onBack={onBack} />);
    fireEvent.click(screen.getByTestId("tunnel-guide-back"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("should show a link to official docs", () => {
    render(<ZrokInstallGuide onBack={vi.fn()} />);
    expect(screen.getByText("Official zrok documentation")).toBeDefined();
  });
});
