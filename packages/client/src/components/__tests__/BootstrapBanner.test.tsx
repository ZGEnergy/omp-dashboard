/**
 * Tests for the bootstrap-install status banner.
 *
 * See change: unified-bootstrap-install \u00a76.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import { BootstrapBanner } from "../BootstrapBanner";
import type { BootstrapStateSnapshot } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

describe("BootstrapBanner", () => {
  it("renders nothing when state is null", () => {
    const { container } = render(<BootstrapBanner state={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when status is ready and no upgrade hints", () => {
    const state: BootstrapStateSnapshot = { status: "ready" };
    const { container } = render(<BootstrapBanner state={state} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows upgrade hint when upgradeRecommended is true", () => {
    const state: BootstrapStateSnapshot = {
      status: "ready",
      compatibility: {
        minimum: "0.6.7",
        recommended: "0.6.7",
        maximum: null,
        current: "0.5.1",
        upgradeRecommended: true,
      },
    };
    const { getByTestId } = render(<BootstrapBanner state={state} />);
    const banner = getByTestId("bootstrap-banner-upgrade-hint");
    expect(banner.textContent).toContain("newer version");
    expect(banner.textContent).toContain("0.5.1");
  });

  it("shows dashboard-upgrade hint when upgradeDashboard is true", () => {
    const state: BootstrapStateSnapshot = {
      status: "ready",
      compatibility: {
        minimum: "0.6.7",
        recommended: "0.6.7",
        maximum: "0.9.x",
        current: "0.10.0",
        upgradeDashboard: true,
      },
    };
    const { getByTestId } = render(<BootstrapBanner state={state} />);
    expect(getByTestId("bootstrap-banner-upgrade-dashboard").textContent).toContain("dashboard");
  });

  it("renders installing banner with progress line", () => {
    const state: BootstrapStateSnapshot = {
      status: "installing",
      progress: { step: "pi-coding-agent", output: "fetching metadata" },
    };
    const { getByTestId } = render(<BootstrapBanner state={state} />);
    const banner = getByTestId("bootstrap-banner-installing");
    expect(banner.textContent).toContain("Installing pi");
    expect(banner.textContent).toContain("pi-coding-agent");
    expect(banner.textContent).toContain("fetching metadata");
  });

  it("renders failed banner with error message and Retry", () => {
    const onRetry = vi.fn();
    const state: BootstrapStateSnapshot = {
      status: "failed",
      error: { message: "network unreachable" },
    };
    const { getByTestId } = render(<BootstrapBanner state={state} onRetry={onRetry} />);
    const banner = getByTestId("bootstrap-banner-failed");
    expect(banner.textContent).toContain("pi install failed");
    expect(banner.textContent).toContain("network unreachable");
    fireEvent.click(getByTestId("bootstrap-banner-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the Retry button when onRetry is not provided", () => {
    const state: BootstrapStateSnapshot = {
      status: "failed",
      error: { message: "oops" },
    };
    const { queryByTestId } = render(<BootstrapBanner state={state} />);
    expect(queryByTestId("bootstrap-banner-retry")).toBeNull();
  });
});
