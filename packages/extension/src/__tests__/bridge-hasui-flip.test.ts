/**
 * Tests for `flipHasUI` — pure helper invoked by bridge.ts in `session_start`
 * AFTER the PromptBus wrappers have been installed on `ctx.ui.*`. Flips
 * `ctx.hasUI` to `true` so extensions that branch on it (`context-mode`,
 * `pi-agent-browser`, etc.) take their UI-present branch and render output
 * through the proxied `ctx.ui.notify` instead of returning unrendered data.
 *
 * Spec: openspec/changes/fix-bridge-hasui-for-headless-rpc/
 *       specs/bridge-extension/spec.md — requirement
 *       "Bridge SHALL flip `ctx.hasUI` to `true` after wiring the UI proxy".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { flipHasUI } from "../hasui-flip.js";

describe("flipHasUI", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("headless RPC: flips ctx.hasUI from false to true", () => {
    const ctx: { hasUI: boolean } = { hasUI: false };
    flipHasUI(ctx);
    expect(ctx.hasUI).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("tmux: no-op when ctx.hasUI is already true", () => {
    const ctx: { hasUI: boolean } = { hasUI: true };
    flipHasUI(ctx);
    expect(ctx.hasUI).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("undefined ctx.hasUI is flipped to true", () => {
    const ctx: { hasUI?: boolean } = {};
    flipHasUI(ctx);
    expect(ctx.hasUI).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("pi >=0.80 configurable getter: redefines descriptor, flips to true, no warn", () => {
    // Real shape of pi's extension-context `get hasUI()` — an own accessor
    // that is configurable, so it can be redefined via defineProperty.
    const ctx: Record<string, unknown> = {};
    Object.defineProperty(ctx, "hasUI", {
      configurable: true,
      enumerable: true,
      get: () => false,
      // No setter — assignment throws TypeError; defineProperty must be used.
    });

    expect(() => flipHasUI(ctx)).not.toThrow();
    expect((ctx as { hasUI: boolean }).hasUI).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("non-configurable getter: swallows error, logs warning exactly once", () => {
    const ctx: Record<string, unknown> = {};
    Object.defineProperty(ctx, "hasUI", {
      configurable: false,
      get: () => false,
      // No setter and non-configurable — cannot assign or redefine.
    });

    expect(() => flipHasUI(ctx)).not.toThrow();
    expect((ctx as { hasUI: boolean }).hasUI).toBe(false); // unchanged
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[dashboard] failed to flip ctx.hasUI");
  });

  it("frozen ctx: swallows error, logs warning", () => {
    const ctx = Object.freeze({ hasUI: false });

    expect(() => flipHasUI(ctx)).not.toThrow();
    expect(ctx.hasUI).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[dashboard] failed to flip ctx.hasUI");
  });

  it("null ctx: no-op, no throw, no warn", () => {
    expect(() => flipHasUI(null as unknown as { hasUI?: boolean })).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("undefined ctx: no-op, no throw, no warn", () => {
    expect(() => flipHasUI(undefined as unknown as { hasUI?: boolean })).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not mutate sibling fields on ctx", () => {
    const ctx: Record<string, unknown> = {
      hasUI: false,
      cwd: "/tmp/foo",
      ui: { notify: vi.fn() },
      sessionManager: { getSessionId: () => "abc" },
    };
    const uiBefore = ctx.ui;
    const smBefore = ctx.sessionManager;

    flipHasUI(ctx as { hasUI: boolean });

    expect(ctx.hasUI).toBe(true);
    expect(ctx.cwd).toBe("/tmp/foo");
    expect(ctx.ui).toBe(uiBefore);
    expect(ctx.sessionManager).toBe(smBefore);
  });
});
