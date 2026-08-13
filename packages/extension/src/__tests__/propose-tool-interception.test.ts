import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerProposeTool } from "../propose-tool.js";

function createMockPi() {
  const tools = new Map<string, any>();
  const emittedEvents: Array<{ event: string; payload: any }> = [];
  return {
    tools,
    emittedEvents,
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
  it("registers write and propose tools", () => {
    const pi = createMockPi();
    registerProposeTool(pi as any, () => undefined);
    expect(pi.tools.has("write")).toBe(true);
    expect(pi.tools.has("propose")).toBe(true);
  });

  it("intercepts write xd://propose and requests plan approval on PromptBus", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Approve and execute",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus: any = { request: mockRequest };
    const onPlanApproved = vi.fn();

    registerProposeTool(pi as any, () => mockBus, { onPlanApproved });
    const writeTool = pi.tools.get("write");

    const result = await writeTool.execute(
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

    expect(result).toBe("Plan approved by user. Proceeding to execution.");
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

  it("handles Refine plan answer by prompting for feedback", async () => {
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
    const mockBus: any = { request: mockRequest };

    registerProposeTool(pi as any, () => mockBus);
    const writeTool = pi.tools.get("write");

    const result = await writeTool.execute(
      "call-456",
      {
        path: "xd://propose",
        content: "# Refine Plan Test\nBody",
      },
      undefined,
      undefined,
      {},
    );

    expect(result).toContain("Plan refinement requested by user: Needs more unit tests for auth edge cases.");
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("handles Reject answer by returning rejection notice", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn().mockResolvedValue({
      id: "p1",
      answer: "Reject",
      cancelled: false,
      source: "dashboard",
    });
    const mockBus: any = { request: mockRequest };

    registerProposeTool(pi as any, () => mockBus);
    const writeTool = pi.tools.get("write");

    const result = await writeTool.execute(
      "call-789",
      {
        path: "xd://propose",
        content: "# Reject Plan Test",
      },
      undefined,
      undefined,
      {},
    );

    expect(result).toBe("Plan approval rejected by user. Remaining in plan mode.");
  });

  it("executes normal write for ordinary files without PromptBus request", async () => {
    const pi = createMockPi();
    const mockRequest = vi.fn();
    const mockBus: any = { request: mockRequest };

    registerProposeTool(pi as any, () => mockBus);
    const writeTool = pi.tools.get("write");

    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), "tmp-test-write-"));
    const filePath = path.join(tmpDir, "sub", "output.txt");

    try {
      const result = await writeTool.execute(
        "call-normal",
        {
          path: filePath,
          content: "Hello world",
        },
        undefined,
        undefined,
        {},
      );

      expect(result).toContain("Wrote 11 bytes to");
      expect(mockRequest).not.toHaveBeenCalled();
      expect(fs.readFileSync(filePath, "utf-8")).toBe("Hello world");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
