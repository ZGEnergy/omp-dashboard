import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { extractSessionUpdates } from "../event-status-extraction.js";

function makeEvent(eventType: string, data: Record<string, unknown> = {}): DashboardEvent {
  return { eventType, timestamp: Date.now(), data: { type: eventType, ...data } };
}

describe("extractSessionUpdates", () => {
  it("should return streaming status on agent_start", () => {
    const updates = extractSessionUpdates(makeEvent("agent_start"));
    expect(updates).toEqual({ status: "streaming", currentTool: null, currentToolArgs: null });
  });

  it("should return idle status on agent_end", () => {
    const updates = extractSessionUpdates(makeEvent("agent_end"));
    expect(updates).toEqual({ status: "idle", currentTool: null, currentToolArgs: null });
  });

  it("should return currentTool and currentToolArgs on tool_execution_start", () => {
    const updates = extractSessionUpdates(
      makeEvent("tool_execution_start", { toolName: "write", args: { path: "xd://propose" } }),
    );
    expect(updates).toEqual({
      currentTool: "write",
      currentToolArgs: { path: "xd://propose" },
    });
  });

  it("should clear currentTool and currentToolArgs on tool_execution_end", () => {
    const updates = extractSessionUpdates(makeEvent("tool_execution_end", { toolName: "write" }));
    expect(updates).toEqual({ currentTool: null, currentToolArgs: null });
  });

  it("does not derive model state from model_select events", () => {
    const updates = extractSessionUpdates(
      makeEvent("model_select", {
        model: { provider: "anthropic", id: "claude-opus-4-6" },
        thinkingLevel: "high",
      }),
    );
    // model_select remains in the forwarded event history; extraction must
    // not project its payload onto live session state.
    expect(updates).toBeNull();
  });

  it("should return null for model_select without model data", () => {
    expect(extractSessionUpdates(makeEvent("model_select"))).toBeNull();
  });

  it("should return null for unrelated events", () => {
    expect(extractSessionUpdates(makeEvent("message_update"))).toBeNull();
    expect(extractSessionUpdates(makeEvent("session_compact"))).toBeNull();
    expect(extractSessionUpdates(makeEvent("turn_start"))).toBeNull();
  });
});
