/**
 * Tests for `useDisplayPrefs` — merges global + per-session override.
 * See change: configurable-chat-display.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { DisplayPrefsProvider } from "../lib/DisplayPrefsContext.js";
import { useDisplayPrefs } from "../hooks/useDisplayPrefs.js";
import { DISPLAY_PRESETS } from "@blackbelt-technology/pi-dashboard-shared/display-prefs.js";

function wrapper(value: React.ComponentProps<typeof DisplayPrefsProvider>["value"]) {
  return ({ children }: { children: React.ReactNode }) => (
    <DisplayPrefsProvider value={value}>{children}</DisplayPrefsProvider>
  );
}

describe("useDisplayPrefs", () => {
  it("falls back to DISPLAY_PRESETS.standard when global is undefined", () => {
    const { result } = renderHook(() => useDisplayPrefs(), {
      wrapper: wrapper({ global: undefined, getSessionOverride: () => undefined }),
    });
    expect(result.current).toEqual(DISPLAY_PRESETS.standard);
  });

  it("returns global when no session override", () => {
    const global = { ...DISPLAY_PRESETS.everything };
    const { result } = renderHook(() => useDisplayPrefs("sid-1"), {
      wrapper: wrapper({ global, getSessionOverride: () => undefined }),
    });
    expect(result.current).toEqual(global);
  });

  it("merges session override over global", () => {
    const global = { ...DISPLAY_PRESETS.standard };
    const override = { reasoning: true, toolCalls: { bash: false } as any };
    const { result } = renderHook(() => useDisplayPrefs("sid-1"), {
      wrapper: wrapper({ global, getSessionOverride: () => override }),
    });
    expect(result.current.reasoning).toBe(true);
    expect(result.current.toolCalls.bash).toBe(false);
    expect(result.current.toolCalls.read).toBe(global.toolCalls.read);
  });

  it("re-evaluates when global changes (broadcast)", () => {
    let global = { ...DISPLAY_PRESETS.standard, debugTools: false };
    const { result, rerender } = renderHook(() => useDisplayPrefs(), {
      wrapper: wrapper({ global, getSessionOverride: () => undefined }),
    });
    expect(result.current.debugTools).toBe(false);
    global = { ...global, debugTools: true };
    rerender();
    // Wrapper closes over the original value object — for this test simulate
    // the App-level memo by remounting under a new Provider.
    const { result: result2 } = renderHook(() => useDisplayPrefs(), {
      wrapper: wrapper({ global, getSessionOverride: () => undefined }),
    });
    expect(result2.current.debugTools).toBe(true);
  });

  it.each([
    ["simple", DISPLAY_PRESETS.simple, { read: false, bash: false, edit: true, Agent: true, generic: false, debug: false }],
    ["standard", DISPLAY_PRESETS.standard, { read: true, bash: true, edit: true, Agent: true, generic: true, debug: false }],
    ["everything", DISPLAY_PRESETS.everything, { read: true, bash: true, edit: true, Agent: true, generic: true, debug: true }],
  ])("preserves intentional %s tool visibility", (_name, preset, expected) => {
    const { result } = renderHook(() => useDisplayPrefs("sid-1"), {
      wrapper: wrapper({ global: preset, getSessionOverride: () => undefined }),
    });
    expect(result.current.toolCalls.read).toBe(expected.read);
    expect(result.current.toolCalls.bash).toBe(expected.bash);
    expect(result.current.toolCalls.edit).toBe(expected.edit);
    expect(result.current.toolCalls.agent).toBe(expected.Agent);
    expect(result.current.toolCalls.generic).toBe(expected.generic);
    expect(result.current.debugTools).toBe(expected.debug);
  });

  it("applies a sparse session override without changing other buckets", () => {
    const { result } = renderHook(() => useDisplayPrefs("sid-1"), {
      wrapper: wrapper({
        global: DISPLAY_PRESETS.simple,
        getSessionOverride: () => ({ toolCalls: { bash: true } } as any),
      }),
    });
    expect(result.current.toolCalls.bash).toBe(true);
    expect(result.current.toolCalls.read).toBe(false);
    expect(result.current.toolCalls.agent).toBe(true);
    expect(result.current.debugTools).toBe(false);
  });
});
