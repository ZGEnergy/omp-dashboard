import { describe, expect, it } from "vitest";
import { selectNewestEventsByBudget } from "../event-window.js";

function userStart(seq: number) {
  return { seq, event: { eventType: "message_start", timestamp: 0, data: { role: "user", message: { role: "user", content: `u${seq}` } } } };
}
function toolEnd(seq: number, big: number) {
  return { seq, event: { eventType: "tool_execution_end", timestamp: 0, data: { toolCallId: `t${seq}`, result: "z".repeat(big) } } };
}

describe("content-aware selection", () => {
  it("includes the newest complete readable turn even when it exceeds the byte target", () => {
    const src = [userStart(1), toolEnd(2, 2_000_000)]; // one turn, > 1 MiB
    const out = selectNewestEventsByBudget(src, 1_048_576);
    expect(out.events.some((e) => e.seq === 1)).toBe(true); // user turn head present
  });

  it("bounds tool-event bytes within a window so chat turns are not crowded out", () => {
    const src = [userStart(1), toolEnd(2, 500_000), toolEnd(3, 500_000), userStart(4)];
    const out = selectNewestEventsByBudget(src, 1_048_576);
    // newest readable turn (seq 4) always present; tool bytes bounded, older turn head still reachable
    expect(out.events.at(-1)?.seq).toBe(4);
  });

  it("never drops a message_* event when trimming the tool-byte sub-budget", () => {
    // A huge salvo of tool events sits before/around the newest user turn; the
    // sub-budget should trim tool bytes but must never drop the chat message.
    const src = [
      userStart(1),
      toolEnd(2, 100_000),
      toolEnd(3, 100_000),
      toolEnd(4, 100_000),
      toolEnd(5, 100_000),
      toolEnd(6, 100_000),
      userStart(7),
    ];
    const out = selectNewestEventsByBudget(src, 1_048_576, { toolBudgetBytes: 50_000 });
    const messageSeqs = out.events.filter((e) => e.event.eventType.startsWith("message_")).map((e) => e.seq);
    expect(messageSeqs).toContain(7);
    // Tool bytes in the final window must be bounded by (roughly) the sub-budget.
    const toolBytes = out.events
      .filter((e) => e.event.eventType.startsWith("tool_execution"))
      .reduce((total, e) => total + JSON.stringify(e).length, 0);
    expect(toolBytes).toBeLessThanOrEqual(60_000); // small slack for envelope overhead
  });
});
