import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt } from "../useInstallPrompt.js";

beforeEach(() => {
  vi.restoreAllMocks();
  // Default matchMedia stub (non-standalone) — define if missing in jsdom
  window.matchMedia = window.matchMedia || (() => ({ matches: false }) as MediaQueryList);
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: false,
  } as MediaQueryList);
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0",
    configurable: true,
  });
});

describe("useInstallPrompt", () => {
  it("starts with canInstall=false", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("sets canInstall=true when beforeinstallprompt fires", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = new Event("beforeinstallprompt") as any;
    event.preventDefault = vi.fn();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.canInstall).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("prompt() triggers deferred event and resets canInstall", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const promptFn = vi.fn().mockResolvedValue({ outcome: "accepted" });
    const event = new Event("beforeinstallprompt") as any;
    event.preventDefault = vi.fn();
    event.prompt = promptFn;
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await result.current.prompt();
    });
    expect(promptFn).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  it("prompt() is a no-op when no deferred event", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    // Should not throw
    await act(async () => {
      await result.current.prompt();
    });
    expect(result.current.canInstall).toBe(false);
  });

  it("detects standalone mode via matchMedia", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstalled).toBe(true);
  });

  it("isInstalled is false when not standalone", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstalled).toBe(false);
  });

  it("detects iOS from user agent", () => {
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isIOS).toBe(true);
  });

  it("isIOS is false on non-iOS", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0",
      configurable: true,
    });
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isIOS).toBe(false);
  });

  it("isIOS is false when standalone on iOS (already installed)", () => {
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isIOS).toBe(false);
    expect(result.current.isInstalled).toBe(true);
  });
});
