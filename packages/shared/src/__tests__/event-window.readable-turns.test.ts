import { describe, expect, it } from "vitest";
import { selectNewestEventsByBudget } from "../event-window.js";

function userStart(seq: number) {
  return { seq, event: { eventType: "message_start", timestamp: 0, data: { role: "user", message: { role: "user", content: `u${seq}` } } } };
}
function toolEnd(seq: number, big: number) {
  return { seq, event: { eventType: "tool_execution_end", timestamp: 0, data: { toolCallId: `t${seq}`, result: "z".repeat(big) } } };
}

describe("content-aware selection", () => {
  it("returns the newest bounded contiguous suffix and marks partialHead when the newest turn alone exceeds the budget", () => {
    const src = [userStart(1), toolEnd(2, 2_000_000)]; // one turn, > 1 MiB
    const out = selectNewestEventsByBudget(src, 1_048_576);
    // The turn's head (seq 1) doesn't fit alongside the oversized tool event;
    // the selector keeps the newest bounded contiguous suffix and flags partialHead
    // rather than punching an interior hole to keep the head.
    expect(out.events.map((e) => e.seq)).toEqual([2]);
    expect(out.partialHead).toBe(true);
  });

  it("bounds tool-event bytes within a window so chat turns are not crowded out", () => {
    const src = [userStart(1), toolEnd(2, 500_000), toolEnd(3, 500_000), userStart(4)];
    const out = selectNewestEventsByBudget(src, 1_048_576);
    // newest readable turn (seq 4) always present; older turn head still reachable
    expect(out.events.at(-1)?.seq).toBe(4);
  });

  it("never punches an interior hole even with a huge interspersed tool salvo", () => {
    // A huge salvo of tool events sits between two user turns, large enough
    // that a naive tool-byte sub-budget trim would have to drop interior
    // events. The selector must never remove interior events: the returned
    // window's seqs must stay a strictly contiguous run.
    const src = [
      userStart(1),
      toolEnd(2, 100_000),
      toolEnd(3, 100_000),
      toolEnd(4, 100_000),
      toolEnd(5, 100_000),
      toolEnd(6, 100_000),
      userStart(7),
    ];
    const out = selectNewestEventsByBudget(src, 1_048_576);
    const seqs = out.events.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]).toBe(seqs[i - 1]! + 1);
    }
    const messageSeqs = out.events.filter((e) => e.event.eventType.startsWith("message_")).map((e) => e.seq);
    expect(messageSeqs).toContain(7);
  });
});
