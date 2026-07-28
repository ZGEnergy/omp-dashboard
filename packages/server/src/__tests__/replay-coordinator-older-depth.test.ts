/**
 * Older pages are HISTORY. They were budgeted identically to the live tail, so
 * reaching the start of a long session took one 1.5 MiB round trip per ~1,300
 * events — 15 pages on a real 19,677-event session, ~21 MiB of transfer to see
 * the first prompt.
 *
 * Tool payloads in a page the user is scrolling PAST do not need to be resident:
 * the `toolCallId` fetch path from #104 re-inflates any of them on click. So an
 * older page collapses tools to metadata stubs, which buys far more events per
 * page. The live tail is untouched — that is the content being read now.
 *
 * See change: cheap-older-pages.
 */
import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../memory-event-store.js";
import { projectForHydration } from "../replay-coordinator.js";

const BUDGET = 1.5 * 1024 * 1024;

function toolPair(startSeq: number, resultBytes: number): StoredEvent[] {
  return [
    {
      seq: startSeq,
      event: {
        eventType: "tool_execution_start",
        timestamp: startSeq,
        data: { toolCallId: `t${startSeq}`, toolName: "Read", args: { path: "a.ts" } },
      },
    } as StoredEvent,
    {
      seq: startSeq + 1,
      event: {
        eventType: "tool_execution_end",
        timestamp: startSeq + 1,
        data: { toolCallId: `t${startSeq}`, toolName: "Read", result: "x".repeat(resultBytes) },
      },
    } as StoredEvent,
  ];
}

// 50 calls x 4 KB ~= 210 KB of tool bytes: comfortably UNDER the live tail's
// 25% ceiling (393 KB), so the tail legitimately keeps full payloads and the
// comparison below isolates the older-page policy rather than the ceiling.
const source: StoredEvent[] = Array.from({ length: 50 }, (_, i) => toolPair(1 + i * 2, 4000)).flat();
const FROM_SEQ = source.at(-1)!.seq + 1;

const bytes = (events: readonly StoredEvent[]): number =>
  events.reduce((sum, e) => sum + (JSON.stringify(e) ?? "").length, 0);

const detailLevels = (events: readonly StoredEvent[]): Set<string> => {
  const levels = new Set<string>();
  for (const e of events) {
    const stub = (e.event.data as { toolStub?: { detailLevel?: string } } | undefined)?.toolStub;
    if (stub?.detailLevel) levels.add(stub.detailLevel);
  }
  return levels;
};

describe("older pages are cheaper than the live tail", () => {
  it("collapses tool payloads to metadata on an older page", () => {
    const older = projectForHydration(source, BUDGET, "older", undefined, FROM_SEQ);
    expect(detailLevels(older)).toEqual(new Set(["metadata"]));
  });

  it("leaves the live tail's tool detail alone", () => {
    // Same source, same budget — the tail fits comfortably and keeps full payloads.
    const tail = projectForHydration(source, BUDGET, "cold", "tail");
    expect(detailLevels(tail)).not.toContain("metadata");
  });

  it("fits far more history into one older page", () => {
    const older = projectForHydration(source, BUDGET, "older", undefined, FROM_SEQ);
    const tail = projectForHydration(source, BUDGET, "cold", "tail");
    // At least a 4x density win, so a long session is a handful of pages.
    expect(bytes(older) * 4).toBeLessThan(bytes(tail));
  });

  it("keeps the seq set identical", () => {
    const older = projectForHydration(source, BUDGET, "older", undefined, FROM_SEQ);
    expect(older.map((e) => e.seq)).toEqual(source.map((e) => e.seq));
  });

  it("keeps every stub re-fetchable by toolCallId", () => {
    const older = projectForHydration(source, BUDGET, "older", undefined, FROM_SEQ);
    const stubs = older
      .map((e) => (e.event.data as { toolStub?: { toolCallId?: string } } | undefined)?.toolStub)
      .filter(Boolean);
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) expect(stub!.toolCallId).toMatch(/^t\d+$/);
  });
});
