import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAIL_WINDOW_BYTES,
  MAX_TAIL_WINDOW_BYTES,
  MIN_TAIL_WINDOW_BYTES,
  clampTailWindowBytes,
  estimateSeqEventBytes,
  selectNewestEventsByBudget,
  selectOlderEventsByBudget,
  type SeqEvent,
} from "../event-window.js";

function ev(seq: number, padChars: number): SeqEvent<{ n: number; pad: string }> {
  return { seq, event: { n: seq, pad: "x".repeat(padChars) } };
}

describe("clampTailWindowBytes", () => {
  it("defaults for missing / invalid", () => {
    expect(clampTailWindowBytes(undefined)).toBe(DEFAULT_TAIL_WINDOW_BYTES);
    expect(clampTailWindowBytes(NaN)).toBe(DEFAULT_TAIL_WINDOW_BYTES);
    expect(clampTailWindowBytes(0)).toBe(DEFAULT_TAIL_WINDOW_BYTES);
    expect(clampTailWindowBytes(-1)).toBe(DEFAULT_TAIL_WINDOW_BYTES);
  });

  it("clamps to min/max", () => {
    expect(clampTailWindowBytes(1)).toBe(MIN_TAIL_WINDOW_BYTES);
    expect(clampTailWindowBytes(MIN_TAIL_WINDOW_BYTES)).toBe(MIN_TAIL_WINDOW_BYTES);
    expect(clampTailWindowBytes(MAX_TAIL_WINDOW_BYTES + 1)).toBe(MAX_TAIL_WINDOW_BYTES);
  });
});

describe("selectNewestEventsByBudget", () => {
  it("returns empty for empty input", () => {
    const r = selectNewestEventsByBudget([], 10_000);
    expect(r).toEqual({
      events: [],
      hasMoreOlder: false,
      windowMinSeq: 0,
      windowMaxSeq: 0,
      bytes: 0,
    });
  });

  it("returns all when under budget", () => {
    const all = [ev(1, 10), ev(2, 10), ev(3, 10)];
    const r = selectNewestEventsByBudget(all, 1_000_000);
    expect(r.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(r.hasMoreOlder).toBe(false);
    expect(r.windowMinSeq).toBe(1);
    expect(r.windowMaxSeq).toBe(3);
  });

  it("keeps newest under a tight budget", () => {
    // Each event is large; budget fits roughly two of the smaller ones.
    const all = [ev(1, 800), ev(2, 800), ev(3, 800), ev(4, 800)];
    const oneSize = estimateSeqEventBytes(all[3]!);
    const budget = oneSize * 2 + 10; // fit newest two
    const r = selectNewestEventsByBudget(all, budget);
    expect(r.events.map((e) => e.seq)).toEqual([3, 4]);
    expect(r.hasMoreOlder).toBe(true);
    expect(r.windowMinSeq).toBe(3);
    expect(r.windowMaxSeq).toBe(4);
    expect(r.bytes).toBeLessThanOrEqual(budget);
  });

  it("always keeps the newest event even when it alone exceeds budget", () => {
    const huge = ev(1, 50_000);
    const size = estimateSeqEventBytes(huge);
    // clamp raises tiny budgets to MIN — pass a budget that after clamp still
    // is smaller than `size` by using the raw path: select with budget equal
    // to MIN when size > MIN.
    if (size <= MIN_TAIL_WINDOW_BYTES) {
      // pad further
      const bigger = ev(1, 300_000);
      const r = selectNewestEventsByBudget([bigger], MIN_TAIL_WINDOW_BYTES);
      expect(r.events).toHaveLength(1);
      expect(r.hasMoreOlder).toBe(false);
      expect(r.bytes).toBeGreaterThan(MIN_TAIL_WINDOW_BYTES);
    } else {
      const r = selectNewestEventsByBudget([huge], MIN_TAIL_WINDOW_BYTES);
      expect(r.events).toHaveLength(1);
      expect(r.events[0]!.seq).toBe(1);
    }
  });

  it("outputs ascending seq order", () => {
    const all = [ev(10, 50), ev(20, 50), ev(30, 50)];
    const r = selectNewestEventsByBudget(all, 1_000_000);
    const seqs = r.events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

describe("selectOlderEventsByBudget", () => {
  it("pages strictly older than fromSeq", () => {
    const all = [ev(1, 20), ev(2, 20), ev(3, 20), ev(4, 20), ev(5, 20)];
    const r = selectOlderEventsByBudget(all, 4, 1_000_000);
    expect(r.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(r.hasMoreOlder).toBe(false);
    expect(r.windowMaxSeq).toBe(3);
  });

  it("applies budget on the older prefix", () => {
    const all = [ev(1, 800), ev(2, 800), ev(3, 800), ev(4, 800), ev(5, 800)];
    const oneSize = estimateSeqEventBytes(all[2]!);
    const r = selectOlderEventsByBudget(all, 5, oneSize * 2 + 10);
    // older = 1..4; newest-first of those under budget → 3,4
    expect(r.events.map((e) => e.seq)).toEqual([3, 4]);
    expect(r.hasMoreOlder).toBe(true);
  });

  it("empty when fromSeq at/below oldest", () => {
    const all = [ev(5, 10), ev(6, 10)];
    const r = selectOlderEventsByBudget(all, 5, 1_000_000);
    expect(r.events).toEqual([]);
    expect(r.hasMoreOlder).toBe(false);
  });
});
