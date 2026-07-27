import { describe, expect, it } from "vitest";
import { type SeqEvent, selectNewestEventsByBudget } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

function event(eventType: string, data: Record<string, unknown> = {}): DashboardEvent {
  return { eventType, timestamp: 1, data };
}

describe("event-window skipped range metadata budget compliance", () => {
  it("ensures result.bytes <= budget when many compact disjoint tool groups create skipped range metadata near budget limit", () => {
    const rawSource: SeqEvent<DashboardEvent>[] = [];
    for (let i = 1; i <= 50; i++) {
      const callId = `call_${i}`;
      const startSeq = 3 * i - 2;
      const updateSeq = 3 * i - 1;
      const endSeq = 3 * i;
      rawSource.push({ seq: startSeq, event: event("tool_execution_start", { toolCallId: callId, toolName: "bash" }) });
      rawSource.push({ seq: updateSeq, event: event("tool_execution_update", { toolCallId: callId, toolName: "bash" }) });
      rawSource.push({ seq: endSeq, event: event("tool_execution_end", { toolCallId: callId, toolName: "bash", result: { output: "x".repeat(850) } }) });
    }

    // Set budget such that event envelopes alone nearly fill budget,
    // and adding skippedSeqRanges JSON metadata would exceed budget without post-cut adjustment.
    const budget = 47000;
    const result = selectNewestEventsByBudget(rawSource, budget);

    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(result.skippedSeqRanges).toBeDefined();
    expect(result.skippedSeqRanges!.length).toBeGreaterThan(0);
  });
});
