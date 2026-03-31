import { describe, it, expect, vi } from "vitest";

// Mock modules before importing
vi.mock("@sinclair/typebox", () => ({
  Type: {
    Object: vi.fn(() => ({})),
    String: vi.fn(() => ({})),
    Optional: vi.fn((x: any) => x),
    Array: vi.fn(() => ({})),
  },
}));

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: vi.fn(() => ({})),
}));

import { registerAskUserTool } from "../ask-user-tool.js";

function createMockPi() {
  return {
    registerTool: vi.fn(),
  };
}

describe("registerAskUserTool", () => {
  it("registers ask_user tool", () => {
    const pi = createMockPi();
    registerAskUserTool(pi as any);

    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(pi.registerTool.mock.calls[0][0].name).toBe("ask_user");
  });

  it("registers with correct methods", () => {
    const pi = createMockPi();
    registerAskUserTool(pi as any);

    const tool = pi.registerTool.mock.calls[0][0];
    expect(tool.name).toBe("ask_user");
    expect(tool.execute).toBeTypeOf("function");
    expect(tool.promptGuidelines).toBeDefined();
    expect(tool.promptGuidelines.length).toBeGreaterThan(0);
  });
});
