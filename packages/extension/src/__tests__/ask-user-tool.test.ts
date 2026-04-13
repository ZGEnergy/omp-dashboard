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

  describe("message passthrough", () => {
    function getToolAndMockCtx() {
      const pi = createMockPi();
      registerAskUserTool(pi as any);
      const tool = pi.registerTool.mock.calls[0][0];
      const ctx = {
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
          select: vi.fn().mockResolvedValue("A"),
          input: vi.fn().mockResolvedValue("hello"),
          multiselect: vi.fn().mockResolvedValue(["A"]),
        },
      };
      return { tool, ctx };
    }

    it("passes message through opts for input", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "input", title: "Q", message: "Details here" }, undefined, undefined, ctx);
      expect(ctx.ui.input).toHaveBeenCalledWith("Q", undefined, { message: "Details here" });
    });

    it("passes message through opts for select", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "select", title: "Pick", message: "Context", options: ["A", "B"] }, undefined, undefined, ctx);
      expect(ctx.ui.select).toHaveBeenCalledWith("Pick", ["A", "B"], { message: "Context" });
    });

    it("passes message through opts for multiselect", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "multiselect", title: "Multi", message: "Info", options: ["A"] }, undefined, undefined, ctx);
      expect(ctx.ui.multiselect).toHaveBeenCalledWith("Multi", ["A"], { message: "Info" });
    });

    it("does not pass opts when message is undefined", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "input", title: "Q" }, undefined, undefined, ctx);
      expect(ctx.ui.input).toHaveBeenCalledWith("Q", undefined, undefined);
    });
  });
});
