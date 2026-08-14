import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { PromptBus } from "../prompt-bus.js";
import { registerProposeTool } from "../propose-tool.js";
function createMockPi() {
  const tools = new Map<string, { name: string; parameters?: unknown; execute: (...args: unknown[]) => Promise<unknown> }>();
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown>>>();
  const emittedEvents: Array<{ event: string; payload: unknown }> = [];

  return {
    tools,
    handlers,
    emittedEvents,
    registerTool: (def: { name: string; parameters?: unknown; execute: (...args: unknown[]) => Promise<unknown> }) => {
      tools.set(def.name, def);
    },
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    async fireToolCall(event: unknown, ctx: unknown = {}) {
      const list = handlers.get("tool_call") ?? [];
      let lastResult: unknown;
      for (const handler of list) {
        const res = await handler(event, ctx);
        if (res !== undefined) {
          lastResult = res;
        }
      }
      return lastResult;
    },
    events: {
      emit: (event: string, payload: unknown) => {
        emittedEvents.push({ event, payload });
      },
    },
  };
}

describe("registerProposeTool", () => {
  it("registers propose tool and subscribes to tool_call event without re-registering write tool", () => {
    const pi = createMockPi();
    registerProposeTool(pi as unknown as ExtensionAPI, () => undefined);
    expect(pi.tools.has("write")).toBe(false);
    expect(pi.tools.has("propose")).toBe(true);
    expect(pi.handlers.has("tool_call")).toBe(true);
  });

  it("includes parameters schema on registered propose tool", () => {
    const pi = createMockPi();
    registerProposeTool(pi as unknown as ExtensionAPI, () => undefined);
    const proposeTool = pi.tools.get("propose");
    expect(proposeTool).toBeDefined();
    expect(proposeTool?.parameters).toBeDefined();
    expect((proposeTool?.parameters as { type: string })?.type).toBe("object");
  });

  it("intercepts write xd://propose via tool_call hook and returns blocked result with reason on PromptBus approval", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Approve and execute",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus = { request: mockRequest } as unknown as PromptBus;
    const onPlanApproved = vi.fn();

    registerProposeTool(pi as unknown as ExtensionAPI, () => mockBus, { onPlanApproved });

    const result = await pi.fireToolCall({
      toolName: "write",
      toolCallId: "call-123",
      input: {
        path: "xd://propose",
        title: "Test Feature Plan",
        content: "# Test Feature Plan\n\n1. Step 1",
        planPath: "local://docs/plan.md",
      },
    });

    expect(result).toEqual({
      block: true,
      reason: "Plan approved by user. Proceeding to execution.",
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline: "plan-approval",
        type: "select",
        question: expect.stringContaining("Plan Approval: Test Feature Plan"),
        options: ["Approve and execute", "Refine plan", "Reject"],
        metadata: {
          toolCallId: "call-123",
          planPath: "docs/plan.md",
          xdevTool: "propose",
        },
      }),
      undefined,
    );
    expect(onPlanApproved).toHaveBeenCalledWith({
      toolCallId: "call-123",
      planPath: "docs/plan.md",
    });
    expect(pi.emittedEvents).toContainEqual({
      event: "plan:approved",
      payload: { toolCallId: "call-123", planPath: "docs/plan.md" },
    });
  });

  it("handles Refine plan answer via tool_call hook", async () => {
    const pi = createMockPi();
    const mockRequest = vi
      .fn()
      .mockResolvedValueOnce({
        id: "p1",
        answer: "Refine plan",
        cancelled: false,
        source: "dashboard",
      })
      .mockResolvedValueOnce({
        id: "p2",
        answer: "Needs more unit tests for auth edge cases",
        cancelled: false,
        source: "dashboard",
      });
    const mockBus = { request: mockRequest } as unknown as PromptBus;

    registerProposeTool(pi as unknown as ExtensionAPI, () => mockBus);

    const result = await pi.fireToolCall({
      toolName: "write",
      toolCallId: "call-456",
      input: {
        path: "xd://propose",
        content: "# Refine Plan Test\nBody",
      },
    });

    expect(result).toEqual({
      block: true,
      reason: "Plan refinement requested by user: Needs more unit tests for auth edge cases. Remaining in plan mode.",
    });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("handles Reject answer via tool_call hook", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Reject",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus = { request: mockRequest } as unknown as PromptBus;

    registerProposeTool(pi as unknown as ExtensionAPI, () => mockBus);

    const result = await pi.fireToolCall({
      toolName: "write",
      toolCallId: "call-789",
      input: {
        path: "xd://propose",
        content: "# Reject Plan Test",
      },
    });

    expect(result).toEqual({
      block: true,
      reason: "Plan approval rejected by user. Remaining in plan mode.",
    });
  });

  it("lets ordinary write calls pass through tool_call hook untouched", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn();
    const mockBus = { request: mockRequest } as unknown as PromptBus;

    registerProposeTool(pi as unknown as ExtensionAPI, () => mockBus);

    const result = await pi.fireToolCall({
      toolName: "write",
      toolCallId: "call-normal",
      input: {
        path: "src/output.txt",
        content: "Hello world",
      },
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("executes propose tool directly when called as propose tool", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Approve and execute",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus = { request: mockRequest } as unknown as PromptBus;
    const onPlanApproved = vi.fn();

    registerProposeTool(pi as unknown as ExtensionAPI, () => mockBus, { onPlanApproved });
    const proposeTool = pi.tools.get("propose");
    expect(proposeTool).toBeDefined();

    const result = await proposeTool!.execute(
      "call-direct",
      {
        title: "Direct Propose Plan",
        content: "# Direct Propose Plan",
      },
      undefined,
      undefined,
      {},
    );

    expect(result).toEqual({
      content: [{ type: "text", text: "Plan approved by user. Proceeding to execution." }],
      details: { approved: true, status: "approved", planPath: "plan.md" },
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(onPlanApproved).toHaveBeenCalledWith({
      toolCallId: "call-direct",
      planPath: "plan.md",
    });
  });
});
