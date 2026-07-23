/**
 * Regression for issue #81 — Load-older bounces the viewport to the oldest
 * loaded message.
 *
 * `virtualRowKey` falls back to `messageKey`, which for rows carrying neither
 * `nonce` nor `entryId` keys off the reducer `id`. Thinking rows never get a
 * nonce/entryId, so their key is their id. The fix makes that id STABLE: the
 * reducer stamps thinking rows with `thinking-${seq}-${ordinal}` where `seq` is
 * the intrinsic server event sequence number (does NOT renumber on prepend) and
 * `ordinal` is a stable within-`message_end` emission counter (never the render
 * index). So a scroll anchor captured on the "block-2" reasoning row still
 * resolves to that SAME row after an older page prepends and App re-reduces the
 * whole merged event buffer. ChatView's restore does exactly:
 *
 *   const index = renderRows.findIndex((row, i) => virtualRowKey(row, i) === anchor.rowId);
 *   virtualizer.scrollToIndex(index, { align: "start" });
 *
 * so a stable key keeps the reader on their row instead of bouncing to the top.
 *
 * This is a pure logic repro of that lookup — no DOM/virtualizer timing (jsdom's
 * virtualizer shim reports 0-height rows, so a scrollTop assertion would be
 * vacuous; see ChatView.scroll-race.test.tsx).
 */

import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { virtualRowKey } from "../chat-virtual-rows.js";
import { createInitialState, reduceEvent, type SessionState } from "../event-reducer.js";
import type { ToolCallGroup } from "../group-tool-calls.js";

let ts = 1000;
/** Monotonic per-event seq stamped at build time (intrinsic to the event). */
let nextSeq = 1;
/** Seq travels WITH the event object (via a WeakMap) so the SAME hot-buffer
 * event objects reduce with IDENTICAL seq in both the before and after
 * reductions — mirroring production, where seq is intrinsic and never derived
 * from the array/loop position. */
const seqOf = new WeakMap<DashboardEvent, number>();

/** One reasoning turn whose flushed thinking row carries the given marker text. */
function thinkingTurn(marker: string): DashboardEvent[] {
  const mk = (type: string, extra: Record<string, unknown> = {}): DashboardEvent => {
    const e: DashboardEvent = {
      eventType: "message_update",
      timestamp: (ts += 100),
      data: { assistantMessageEvent: { type, ...extra } },
    };
    seqOf.set(e, nextSeq++);
    return e;
  };
  return [mk("thinking_start"), mk("thinking_delta", { delta: marker }), mk("thinking_end")];
}

function reduceAll(events: DashboardEvent[]): SessionState {
  let s = createInitialState();
  // Thread each event's intrinsic seq (from seqOf), NOT the loop index — so
  // reused event objects reduce identically across re-reductions.
  for (const e of events) s = reduceEvent(s, e, { seq: seqOf.get(e) }); // replay path (cold-load / older merge)
  return s;
}

/** Mirror ChatView's restore-index lookup exactly. */
function restoreIndex(rows: SessionState["messages"], anchorRowId: string): number {
  return rows.findIndex((row, i) => virtualRowKey(row, i) === anchorRowId);
}

describe("Load-older anchor stability (issue #81)", () => {
  it("keeps the anchor pointing at the SAME reading row after an older page prepends", () => {
    // Hot buffer the user is currently reading: four reasoning turns.
    const hotEvents = [
      ...thinkingTurn("block-0"),
      ...thinkingTurn("block-1"),
      ...thinkingTurn("block-2"),
      ...thinkingTurn("block-3"),
    ];
    const before = reduceAll(hotEvents).messages;
    const thinkingBefore = before.filter((m) => m.role === "thinking");
    expect(thinkingBefore.map((m) => m.content)).toEqual(["block-0", "block-1", "block-2", "block-3"]);

    // The topmost visible row is the "block-2" reasoning row — this is what
    // captureOlderAnchor records as anchor.rowId.
    const readingRow = before.findIndex((m) => m.content === "block-2");
    const anchorRowId = virtualRowKey(before[readingRow], readingRow);
    expect(anchorRowId).toMatch(/^thinking-\d+-0$/); // seq-based stable key

    // Load-older returns an older page (lower seq). App merges + RE-REDUCES the
    // full buffer from a fresh initial state. The older page carries LOWER seqs
    // than the hot buffer (older = lower), and the hot events keep their
    // original seqs, so the block-2 thinking key is byte-identical afterwards.
    const olderEvents = [...olderTurn("olderA-0"), ...olderTurn("olderA-1")];
    const after = reduceAll([...olderEvents, ...hotEvents]).messages;

    // ChatView restores by finding the row whose key === the captured anchor id.
    const idx = restoreIndex(after, anchorRowId);
    expect(idx).toBeGreaterThanOrEqual(0);

    // FIX: the seq-based key still resolves to the SAME reading row ("block-2")
    // after the prepend, so scrollToIndex holds the viewport instead of bouncing
    // to the oldest loaded region.
    expect(after[idx].content).toBe("block-2");
  });

  it("group: a populated tool group keys off its first member across a prepend", () => {
    // A collapsed tool group keys off its first member's stable `tool-*` id, so
    // its anchor is position-independent — building the same group after an
    // older-page prepend yields a byte-identical key.
    const makeGroup = (): ToolCallGroup => ({
      type: "group",
      toolName: "bash",
      messages: [
        { role: "toolResult", content: "", timestamp: 0, id: "tool-call-aaa", toolName: "bash" },
        { role: "toolResult", content: "", timestamp: 0, id: "tool-call-bbb", toolName: "bash" },
        { role: "toolResult", content: "", timestamp: 0, id: "tool-call-ccc", toolName: "bash" },
      ],
      rendered: [],
      summary: "bash",
    });
    const before = virtualRowKey(makeGroup(), 3);
    const after = virtualRowKey(makeGroup(), 8); // same group, different position
    expect(before).toBe("tool-call-aaa");
    expect(after).toBe(before);
  });

  it("control: rows carrying a stable entryId survive the same prepend", () => {
    // A row with an entryId keys off it (position-independent), so its anchor is
    // immune — proving the defect was specific to the positional-id fallback.
    const rowsBefore = [
      { role: "assistant" as const, content: "a", timestamp: 0, id: "msg-3", entryId: "persist-xyz" },
    ];
    const anchorRowId = virtualRowKey(rowsBefore[0], 0);
    expect(anchorRowId).toBe("persist-xyz");

    // After a prepend the same logical row is now at index 5 with a renumbered
    // reducer id, but its entryId is unchanged.
    const rowsAfter = [
      ...Array.from({ length: 5 }, (_, i) => ({ role: "user" as const, content: "old", timestamp: 0, id: `msg-${i}` })),
      { role: "assistant" as const, content: "a", timestamp: 0, id: "msg-8", entryId: "persist-xyz" },
    ];
    const idx = rowsAfter.findIndex((row, i) => virtualRowKey(row, i) === anchorRowId);
    expect(rowsAfter[idx].content).toBe("a");
  });
});

/**
 * Like `thinkingTurn`, but stamps seqs LOWER than any hot-buffer event so the
 * prepended older page mirrors production (older page = lower seq). Uses a
 * descending counter that stays below the hot buffer's `nextSeq` start.
 */
let nextOlderSeq = -1;
function olderTurn(marker: string): DashboardEvent[] {
  const mk = (type: string, extra: Record<string, unknown> = {}): DashboardEvent => {
    const e: DashboardEvent = {
      eventType: "message_update",
      timestamp: (ts += 100),
      data: { assistantMessageEvent: { type, ...extra } },
    };
    seqOf.set(e, nextOlderSeq--);
    return e;
  };
  return [mk("thinking_start"), mk("thinking_delta", { delta: marker }), mk("thinking_end")];
}
