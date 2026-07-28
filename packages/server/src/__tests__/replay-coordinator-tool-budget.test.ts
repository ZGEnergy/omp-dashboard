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

  // Regression: the budget must scope to the PAGE, not the whole session.
  // Degradation is oldest-first, so budgeting the whole session spent the
  // entire tool ceiling on the newest calls — which are not in the older page
  // at all — and handed back a page of content-free `metadata` stubs while
  // leaving ~93% of the byte budget unspent.
  describe("older paging scopes the budget to the page", () => {
    const big: StoredEvent[] = [
      ...Array.from({ length: 300 }, (_, i) => toolPair(1 + i * 2, `t${i}`, 20_000)).flat(),
    ];
    const fromSeq = 121; // page back over the oldest 60 calls

    function detailLevels(events: StoredEvent[], onlyBelow: number) {
      const levels: Record<string, number> = {};
      for (const entry of events) {
        if (entry.seq >= onlyBelow) continue;
        if (entry.event.eventType !== "tool_execution_end") continue;
        const stub = (entry.event.data as Record<string, unknown>).toolStub as
          | { detailLevel: string }
          | undefined;
        const key = stub?.detailLevel ?? "full";
        levels[key] = (levels[key] ?? 0) + 1;
      }
      return levels;
    }

    // REVERSAL OF A PRIOR DECISION. #104 required an older page to RETAIN tool
    // detail ("what must NOT happen is a total collapse of the page"), on the
    // reasoning that a page of content-free stubs wastes the byte budget.
    //
    // Measured against a real 19,677-event session, that policy cost ~1,300
    // events per 1.5 MiB page: 15 round trips and ~21 MiB to reach the first
    // user prompt, which in practice meant the start of a long session was
    // unreachable. Depth per page is worth more here than detail on history the
    // user is scrolling past, and no detail is actually lost — every stub
    // re-inflates on click via the `toolCallId` fetch path #104 itself added.
    //
    // See change: cheap-older-pages.
    it("collapses the whole page to metadata so one page reaches much further back", () => {
      const out = projectForHydration(big, BUDGET, "older", undefined, fromSeq);
      const levels = detailLevels(out, fromSeq);
      expect(levels.full ?? 0).toBe(0);
      expect(levels.sliced ?? 0).toBe(0);
      expect(levels.metadata).toBe(60);
    });

    // The density win itself is measured in replay-coordinator-older-depth.test.ts,
    // on a fixture small enough that the live tail legitimately keeps full
    // payloads — here everything is over the ceiling either way, so the two
    // policies coincide below `fromSeq` and the comparison proves nothing.

    it("stubs ONLY the page — events at or above fromSeq are untouched", () => {
      // The `fromSeq` restriction still matters: it bounds which events the
      // page owns, so paging back never degrades the tail already on screen.
      const out = projectForHydration(big, BUDGET, "older", undefined, fromSeq);
      const coalesced = coalesceProjection(big) as StoredEvent[];
      const above = (events: StoredEvent[]) => events.filter((e) => e.seq >= fromSeq);
      expect(JSON.stringify(above(out))).toEqual(JSON.stringify(above(coalesced)));
    });

    it("leaves the seq set of the full range untouched", () => {
      const out = projectForHydration(big, BUDGET, "older", undefined, fromSeq);
      expect(out.map((e) => e.seq)).toEqual(big.map((e) => e.seq));
    });

    it("falls back to coalesce-only when fromSeq is absent", () => {
      const out = projectForHydration(big, BUDGET, "older", undefined);
      expect(JSON.stringify(out)).toEqual(JSON.stringify(coalesceProjection(big)));
    });
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
