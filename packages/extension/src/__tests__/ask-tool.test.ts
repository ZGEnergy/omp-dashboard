/**
 * Tests for the bridge-registered core-named `ask` tool.
 * Covers registration + single/multi question PromptBus routing.
 */
import { describe, it, expect, vi } from "vitest";

function schema(type: string, options: Record<string, unknown> = {}) {
  return { type, ...options };
}

vi.mock("typebox", () => ({
  Type: {
    Object: vi.fn((properties: Record<string, unknown>, options: Record<string, unknown> = {}) =>
      schema("object", { properties, ...options })),
    String: vi.fn((options: Record<string, unknown> = {}) => schema("string", options)),
    Optional: vi.fn((value: unknown) => value),
    Array: vi.fn((items: unknown, options: Record<string, unknown> = {}) =>
      schema("array", { items, ...options })),
    Boolean: vi.fn((options: Record<string, unknown> = {}) => schema("boolean", options)),
    Number: vi.fn((options: Record<string, unknown> = {}) => schema("number", options)),
  },
}));

vi.mock("../multiselect-polyfill.js", () => ({
  polyfillMultiselect: vi.fn(async (_ctx: unknown, _title: string, _opts: string[]) => ["A", "B"]),
}));

import { registerAskTool } from "../ask-tool.js";
import { polyfillMultiselect } from "../multiselect-polyfill.js";

function createMockPi() {
  return { registerTool: vi.fn() };
}

type RegisteredTool = {
  name: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      items?: { type: string; properties: Record<string, unknown> };
    }>;
  };
  execute: (
    toolCallId: string,
    params: unknown,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<unknown>;
  prepareArguments?: (args: unknown) => unknown;
};

function getTool(): RegisteredTool {
  const pi = createMockPi();
  registerAskTool(pi as never);
  return pi.registerTool.mock.calls[0][0] as RegisteredTool;
}

describe("registerAskTool", () => {
  it("registers a tool named ask", () => {
    const pi = createMockPi();
    registerAskTool(pi as never);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(pi.registerTool.mock.calls[0][0].name).toBe("ask");
  });
  it("registers a flat core-compatible question schema", () => {
    const tool = getTool();
    expect(tool.parameters.type).toBe("object");
    expect(Object.keys(tool.parameters.properties)).toEqual(["questions"]);

    const questions = tool.parameters.properties.questions;
    expect(questions.type).toBe("array");
    expect(questions.items?.type).toBe("object");
    expect(Object.keys(questions.items?.properties ?? {})).toEqual([
      "id",
      "question",
      "header",
      "options",
      "multi",
      "recommended",
    ]);
  });

  it("single select routes through ctx.ui.select and returns selectedOptions", async () => {
    const tool = getTool();
    const select = vi.fn(async () => "Blue");
    const ctx = { ui: { select, input: vi.fn(), batch: vi.fn() } };
    const result = (await tool.execute(
      "tc1",
      {
        questions: [
          {
            id: "color",
            question: "Favorite color?",
            options: [{ label: "Red" }, { label: "Blue" }],
          },
        ],
      },
      undefined,
      undefined,
      ctx,
    )) as { content: Array<{ text: string }>; details: { selectedOptions: string[] } };

    expect(select).toHaveBeenCalledTimes(1);
    const selectCall = select.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(selectCall[0]).toBe("Favorite color?");
    expect(selectCall[1]).toEqual(["Red", "Blue"]);
    expect(selectCall[2]).toMatchObject({ toolCallId: "tc1" });
    expect(result.details.selectedOptions).toEqual(["Blue"]);
    expect(result.content[0]?.text).toContain("User answered ask");
  });

  it("multi question uses ui.batch when available", async () => {
    const tool = getTool();
    const batch = vi.fn(async () => [{ value: "yes" }, { values: ["a", "b"] }]);
    const ctx = {
      ui: {
        select: vi.fn(),
        input: vi.fn(),
        batch,
      },
    };
    const result = (await tool.execute(
      "tc2",
      {
        questions: [
          {
            id: "q1",
            question: "Proceed?",
            options: [{ label: "yes" }, { label: "no" }],
          },
          {
            id: "q2",
            question: "Pick many",
            multi: true,
            options: [{ label: "a" }, { label: "b" }, { label: "c" }],
          },
        ],
      },
      undefined,
      undefined,
      ctx,
    )) as { details: { results: Array<{ id: string; selectedOptions: string[] }>; cancelled: boolean } };

    expect(batch).toHaveBeenCalledTimes(1);
    expect(result.details.cancelled).toBe(false);
    expect(result.details.results).toHaveLength(2);
    expect(result.details.results[0]?.selectedOptions).toEqual(["yes"]);
    expect(result.details.results[1]?.selectedOptions).toEqual(["a", "b"]);
  });

  it("multi:true single question uses polyfillMultiselect", async () => {
    const tool = getTool();
    const ctx = { ui: { select: vi.fn(), input: vi.fn() } };
    const result = (await tool.execute(
      "tc3",
      {
        questions: [
          {
            id: "tags",
            question: "Tags?",
            multi: true,
            options: [{ label: "A" }, { label: "B" }, { label: "C" }],
          },
        ],
      },
      undefined,
      undefined,
      ctx,
    )) as { details: { selectedOptions: string[] } };

    expect(polyfillMultiselect).toHaveBeenCalled();
    expect(result.details.selectedOptions).toEqual(["A", "B"]);
  });

  it("prepareArguments backfills missing question ids", () => {
    const tool = getTool();
    const prepared = tool.prepareArguments?.({
      questions: [{ question: "Only text", options: [] }],
    }) as { questions: Array<{ id: string }> };
    expect(prepared.questions[0]?.id).toBe("q1");
  });
});
