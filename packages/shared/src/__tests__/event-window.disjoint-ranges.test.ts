import { describe, expect, it } from "vitest";
import {
  estimateSeqEventBytes,
  type SeqEvent,
  selectNewestEventsByBudget,
} from "../event-window.js";
import type { DashboardEvent } from "../types.js";

function makeSkippedRangeEvent(seq: number, fromSeq: number, toSeq: number, payloadPadBytes: number): SeqEvent<DashboardEvent> {
  return {
    seq,
    event: {
      eventType: "skipped_range",
      timestamp: 1000 + seq,
      data: {
        fromSeq,
        toSeq,
        padding: "X".repeat(payloadPadBytes),
      },
    },
  };
}

function makeUserStartEvent(seq: number, content: string): SeqEvent<DashboardEvent> {
  return {
    seq,
    event: {
      eventType: "message_start",
      timestamp: 1000 + seq,
      data: {
        message: {
          role: "user",
          content,
        },
      },
    },
  };
}

function makeAssistantUpdateEvent(seq: number, text: string): SeqEvent<DashboardEvent> {
  return {
    seq,
    event: {
      eventType: "message_update",
      timestamp: 1000 + seq,
      data: {
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
        },
      },
    },
  };
}

describe("event-window disjoint skipped ranges budget regression", () => {
  it("handles many old disjoint skipped ranges exceeding budget in aggregate while selecting newest readable suffix starting at newest user boundary", () => {
    const source: SeqEvent<DashboardEvent>[] = [];

    // Create 100 old disjoint skipped range events, each carrying 5 KiB of payload.
    // Aggregate size of old disjoint skipped ranges = ~500 KiB.
    for (let i = 1; i <= 100; i++) {
      const fromSeq = (i - 1) * 10 + 1;
      const toSeq = i * 10;
      source.push(makeSkippedRangeEvent(i, fromSeq, toSeq, 5 * 1024));
    }

    // Seq 101: Newest user turn start boundary
    const NEWEST_USER_SEQ = 101;
    source.push(makeUserStartEvent(NEWEST_USER_SEQ, "Run code review check"));

    // Seq 102..110: Assistant updates and a small clipped skipped range near tail
    for (let seq = 102; seq <= 108; seq++) {
      source.push(makeAssistantUpdateEvent(seq, `Step ${seq - 101} output`));
    }
    // A clipped skipped range near tail
    source.push(makeSkippedRangeEvent(109, 1000, 1000, 128));
    source.push(makeAssistantUpdateEvent(110, "Final step output"));

    // Set tail window budget to 50 KiB.
    // Aggregate old skipped ranges (500 KiB) exceed budget by 10x.
    // However, the newest user turn (seq 101..110) is only ~5 KiB.
    const budget = 50 * 1024;

    const result = selectNewestEventsByBudget(source, budget);

    // 1. Result must be non-empty and start at the newest user turn boundary (seq 101)
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0]!.seq).toBe(NEWEST_USER_SEQ);
    expect(result.windowMinSeq).toBe(NEWEST_USER_SEQ);
    expect(result.windowMaxSeq).toBe(110);

    // 2. Charged frame bytes must be <= requested budget
    expect(result.bytes).toBeLessThanOrEqual(budget);

    // 3. Must indicate older history exists (hasMoreOlder = true)
    expect(result.hasMoreOlder).toBe(true);

    // 4. Must not be marked as partialHead since it starts cleanly at the user start turn
    expect(result.partialHead).toBe(false);

    // 5. Verify byte accounting matches actual serialized total of selected entries
    const skippedRangeBytes = result.skippedSeqRanges
      ? new TextEncoder().encode(JSON.stringify(result.skippedSeqRanges)).byteLength
      : 0;
    const actualBytes = result.events.reduce(
      (total, entry) => total + estimateSeqEventBytes(entry),
      skippedRangeBytes,
    );
    expect(result.bytes).toBe(actualBytes);
  });
});
