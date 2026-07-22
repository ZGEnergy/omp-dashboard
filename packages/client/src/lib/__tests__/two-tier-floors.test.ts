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
});
