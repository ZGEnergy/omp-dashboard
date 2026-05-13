/**
 * Tests for goBackOrHome — the universal back-arrow helper that replaced
 * the priority-chain selectDesktopBackTarget after overlay-url-routing.
 *
 * Scenarios mirror the spec deltas:
 *   - "Back from sidebar-opened overlay returns to prior URL" — exercised via
 *     window.history.back() when length > 1
 *   - "Back from session detail with empty history" — fallback to navigate("/")
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { goBackOrHome } from "../history-back.js";

describe("goBackOrHome", () => {
  let originalBack: typeof window.history.back;
  let originalLength: number;

  beforeEach(() => {
    originalBack = window.history.back;
    originalLength = window.history.length;
  });

  afterEach(() => {
    window.history.back = originalBack;
    Object.defineProperty(window.history, "length", {
      value: originalLength,
      configurable: true,
    });
  });

  function setHistoryLength(n: number) {
    Object.defineProperty(window.history, "length", {
      value: n,
      configurable: true,
    });
  }

  it("calls window.history.back() when length > 1", () => {
    setHistoryLength(3);
    const back = vi.fn();
    window.history.back = back;
    const navigate = vi.fn();

    goBackOrHome(navigate);

    expect(back).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to navigate('/') when length === 1 (cold load)", () => {
    setHistoryLength(1);
    const back = vi.fn();
    window.history.back = back;
    const navigate = vi.fn();

    goBackOrHome(navigate);

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
