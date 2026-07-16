/** Focused push trigger classifier contract tests. */
import { describe, expect, it } from "vitest";
import { classifyPushTrigger, type PushTriggerSnapshot } from "../push/push-trigger-classifier.js";

const snapshot = (overrides: Partial<PushTriggerSnapshot> = {}): PushTriggerSnapshot => ({
  status: "idle",
  currentTool: null,
  ...overrides,
});

const event = (eventType: string, data: Record<string, unknown> = {}) => ({
  eventType,
  timestamp: 0,
  data,
});

describe("classifyPushTrigger", () => {
  it.each([
    ["idle", "claude-decides"],
    ["active", "claude-decides"],
  ] as const)("maps streaming → %s turn completion to %s", (afterStatus, expected) => {
    expect(
      classifyPushTrigger(
        event("agent_end"),
        snapshot({ status: "streaming" }),
        snapshot({ status: afterStatus }),
      ),
    ).toEqual({ kind: "turn-done", bucket: expected });
  });

  it.each(["ask_user", "ask"] as const)("maps %s input-needed transitions to actions-required", (tool) => {
    expect(
      classifyPushTrigger(
        event("tool_execution_start", { toolName: tool }),
        snapshot({ currentTool: null }),
        snapshot({ currentTool: tool }),
      ),
    ).toEqual({ kind: "input-needed", bucket: "actions-required" });
  });

  it("maps agent_end with a truthy error to actions-required", () => {
    expect(
      classifyPushTrigger(
        event("agent_end", { error: new Error("boom") }),
        snapshot({ status: "streaming" }),
        snapshot({ status: "idle" }),
      ),
    ).toEqual({ kind: "crash", bucket: "actions-required" });
  });

  it("gives a crash precedence over simultaneous turn completion", () => {
    expect(
      classifyPushTrigger(
        event("agent_end", { error: "boom" }),
        snapshot({ status: "streaming" }),
        snapshot({ status: "idle" }),
      ),
    ).toEqual({ kind: "crash", bucket: "actions-required" });
  });

  it("returns null for unknown or non-trigger events", () => {
    expect(classifyPushTrigger(event("message_end"), snapshot(), snapshot())).toBeNull();
    expect(
      classifyPushTrigger(
        event("agent_end"),
        snapshot({ status: "idle" }),
        snapshot({ status: "idle" }),
      ),
    ).toBeNull();
  });
});
