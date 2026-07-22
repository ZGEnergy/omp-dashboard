import { describe, expect, it } from "vitest";
import type { ChatMessage, ToolCallState } from "../event-reducer.js";
import { computeChatFloorSeq, computeToolFloorSeq } from "../two-tier-floors.js";

const user = (seq: number): ChatMessage => ({ id: `u${seq}`, role: "user", content: "", timestamp: 0, seq });
const asst = (seq: number): ChatMessage => ({ id: `a${seq}`, role: "assistant", content: "", timestamp: 0, seq });

describe("computeChatFloorSeq", () => {
  it("returns the start seq of the Nth-from-last user turn", () => {
    const msgs = [user(10), asst(11), user(20), asst(21), user(30), asst(31)];
    expect(computeChatFloorSeq(msgs, 2, null)).toBe(20); // keep last 2 turns → floor at turn starting seq 20
  });
  it("keeps everything when fewer than N turns exist", () => {
    expect(computeChatFloorSeq([user(10), asst(11)], 5, null)).toBe(0);
  });
  it("lowers the floor to a viewport pin below the budget floor", () => {
    const msgs = [user(10), user(20), user(30)];
    expect(computeChatFloorSeq(msgs, 1, 12)).toBe(12);
  });
  it("returns a finite floor above every user turn when retainedTurns is 0", () => {
    const msgs = [user(10), asst(11), user(20), asst(21), user(30), asst(31)];
    const floor = computeChatFloorSeq(msgs, 0, null);
    expect(floor).toBe(31);
    expect(Number.isFinite(floor)).toBe(true);
    expect(Number.isNaN(floor)).toBe(false);
  });
  it("a viewport pin above the budget floor does not raise the floor", () => {
    const msgs = [user(10), user(20), user(30)];
    expect(computeChatFloorSeq(msgs, 1, 100)).toBe(30);
  });
});

describe("computeToolFloorSeq", () => {
  it("returns 0 when tool detail is under budget", () => {
    const tools: ToolCallState[] = [{ toolCallId: "a", toolName: "x", status: "complete", seq: 5 }];
    expect(computeToolFloorSeq(tools, 1_000_000, 100)).toBe(0);
  });
  it("raises the floor to drop oldest tools past the count budget", () => {
    const tools: ToolCallState[] = [1, 2, 3, 4].map((seq) => ({ toolCallId: `t${seq}`, toolName: "x", status: "complete", seq }));
    expect(computeToolFloorSeq(tools, 1_000_000, 2)).toBe(3); // keep 2 newest (seq 3,4) → floor 3
  });
  it("raises the floor to drop oldest tools past the byte budget", () => {
    // Each result is a 100-char string; JSON.stringify({args:undefined,result:"..."}) yields
    // `{"result":"..."}`, 113 bytes per tool (verified: JSON.stringify(...).length === 113).
    const makeTool = (seq: number): ToolCallState => ({
      toolCallId: `t${seq}`,
      toolName: "x",
      status: "complete",
      seq,
      result: "x".repeat(100),
    });
    const tools: ToolCallState[] = [1, 2, 3, 4].map(makeTool);
    // 113 bytes/tool. maxBytes=200 → only the newest tool (seq 4, 113 bytes) fits;
    // adding seq 3 pushes cumulative bytes to 226 > 200, so floor drops seq<=3.
    expect(computeToolFloorSeq(tools, 200, 100)).toBe(4);
  });
});
