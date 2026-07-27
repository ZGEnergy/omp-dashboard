import { applyToolBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { coalesceProjection } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../memory-event-store.js";
import { projectForHydration } from "../replay-coordinator.js";

function toolPair(startSeq: number, toolCallId: string, resultBytes: number): StoredEvent[] {
  return [
    {
      seq: startSeq,
      event: {
        eventType: "tool_execution_start",
        timestamp: startSeq,
        data: { toolCallId, toolName: "Read" },
      },
    } as StoredEvent,
    {
      seq: startSeq + 1,
      event: {
        eventType: "tool_execution_end",
        timestamp: startSeq + 1,
        data: { toolCallId, result: "x".repeat(resultBytes) },
      },
    } as StoredEvent,
  ];
}

const BUDGET = 1.5 * 1024 * 1024;
const source: StoredEvent[] = [
  {
    seq: 1,
    event: {
      eventType: "message_end",
      timestamp: 1,
      data: { message: { role: "user", content: [{ type: "text", text: "go" }] } },
    },
  } as StoredEvent,
  ...Array.from({ length: 40 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 200_000)).flat(),
];

describe("projectForHydration", () => {
  it("applies coalesce + budget for cold tail", () => {
    const out = projectForHydration(source, BUDGET, "cold", "tail");
    expect(out.map((e) => e.seq)).toEqual(source.map((e) => e.seq));
    expect(JSON.stringify(out)).toEqual(JSON.stringify(applyToolBudget(coalesceProjection(source), BUDGET).events));
  });

  it("applies coalesce + budget for older paging", () => {
    const out = projectForHydration(source, BUDGET, "older", undefined);
    expect(JSON.stringify(out)).toEqual(JSON.stringify(applyToolBudget(coalesceProjection(source), BUDGET).events));
  });

  it("applies coalesce ONLY for delta — live catch-up keeps full payloads", () => {
    const out = projectForHydration(source, BUDGET, "delta", undefined);
    expect(JSON.stringify(out)).toEqual(JSON.stringify(coalesceProjection(source)));
  });

  it("applies coalesce ONLY for legacy full mode", () => {
    const out = projectForHydration(source, BUDGET, "cold", undefined);
    expect(JSON.stringify(out)).toEqual(JSON.stringify(coalesceProjection(source)));
  });

  it("leaves the range contiguous so the window selector accepts it", () => {
    const out = projectForHydration(source, BUDGET, "cold", "tail");
    for (let i = 1; i < out.length; i += 1) expect(out[i]!.seq).toBe(out[i - 1]!.seq + 1);
  });

  it("actually degrades a tool-heavy range under the cold tail path", () => {
    const out = projectForHydration(source, BUDGET, "cold", "tail");
    const stubbed = out.filter(
      (e) => (e.event.data as Record<string, unknown> | undefined)?.toolStub !== undefined,
    );
    expect(stubbed.length).toBeGreaterThan(0);
  });
});
