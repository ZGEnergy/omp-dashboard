import { describe, expect, it } from "vitest";
import { type ChatMessage, createInitialState, evictBelow, type SessionState, type ToolCallState } from "../event-reducer.js";

function withState(partial: Partial<SessionState>): SessionState {
  return { ...createInitialState(), ...partial };
}
const tool = (seq: number, status: ToolCallState["status"] = "complete"): [string, ToolCallState] =>
  [`t${seq}`, { toolCallId: `t${seq}`, toolName: "bash", status, seq }];

/** A `toolResult` ChatMessage row paired with a `toolCalls` map entry of the
 * same seq — mirrors how the reducer actually stamps both from the same
 * `tool_execution_start`/`_end` event (see event-reducer.ts). */
const toolRow = (seq: number, toolStatus: ChatMessage["toolStatus"] = "complete"): ChatMessage => ({
  id: `tool-t${seq}`,
  role: "toolResult",
  content: "bash",
  toolName: "bash",
  toolCallId: `t${seq}`,
  toolStatus,
  timestamp: 0,
  seq,
});

describe("evictBelow (two-tier prune)", () => {
  it("drops tool detail below toolFloorSeq before any chat", () => {
    const state = withState({
      messages: [
        { id: "u1", role: "user", content: "keep", timestamp: 0, seq: 10 },
        { id: "a1", role: "assistant", content: "keep", timestamp: 0, seq: 400 },
        toolRow(50),
        toolRow(60),
        toolRow(500),
      ],
      toolCalls: new Map([tool(50), tool(60), tool(500)]),
    });
    const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(next.toolCalls.has("t50")).toBe(false);
    expect(next.toolCalls.has("t60")).toBe(false);
    expect(next.toolCalls.has("t500")).toBe(true);
    expect(next.messages.map((m) => m.id)).toEqual(["u1", "a1", "tool-t500"]); // chat untouched, tool rows evicted with the map
  });

  it("collapses an evicted contiguous tool run into one bounded burst marker", () => {
    const state = withState({
      messages: [toolRow(50), toolRow(51), toolRow(52)],
      toolCalls: new Map([tool(50), tool(51), tool(52)]),
    });
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
    const first = withState({ messages: [toolRow(50)], toolCalls: new Map([tool(50)]) });
    const s1 = evictBelow(first, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(s1.evictedToolBursts).toEqual([{ fromSeq: 50, toSeq: 50, count: 1 }]);

    const second = { ...s1, messages: [toolRow(51)], toolCalls: new Map([tool(51)]) };
    const s2 = evictBelow(second, { chatFloorSeq: 0, toolFloorSeq: 100 });
    expect(s2.evictedToolBursts).toEqual([{ fromSeq: 50, toSeq: 51, count: 2 }]);
  });

  it("does not mutate the input's evictedToolBursts array or its objects when merging across calls (purity)", () => {
    const first = withState({ messages: [toolRow(50)], toolCalls: new Map([tool(50)]) });
    const s1 = evictBelow(first, { chatFloorSeq: 0, toolFloorSeq: 100 });
    const beforeArray = s1.evictedToolBursts;
    const beforeBurst = s1.evictedToolBursts[0];
    const beforeSnapshot = { ...beforeBurst };

    const second = { ...s1, messages: [toolRow(51)], toolCalls: new Map([tool(51)]) };
    evictBelow(second, { chatFloorSeq: 0, toolFloorSeq: 100 });

    expect(s1.evictedToolBursts).toBe(beforeArray);
    expect(s1.evictedToolBursts).toHaveLength(1);
    expect(s1.evictedToolBursts[0]).toBe(beforeBurst);
    expect(s1.evictedToolBursts[0]).toEqual(beforeSnapshot);
  });

  // Blocking-fix regression coverage (whole-branch review): toolResult /
  // bashOutput ROWS are TOOL-TIER and must evict at toolFloorSeq, independent
  // of chatFloorSeq. A tool-heavy, few-turn session can have
  // `toolFloorSeq > chatFloorSeq` (tight tool byte/count budget, few turns
  // retained) — before this fix the toolCalls MAP entry was pruned (producing
  // an `EvictedToolBurst` marker) while the toolResult MESSAGE ROW survived
  // (chatFloorSeq was lower), so the marker and the still-rendered tool card
  // double-rendered the same tool call.
  describe("tool-heavy few-turn session (toolFloorSeq > chatFloorSeq)", () => {
    it("evicts tool-tier rows below toolFloorSeq, keeps chat-tier rows below toolFloorSeq but above chatFloorSeq, and builds bursts from the removed rows", () => {
      const state = withState({
        messages: [
          { id: "u1", role: "user", content: "go", timestamp: 0, seq: 1 },
          { id: "a1", role: "assistant", content: "on it", timestamp: 0, seq: 2 },
          toolRow(10),
          toolRow(11),
          toolRow(12),
          { id: "a2", role: "assistant", content: "done", timestamp: 0, seq: 20 },
        ],
        toolCalls: new Map([tool(10), tool(11), tool(12)]),
      });
      // chatFloorSeq: 0 → every chat-tier row survives (few turns, none pruned).
      // toolFloorSeq: 12 → tool rows/calls with seq < 12 evict; seq 12 survives.
      const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 12 });

      // Chat-tier rows: untouched by the (higher) tool floor.
      expect(next.messages.some((m) => m.id === "u1")).toBe(true);
      expect(next.messages.some((m) => m.id === "a1")).toBe(true);
      expect(next.messages.some((m) => m.id === "a2")).toBe(true);

      // Tool-tier rows below the tool floor are gone; the one at/above it survives.
      expect(next.messages.some((m) => m.id === "tool-t10")).toBe(false);
      expect(next.messages.some((m) => m.id === "tool-t11")).toBe(false);
      expect(next.messages.some((m) => m.id === "tool-t12")).toBe(true);

      // The map stays in lockstep.
      expect(next.toolCalls.has("t10")).toBe(false);
      expect(next.toolCalls.has("t11")).toBe(false);
      expect(next.toolCalls.has("t12")).toBe(true);

      // The burst marker describes exactly the removed ROWS (10, 11).
      expect(next.evictedToolBursts).toEqual([{ fromSeq: 10, toSeq: 11, count: 2 }]);
    });

    it("does not evict a toolResult row tied to a still-running tool, even below toolFloorSeq", () => {
      const state = withState({
        messages: [toolRow(5, "running")],
        toolCalls: new Map([tool(5, "running")]),
      });
      const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 1000 });

      expect(next.messages.some((m) => m.id === "tool-t5")).toBe(true);
      expect(next.toolCalls.has("t5")).toBe(true);
      expect(next.evictedToolBursts).toEqual([]);
    });

    it("does not double-render: no evictedToolBursts range overlaps the seq of a surviving tool-tier row", () => {
      const state = withState({
        messages: [toolRow(10), toolRow(11), toolRow(12), toolRow(13)],
        toolCalls: new Map([tool(10), tool(11), tool(12), tool(13)]),
      });
      const next = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 12 });

      const survivingToolSeqs = next.messages
        .filter((m) => m.role === "toolResult")
        .map((m) => m.seq!);
      for (const burst of next.evictedToolBursts) {
        for (const seq of survivingToolSeqs) {
          expect(seq < burst.fromSeq || seq > burst.toSeq).toBe(true);
        }
      }
    });
  });

  // Issue #77 (R2): after an evicted burst is expanded, App pins the tool floor
  // down to the expanded `fromSeq` by clamping the computed floor with the pin
  // (`Math.min(toolFloorSeq, pin)`). A subsequent live-event evict must not drop
  // the just-expanded rows. This exercises that clamp directly.
  describe("expanded-burst pin (issue #77)", () => {
    it("keeps just-expanded tool rows when the tool floor is clamped to the pin", () => {
      const state = withState({
        messages: [
          { id: "u1", role: "user", content: "keep", timestamp: 0, seq: 400 },
          toolRow(50),
          toolRow(60),
        ],
        toolCalls: new Map([tool(50), tool(60)]),
      });
      // Computed tool floor would prune everything below 100; the expand pin at
      // 50 clamps it down so the expanded range (50, 60) survives.
      const computedToolFloorSeq = 100;
      const expandPin = 50;
      const next = evictBelow(state, {
        chatFloorSeq: 0,
        toolFloorSeq: Math.min(computedToolFloorSeq, expandPin),
      });
      expect(next.toolCalls.has("t50")).toBe(true);
      expect(next.toolCalls.has("t60")).toBe(true);
      expect(next.messages.map((m) => m.id)).toEqual(["u1", "tool-t50", "tool-t60"]);
      // No new burst is produced — nothing was evicted below the pinned floor.
      expect(next.evictedToolBursts).toEqual([]);
    });
  });
});
