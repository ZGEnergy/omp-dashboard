/**
 * Unit tests for the unified SessionBanner component.
 *
 * Variants: hidden, retrying, error, limit-exceeded. The variant selector
 * (`deriveBannerState`) is tested in event-reducer.test.ts; here we test
 * the rendered output + action callbacks given an already-derived
 * BannerState.
 *
 * See change: unify-status-banner-and-terminal-limit-stop.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { SessionBanner } from "../SessionBanner";

// vitest.config.ts does not enable @testing-library/react's auto-cleanup
// (no `globals: true`), so we clean up manually between tests to avoid
// duplicate DOM nodes leaking across renders.
afterEach(() => cleanup());

describe("SessionBanner variant rendering", () => {
  it("hidden variant renders nothing in the DOM", () => {
    const { container } = render(<SessionBanner state={{ variant: "hidden" }} />);
    expect(container.firstChild).toBeNull();
  });

  describe("retrying variant", () => {
    it("renders attempt + reason + Stop with countdown when delayMs > 0", () => {
      const onAbort = vi.fn();
      const { container, getByTestId } = render(
        <SessionBanner
          state={{
            variant: "retrying",
            attempt: 2,
            maxAttempts: 3,
            delayMs: 4000,
            reason: "rate limit exceeded",
            startedAt: 1_000_000,
          }}
          onAbort={onAbort}
          now={() => 1_001_000} // 1s elapsed of 4s
        />,
      );
      expect(getByTestId("retry-banner")).toBeTruthy();
      expect(getByTestId("retry-banner-attempt").textContent).toMatch(/2.*3/);
      expect(getByTestId("retry-banner-countdown").textContent).toBe("3s");
      expect(getByTestId("retry-banner-reason").textContent).toBe("rate limit exceeded");
      fireEvent.click(getByTestId("retry-banner-stop"));
      expect(onAbort).toHaveBeenCalledOnce();

      // No error-banner DOM
      expect(container.querySelector('[data-testid="error-banner"]')).toBeNull();
    });

    it("renders indeterminate state when delayMs is sentinel -1", () => {
      const { getByTestId } = render(
        <SessionBanner
          state={{
            variant: "retrying",
            attempt: 1,
            maxAttempts: -1,
            delayMs: -1,
            reason: "rate limit",
            startedAt: 0,
          }}
        />,
      );
      expect(getByTestId("retry-banner-indeterminate")).toBeTruthy();
    });

    it("countdown clamps to 0, never negative", () => {
      const { getByTestId } = render(
        <SessionBanner
          state={{
            variant: "retrying",
            attempt: 1,
            maxAttempts: 3,
            delayMs: 1000,
            reason: "x",
            startedAt: 0,
          }}
          now={() => 5000} // already past the target by 4s
        />,
      );
      expect(getByTestId("retry-banner-countdown").textContent).toBe("0s");
    });

    it("hides Stop button when onAbort omitted", () => {
      const { container } = render(
        <SessionBanner
          state={{
            variant: "retrying",
            attempt: 1,
            maxAttempts: -1,
            delayMs: -1,
            reason: "x",
            startedAt: 0,
          }}
        />,
      );
      expect(container.querySelector('[data-testid="retry-banner-stop"]')).toBeNull();
    });
  });

  describe("error variant", () => {
    it("renders message + Retry + Dismiss, fires callbacks", () => {
      const onRetry = vi.fn();
      const onDismiss = vi.fn();
      const { getByTestId } = render(
        <SessionBanner
          state={{ variant: "error", message: "fetch failed: ECONNRESET" }}
          onRetry={onRetry}
          onDismiss={onDismiss}
        />,
      );
      expect(getByTestId("error-banner")).toBeTruthy();
      expect(getByTestId("error-banner-text").textContent).toContain("fetch failed: ECONNRESET");
      fireEvent.click(getByTestId("error-banner-retry"));
      expect(onRetry).toHaveBeenCalledOnce();
      fireEvent.click(getByTestId("error-banner-dismiss"));
      expect(onDismiss).toHaveBeenCalledOnce();
    });

    it("hides Retry button when onRetry omitted", () => {
      const { container } = render(
        <SessionBanner state={{ variant: "error", message: "x" }} onDismiss={vi.fn()} />,
      );
      expect(container.querySelector('[data-testid="error-banner-retry"]')).toBeNull();
    });

    it("truncates long messages with Show more / Show less toggle", () => {
      const long = "a".repeat(300);
      const { container, getByTestId } = render(
        <SessionBanner state={{ variant: "error", message: long }} collapseThreshold={240} />,
      );
      const text = getByTestId("error-banner-text").textContent ?? "";
      expect(text.length).toBeLessThan(long.length); // truncated
      expect(text.endsWith("…")).toBe(true);
      const toggle = getByTestId("error-banner-toggle");
      expect(toggle.textContent).toBe("Show more");
      fireEvent.click(toggle);
      expect(getByTestId("error-banner-text").textContent).toBe(long);
      expect(getByTestId("error-banner-toggle").textContent).toBe("Show less");

      // No limit-exceeded hint on the error variant.
      expect(container.querySelector('[data-testid="limit-exceeded-hint"]')).toBeNull();
    });

    it("short message has no toggle", () => {
      const { container } = render(
        <SessionBanner state={{ variant: "error", message: "short" }} collapseThreshold={240} />,
      );
      expect(container.querySelector('[data-testid="error-banner-toggle"]')).toBeNull();
    });
  });

  describe("limit-exceeded variant", () => {
    it("renders message + Dismiss + hint, NO Retry button", () => {
      const onRetry = vi.fn();
      const onDismiss = vi.fn();
      const { container, getByTestId } = render(
        <SessionBanner
          state={{ variant: "limit-exceeded", message: "monthly_spending_cap exceeded" }}
          onRetry={onRetry}
          onDismiss={onDismiss}
        />,
      );
      // legacy test-id retained for both red variants
      expect(getByTestId("error-banner")).toBeTruthy();
      // new variant-specific test-id
      expect(getByTestId("limit-exceeded-banner")).toBeTruthy();
      expect(getByTestId("limit-exceeded-hint").textContent).toBe("Session stopped automatically.");
      expect(getByTestId("error-banner-text").textContent).toContain("monthly_spending_cap");
      // Retry button MUST be absent on limit-exceeded.
      expect(container.querySelector('[data-testid="error-banner-retry"]')).toBeNull();
      fireEvent.click(getByTestId("error-banner-dismiss"));
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe("legacy data-testid compatibility", () => {
    it("error and limit-exceeded variants both expose `error-banner` test-id", () => {
      const errR = render(<SessionBanner state={{ variant: "error", message: "x" }} />);
      const limR = render(<SessionBanner state={{ variant: "limit-exceeded", message: "usage_limit_reached" }} />);
      expect(errR.container.querySelector('[data-testid="error-banner"]')).not.toBeNull();
      expect(limR.container.querySelector('[data-testid="error-banner"]')).not.toBeNull();
    });

    it("error and limit-exceeded variants both expose `error-banner-dismiss` test-id when onDismiss supplied", () => {
      const errR = render(<SessionBanner state={{ variant: "error", message: "x" }} onDismiss={vi.fn()} />);
      const limR = render(<SessionBanner state={{ variant: "limit-exceeded", message: "y" }} onDismiss={vi.fn()} />);
      expect(errR.container.querySelector('[data-testid="error-banner-dismiss"]')).not.toBeNull();
      expect(limR.container.querySelector('[data-testid="error-banner-dismiss"]')).not.toBeNull();
    });
  });
});
