import { describe, expect, it } from "vitest";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { createInitialState, reduceEvent } from "../event-reducer.js";

describe("event reducer handling of coalesced tool events", () => {
  it("handles coalesced intermediate tool updates without clobbering state", () => {
    let state = createInitialState();

    // 1. tool_execution_start
    const startEvent: DashboardEvent = {
      eventType: "tool_execution_start",
      timestamp: 1000,
      data: {
        toolCallId: "call-1",
        toolName: "write",
        args: { path: "src/main.ts" },
      },
    };
    state = reduceEvent(state, startEvent, { seq: 10 });

    expect(state.toolCalls.get("call-1")).toMatchObject({
      toolCallId: "call-1",
      toolName: "write",
      status: "running",
      seq: 10,
    });
    expect(state.toolCalls.get("call-1")?.args).toEqual({ path: "src/main.ts" });

    // 2. Coalesced tool_execution_update
    const coalescedUpdate: DashboardEvent = {
      eventType: "tool_execution_update",
      timestamp: 1010,
      data: {
        toolCallId: "call-1",
        coalesced: true,
      },
    };
    state = reduceEvent(state, coalescedUpdate, { seq: 11 });

    expect(state.toolCalls.get("call-1")).toMatchObject({
      toolCallId: "call-1",
      toolName: "write",
      status: "running",
      seq: 11,
    });
    expect(state.toolCalls.get("call-1")?.args).toEqual({ path: "src/main.ts" });

    // 3. tool_execution_end
    const endEvent: DashboardEvent = {
      eventType: "tool_execution_end",
      timestamp: 1020,
      data: {
        toolCallId: "call-1",
        toolName: "write",
        result: "Success: file written",
      },
    };
    state = reduceEvent(state, endEvent, { seq: 12 });

    expect(state.toolCalls.get("call-1")).toMatchObject({
      toolCallId: "call-1",
      toolName: "write",
      status: "complete",
      seq: 12,
    });
    const toolMsg = state.messages.find((m) => m.toolCallId === "call-1");
    expect(toolMsg?.toolStatus).toBe("complete");
    expect(toolMsg?.result).toBe("Success: file written");

    // 4. Re-replay coalesced update after completion (idempotency check)
    state = reduceEvent(state, coalescedUpdate, { seq: 13 });
    expect(state.toolCalls.get("call-1")?.status).toBe("complete");
    const toolMsgAfterReplay = state.messages.find((m) => m.toolCallId === "call-1");
    expect(toolMsgAfterReplay?.toolStatus).toBe("complete");
    expect(toolMsgAfterReplay?.result).toBe("Success: file written");
    expect(state.messages.filter((m) => m.toolCallId === "call-1")).toHaveLength(1);
  });
});
