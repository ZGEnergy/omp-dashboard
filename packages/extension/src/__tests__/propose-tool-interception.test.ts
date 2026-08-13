import { describe, expect, it, vi } from "vitest";
import { registerProposeTool } from "../propose-tool.js";

function createMockPi(hasExistingWrite = true) {
  const tools = new Map<string, any>();
  const emittedEvents: Array<{ event: string; payload: any }> = [];
  const existingWriteExecute = vi.fn().mockImplementation(async (_id: any, params: any) => {
    return {
      content: [{ type: "text", text: `Builtin write: ${params.content?.length ?? 0} bytes to ${params.path}` }],
      details: { builtin: true, path: params.path },
    };
  });

  if (hasExistingWrite) {
    tools.set("write", {
      name: "write",
      label: "Builtin Write",
      description: "Original write tool",
      execute: existingWriteExecute,
    });
  }

  return {
    tools,
    emittedEvents,
    existingWriteExecute,
    registerTool: (def: any) => {
      tools.set(def.name, def);
    },
    events: {
      emit: (event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      },
    },
  };
}

describe("registerProposeTool", () => {
  it("registers propose tool and wraps existing write tool when present", () => {
    const pi = createMockPi(true);
    registerProposeTool(pi as any, () => undefined);
    expect(pi.tools.has("write")).toBe(true);
    expect(pi.tools.has("propose")).toBe(true);
  });

  it("registers only propose tool when no existing write tool is present", () => {
    const pi = createMockPi(false);
    registerProposeTool(pi as any, () => undefined);
    expect(pi.tools.has("write")).toBe(false);
    expect(pi.tools.has("propose")).toBe(true);
  });

  it("includes parameters schema on registered tools", () => {
    const pi = createMockPi(false);
    registerProposeTool(pi as any, () => undefined);
    const proposeTool = pi.tools.get("propose");
    expect(proposeTool.parameters).toBeDefined();
    expect(proposeTool.parameters.type).toBe("object");
  });

  it("intercepts write xd://propose and returns AgentToolResult on PromptBus approval", async () => {
    const pi = createMockPi(true);
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Approve and execute",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus: any = { request: mockRequest };
    const onPlanApproved = vi.fn();

    registerProposeTool(pi as any, () => mockBus, { onPlanApproved });
    const proposeTool = pi.tools.get("propose");

    const result = await proposeTool.execute(
      "call-123",
      {
        path: "xd://propose",
        title: "Test Feature Plan",
        content: "# Test Feature Plan\n\n1. Step 1",
        planPath: "local://docs/plan.md",
      },
      undefined,
      undefined,
      {},
    );

    expect(result).toEqual({
      content: [{ type: "text", text: "Plan approved by user. Proceeding to execution." }],
      details: { approved: true, status: "approved", planPath: "docs/plan.md" },
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

  it("handles Refine plan answer with structured AgentToolResult", async () => {
    const pi = createMockPi(true);
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
    const mockBus: any = { request: mockRequest };

    registerProposeTool(pi as any, () => mockBus);
    const proposeTool = pi.tools.get("propose");

    const result = await proposeTool.execute(
      "call-456",
      {
        path: "xd://propose",
        content: "# Refine Plan Test\nBody",
      },
      undefined,
      undefined,
      {},
    );

    expect(result.content[0].text).toContain(
      "Plan refinement requested by user: Needs more unit tests for auth edge cases.",
    );
    expect(result.details).toEqual({
      approved: false,
      status: "refine",
      feedback: "Needs more unit tests for auth edge cases",
    });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("handles Reject answer with structured AgentToolResult", async () => {
    const pi = createMockPi(true);
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Reject",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus: any = { request: mockRequest };

    registerProposeTool(pi as any, () => mockBus);
    const proposeTool = pi.tools.get("propose");

    const result = await proposeTool.execute(
      "call-789",
      {
        path: "xd://propose",
        content: "# Reject Plan Test",
      },
      undefined,
      undefined,
      {},
    );

    expect(result).toEqual({
      content: [{ type: "text", text: "Plan approval rejected by user. Remaining in plan mode." }],
      details: { approved: false, status: "rejected" },
    });
  });

  it("delegates ordinary write calls to existing builtin write execution", async () => {
    const pi = createMockPi(true);
    const mockRequest = vi.fn();
    const mockBus: any = { request: mockRequest };

    registerProposeTool(pi as any, () => mockBus);
    const writeTool = pi.tools.get("write");

    const result = await writeTool.execute(
      "call-normal",
      {
        path: "src/output.txt",
        content: "Hello world",
      },
      undefined,
      undefined,
      {},
    );

    expect(mockRequest).not.toHaveBeenCalled();
    expect(pi.existingWriteExecute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: [{ type: "text", text: "Builtin write: 11 bytes to src/output.txt" }],
      details: { builtin: true, path: "src/output.txt" },
    });
  });
});
