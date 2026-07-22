import { describe, expect, it } from "vitest";
import { createInitialState, evictBelow, type SessionState, type ToolCallState } from "../event-reducer.js";

function withState(partial: Partial<SessionState>): SessionState {
  return { ...createInitialState(), ...partial };
}
const tool = (seq: number, status: ToolCallState["status"] = "complete"): [string, ToolCallState] =>
  [`t${seq}`, { toolCallId: `t${seq}`, toolName: "bash", status, seq }];

describe("evictBelow (two-tier prune)", () => {
  it("drops tool detail below toolFloorSeq before any chat", () => {
    const state = withState({
      messages: [
        { id: "u1", role: "user", content: "keep", timestamp: 0, seq: 10 },
        { id: "a1", role: "assistant", content: "keep", timestamp: 0, seq: 400 },
      ],
      toolCalls: new Map([tool(50), tool(60), tool(500)]),
    });
    const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(next.toolCalls.has("t50")).toBe(false);
    expect(next.toolCalls.has("t60")).toBe(false);
    expect(next.toolCalls.has("t500")).toBe(true);
    expect(next.messages.map((m) => m.id)).toEqual(["u1", "a1"]); // chat untouched
  });

  it("collapses an evicted contiguous tool run into one bounded burst marker", () => {
    const state = withState({ toolCalls: new Map([tool(50), tool(51), tool(52)]) });
    const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(next.evictedToolBursts).toEqual([{ fromSeq: 50, toSeq: 52, count: 3 }]);
  });

  it("never evicts an active (running) tool, an unresolved interactive request, or a streaming message", () => {
    const state = withState({
      toolCalls: new Map([tool(10, "running")]),
      interactiveRequests: [{ requestId: "q1", method: "ask", params: {}, status: "pending" }],
      messages: [{ id: "m1", role: "assistant", content: "streaming", timestamp: 0, seq: 5, isStreaming: true }],
    });
    const next = evictBelow(state, { chatFloorSeq: 1000, toolFloorSeq: 1000 });
    expect(next.toolCalls.has("t10")).toBe(true);
    expect(next.interactiveRequests).toHaveLength(1);
    expect(next.messages.find((m) => m.id === "m1")).toBeTruthy();
  });

  it("survives a tool opened before the floor and resolved after it", () => {
    const state = withState({ toolCalls: new Map([tool(5000)]) }); // max-touch seq 5000 (opened at 100)
    const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 1000 });
    expect(next.toolCalls.has("t5000")).toBe(true);
  });

  it("coalesces a contiguous tool run split across separate evictBelow calls into one burst", () => {
    const first = withState({ toolCalls: new Map([tool(50)]) });
    const s1 = evictBelow(first, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(s1.evictedToolBursts).toEqual([{ fromSeq: 50, toSeq: 50, count: 1 }]);

    const second = { ...s1, toolCalls: new Map([tool(51)]) };
    const s2 = evictBelow(second, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(s2.evictedToolBursts).toEqual([{ fromSeq: 50, toSeq: 51, count: 2 }]);
  });

  it("does not mutate the input's evictedToolBursts array or its objects when merging across calls (purity)", () => {
    const first = withState({ toolCalls: new Map([tool(50)]) });
    const s1 = evictBelow(first, { chatFloorSeq: 0, toolFloorSeq: 100 });
    const beforeArray = s1.evictedToolBursts;
    const beforeBurst = s1.evictedToolBursts[0];
    const beforeSnapshot = { ...beforeBurst };

    const second = { ...s1, toolCalls: new Map([tool(51)]) };
    evictBelow(second, { chatFloorSeq: 0, toolFloorSeq: 100 });

    expect(s1.evictedToolBursts).toBe(beforeArray);
    expect(s1.evictedToolBursts).toHaveLength(1);
    expect(s1.evictedToolBursts[0]).toBe(beforeBurst);
    expect(s1.evictedToolBursts[0]).toEqual(beforeSnapshot);
  });
});
