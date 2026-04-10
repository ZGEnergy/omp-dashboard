import { describe, it, expect } from "vitest";
import { extractSessionUpdates } from "../event-status-extraction.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function makeEvent(eventType: string, data: Record<string, unknown> = {}): DashboardEvent {
  return { eventType, timestamp: Date.now(), data };
}

describe("extractSessionUpdates flow events", () => {
  it("flow_started extracts flow metadata", () => {
    const updates = extractSessionUpdates(makeEvent("flow_started", {
      flowName: "research-and-build",
      steps: [
        { id: "r", stepType: "agent", agent: "researcher" },
        { id: "d", stepType: "agent", agent: "developer" },
        { id: "f1", stepType: "fork", question: "which?" },
      ],
    }));
    expect(updates).toEqual({
      activeFlowName: "research-and-build",
      flowAgentsTotal: 2,
      flowAgentsDone: 0,
      flowStatus: "running",
    });
  });

  it("flow_agent_complete returns sentinel for increment", () => {
    const updates = extractSessionUpdates(makeEvent("flow_agent_complete", {
      agentName: "researcher",
      result: { success: true },
    }));
    expect(updates).toEqual({ flowAgentsDone: -1 });
  });

  it("flow_complete extracts status", () => {
    const updates = extractSessionUpdates(makeEvent("flow_complete", {
      status: "error",
      flowName: "test",
    }));
    expect(updates).toEqual({ flowStatus: "error" });
  });

  it("flow_complete defaults to success", () => {
    const updates = extractSessionUpdates(makeEvent("flow_complete", {
      flowName: "test",
    }));
    expect(updates).toEqual({ flowStatus: "success" });
  });

  it("other flow events return null", () => {
    expect(extractSessionUpdates(makeEvent("flow_tool_call"))).toBeNull();
    expect(extractSessionUpdates(makeEvent("flow_assistant_text"))).toBeNull();
    expect(extractSessionUpdates(makeEvent("flow_loop_iteration"))).toBeNull();
  });
});
