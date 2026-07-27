import { describe, expect, it } from "vitest";
import type { SeqEvent } from "../event-window.js";
import { isCoverageContiguous, projectReplayEvents } from "../replay-projection.js";
import type { DashboardEvent } from "../types.js";

describe("replay projection coverage contiguity", () => {
  it("proves isCoverageContiguous work is bounded by event/range count, not giant skipped range span", () => {
    const GIANT_SPAN_END = 100_000_000_000;
    const skippedRanges = [{ fromSeq: 1, toSeq: GIANT_SPAN_END }];
    const events = [{ seq: GIANT_SPAN_END + 1 }];

    const isContiguous = isCoverageContiguous(
      events,
      skippedRanges,
      1,
      GIANT_SPAN_END + 1,
    );

    expect(isContiguous).toBe(true);
  });

  it("returns false when there is a gap in coverage between skipped ranges and events", () => {
    const skippedRanges = [{ fromSeq: 1, toSeq: 50 }];
    const events = [{ seq: 52 }];

    expect(isCoverageContiguous(events, skippedRanges, 1, 52)).toBe(false);
  });

  it("returns true when events and skipped ranges overlap seamlessly", () => {
    const skippedRanges = [
      { fromSeq: 1, toSeq: 50 },
      { fromSeq: 51, toSeq: 100 },
    ];
    const events = [{ seq: 101 }];

    expect(isCoverageContiguous(events, skippedRanges, 1, 101)).toBe(true);
  });
});

describe("implicit assistant turn grouping in projectReplayEvents", () => {
  it("coalesces assistant message_update sequence lacking message_start/id followed by assistant message_end into skipped ranges", () => {
    const fixture: SeqEvent<DashboardEvent>[] = [
      {
        seq: 1,
        event: {
          eventType: "message_start",
          timestamp: 1,
          data: { message: { role: "user", content: "keep this turn" } },
        },
      },
    ];

    for (let index = 0; index < 300; index += 1) {
      fixture.push({
        seq: index + 2,
        event: {
          eventType: "message_update",
          timestamp: 1,
          data: {
            assistantMessageEvent: { type: "text_delta" },
            message: { role: "assistant", content: [{ type: "text", text: `update ${index}` }] },
          },
        },
      });
    }

    fixture.push({
      seq: 302,
      event: {
        eventType: "message_end",
        timestamp: 1,
        data: { message: { role: "assistant", content: [{ type: "text", text: "final answer" }], stopReason: "stop" } },
      },
    });

    const result = projectReplayEvents(fixture);

    expect(result.events.map((e) => e.seq)).toEqual([1, 302]);
    expect(result.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 301 }]);
    expect(result.events[0]?.event).toMatchObject({ eventType: "message_start" });
    expect(result.events[1]?.event).toMatchObject({
      eventType: "message_end",
      data: { message: { content: [{ text: "final answer" }] } },
    });
  });
});
