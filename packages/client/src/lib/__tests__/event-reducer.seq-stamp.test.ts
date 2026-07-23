import { describe, expect, it } from "vitest";
import { createInitialState, reduceEvent } from "../event-reducer.js";

function ev(eventType: string, data: Record<string, unknown>) {
  return { eventType, timestamp: 0, data } as any;
}

describe("reduceEvent seq stamping", () => {
  it("stamps a chat message with the reducing event's seq", () => {
    let s = createInitialState();
    s = reduceEvent(s, ev("message_start", { role: "user", message: { role: "user", content: "hi" } }), { seq: 100 });
    const userMsg = s.messages.find((m) => m.role === "user");
    expect(userMsg?.seq).toBe(100);
  });

  it("stamps a tool call with the MAX-touch seq across its span", () => {
    let s = createInitialState();
    s = reduceEvent(s, ev("tool_execution_start", { toolCallId: "t1", toolName: "bash" }), { seq: 100 });
    s = reduceEvent(s, ev("tool_execution_end", { toolCallId: "t1", result: "ok" }), { seq: 5000 });
    expect(s.toolCalls.get("t1")?.seq).toBe(5000);
  });

  it("never lowers a tool call's stamped seq on an out-of-order later frame", () => {
    let s = createInitialState();
    s = reduceEvent(s, ev("tool_execution_start", { toolCallId: "t1", toolName: "bash" }), { seq: 5000 });
    s = reduceEvent(s, ev("tool_execution_end", { toolCallId: "t1", result: "ok" }), { seq: 100 });
    expect(s.toolCalls.get("t1")?.seq).toBe(5000);
  });

  it("advances seq on a tool_execution_update partial-result frame (max-touch)", () => {
    let s = createInitialState();
    s = reduceEvent(s, ev("tool_execution_start", { toolCallId: "t1", toolName: "bash" }), { seq: 100 });
    s = reduceEvent(
      s,
      ev("tool_execution_update", { toolCallId: "t1", partialResult: "partial output" }),
      { seq: 250 },
    );
    expect(s.toolCalls.get("t1")?.seq).toBe(250);
    const toolMsg = s.messages.find((m) => m.toolCallId === "t1");
    expect(toolMsg?.seq).toBe(250);
  });
});
