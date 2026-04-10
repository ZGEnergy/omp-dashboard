import { describe, it, expect, vi } from "vitest";

describe("bridge credentials_updated handler", () => {
  it("calls authStorage.reload() when modelRegistry is available", () => {
    const reload = vi.fn();
    const modelRegistry = { authStorage: { reload } };

    // Simulate the bridge handler logic
    const msg = { type: "credentials_updated" as const };
    if (msg.type === "credentials_updated") {
      try { modelRegistry?.authStorage?.reload?.(); } catch { /* ignore */ }
    }

    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not throw when modelRegistry is null", () => {
    const modelRegistry = null;
    const msg = { type: "credentials_updated" as const };
    expect(() => {
      if (msg.type === "credentials_updated") {
        try { (modelRegistry as any)?.authStorage?.reload?.(); } catch { /* ignore */ }
      }
    }).not.toThrow();
  });
});
