import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectCodeServerBinary, resetDetectionCache } from "../editor-detection.js";
import type { EditorConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

const DEFAULT_CONFIG: EditorConfig = { idleTimeoutMinutes: 10, maxInstances: 3 };

describe("detectCodeServerBinary", () => {
  beforeEach(() => {
    resetDetectionCache();
  });

  it("returns config override when binary is set", () => {
    const whichFn = vi.fn();
    const result = detectCodeServerBinary({ ...DEFAULT_CONFIG, binary: "/opt/code-server" }, whichFn);
    expect(result).toEqual({ available: true, binary: "/opt/code-server" });
    expect(whichFn).not.toHaveBeenCalled();
  });

  it("detects code-server on PATH", () => {
    const whichFn = vi.fn().mockReturnValueOnce("/usr/local/bin/code-server");
    const result = detectCodeServerBinary(DEFAULT_CONFIG, whichFn);
    expect(result).toEqual({ available: true, binary: "/usr/local/bin/code-server" });
    expect(whichFn).toHaveBeenCalledWith("code-server");
  });

  it("falls back to openvscode-server", () => {
    const whichFn = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("/usr/bin/openvscode-server");
    const result = detectCodeServerBinary(DEFAULT_CONFIG, whichFn);
    expect(result).toEqual({ available: true, binary: "/usr/bin/openvscode-server" });
    expect(whichFn).toHaveBeenCalledTimes(2);
  });

  it("returns not available when nothing found", () => {
    const whichFn = vi.fn().mockReturnValue(null);
    const result = detectCodeServerBinary(DEFAULT_CONFIG, whichFn);
    expect(result).toEqual({ available: false });
  });

  it("caches result across calls", () => {
    const whichFn = vi.fn().mockReturnValue("/usr/local/bin/code-server");
    detectCodeServerBinary(DEFAULT_CONFIG, whichFn);
    detectCodeServerBinary(DEFAULT_CONFIG, whichFn);
    // Only called once due to caching
    expect(whichFn).toHaveBeenCalledTimes(1);
  });

  it("re-detects after cache reset", () => {
    const whichFn1 = vi.fn().mockReturnValue("/usr/local/bin/code-server");
    const first = detectCodeServerBinary(DEFAULT_CONFIG, whichFn1);
    expect(first.available).toBe(true);

    resetDetectionCache();

    const whichFn2 = vi.fn().mockReturnValue(null);
    const second = detectCodeServerBinary(DEFAULT_CONFIG, whichFn2);
    expect(second).toEqual({ available: false });
  });
});
