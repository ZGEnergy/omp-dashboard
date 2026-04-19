import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { ErrorBanner } from "../ErrorBanner";

describe("ErrorBanner", () => {
  it("renders the error message", () => {
    const { getByTestId } = render(<ErrorBanner message="Rate limit exceeded" />);
    const banner = getByTestId("error-banner");
    expect(banner.textContent).toContain("Rate limit exceeded");
  });

  it("renders dismiss button when onDismiss is provided", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<ErrorBanner message="oops" onDismiss={onDismiss} />);
    fireEvent.click(getByTestId("error-banner-dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not render dismiss button when onDismiss is omitted", () => {
    const { queryByTestId } = render(<ErrorBanner message="oops" />);
    expect(queryByTestId("error-banner-dismiss")).toBeNull();
  });

  it("renders a Retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(<ErrorBanner message="oops" onRetry={onRetry} />);
    fireEvent.click(getByTestId("error-banner-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render Retry button when onRetry is omitted", () => {
    const { queryByTestId } = render(<ErrorBanner message="oops" />);
    expect(queryByTestId("error-banner-retry")).toBeNull();
  });

  it("collapses long messages and exposes a Show more toggle", () => {
    const long = "x".repeat(800);
    const { getByTestId, queryByTestId } = render(<ErrorBanner message={long} />);

    const text = getByTestId("error-banner-text");
    // Collapsed view truncates with an ellipsis.
    expect(text.textContent!.length).toBeLessThan(long.length);
    expect(text.textContent).toContain("…");

    const toggle = getByTestId("error-banner-toggle");
    expect(toggle.textContent).toMatch(/show more/i);
    fireEvent.click(toggle);

    // Expanded shows full text.
    expect(getByTestId("error-banner-text").textContent).toBe(long);
    expect(queryByTestId("error-banner-toggle")!.textContent).toMatch(/show less/i);
  });

  it("does not render a toggle for short messages", () => {
    const { queryByTestId } = render(<ErrorBanner message="short" />);
    expect(queryByTestId("error-banner-toggle")).toBeNull();
  });
});
