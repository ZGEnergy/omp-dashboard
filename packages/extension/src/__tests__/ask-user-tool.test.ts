import { describe, it, expect, vi } from "vitest";

// Mock modules before importing
vi.mock("@sinclair/typebox", () => ({
  Type: {
    Object: vi.fn(() => ({})),
    String: vi.fn(() => ({})),
    Optional: vi.fn((x: any) => x),
    Array: vi.fn(() => ({})),
    Union: vi.fn(() => ({})),
    Literal: vi.fn(() => ({})),
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

    it("falls back to message when title is missing", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "input", message: "Detailed question" }, undefined, undefined, ctx);
      expect(ctx.ui.input).toHaveBeenCalledWith("Detailed question", undefined, { message: "Detailed question" });
    });

    it("falls back to 'Question' when both title and message are missing", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "confirm" }, undefined, undefined, ctx);
      expect(ctx.ui.confirm).toHaveBeenCalledWith("Question", "");
    });

    it("parses options from JSON string", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await tool.execute("id", { method: "select", title: "Pick", options: '["A", "B"]' }, undefined, undefined, ctx);
      expect(ctx.ui.select).toHaveBeenCalledWith("Pick", ["A", "B"], undefined);
    });

    it("throws when select reaches execute with unparseable options string", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await expect(
        tool.execute("id", { method: "select", title: "Pick", options: "not json" }, undefined, undefined, ctx),
      ).rejects.toThrow(/options/i);
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it("throws when select is invoked with empty options array", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await expect(
        tool.execute("id", { method: "select", title: "Pick", options: [] }, undefined, undefined, ctx),
      ).rejects.toThrow(/options.*input/is);
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it("throws when multiselect is invoked without options", async () => {
      const { tool, ctx } = getToolAndMockCtx();
      await expect(
        tool.execute("id", { method: "multiselect", title: "Pick" }, undefined, undefined, ctx),
      ).rejects.toThrow(/options/i);
      expect(ctx.ui.multiselect).not.toHaveBeenCalled();
    });
  });

  describe("prepareArguments", () => {
    function getTool() {
      const pi = createMockPi();
      registerAskUserTool(pi as any);
      return pi.registerTool.mock.calls[0][0];
    }

    it("parses stringified options array", () => {
      const tool = getTool();
      const result = tool.prepareArguments({ method: "select", title: "Pick", options: '["A", "B"]' });
      expect(result.options).toEqual(["A", "B"]);
    });

    it("leaves real array options unchanged", () => {
      const tool = getTool();
      const result = tool.prepareArguments({ method: "select", title: "Pick", options: ["A", "B"] });
      expect(result.options).toEqual(["A", "B"]);
    });

    it("leaves malformed string as-is", () => {
      const tool = getTool();
      const result = tool.prepareArguments({ method: "select", title: "Pick", options: "not json" });
      expect(result.options).toBe("not json");
    });

    it("unwraps stringified params wrapper", () => {
      const tool = getTool();
      const result = tool.prepareArguments({
        method: "select",
        params: '{"title":"X","options":["a","b"]}',
      });
      expect(result.method).toBe("select");
      expect(result.title).toBe("X");
      expect(result.options).toEqual(["a", "b"]);
      expect(result.params).toBeUndefined();
    });

    it("unwraps object-form params wrapper", () => {
      const tool = getTool();
      const result = tool.prepareArguments({
        method: "select",
        params: { title: "X", options: ["a", "b"] },
      });
      expect(result.method).toBe("select");
      expect(result.title).toBe("X");
      expect(result.options).toEqual(["a", "b"]);
      expect(result.params).toBeUndefined();
    });

    it("copies question into title when title is absent", () => {
      const tool = getTool();
      const result = tool.prepareArguments({ method: "input", question: "Your name?" });
      expect(result.title).toBe("Your name?");
    });

    it("does not overwrite explicit title with question", () => {
      const tool = getTool();
      const result = tool.prepareArguments({ method: "input", title: "T", question: "Q" });
      expect(result.title).toBe("T");
    });

    it("top-level fields win over params wrapper", () => {
      const tool = getTool();
      const result = tool.prepareArguments({
        method: "select",
        title: "OuterTitle",
        params: { title: "InnerTitle", options: ["a", "b"] },
      });
      expect(result.title).toBe("OuterTitle");
      expect(result.options).toEqual(["a", "b"]);
    });

    it("rescues options JSON string inside params wrapper", () => {
      const tool = getTool();
      const result = tool.prepareArguments({
        method: "select",
        params: '{"title":"X","options":"[\\"a\\",\\"b\\"]"}',
      });
      expect(result.options).toEqual(["a", "b"]);
    });
  });
});
