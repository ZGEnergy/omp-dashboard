import { describe, expect, it } from "vitest";
import type { DashboardEvent } from "../types.js";
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
import { prepareEventForReplay } from "../prepare-event-for-replay.js";

function event(eventType: string, data: Record<string, unknown> = {}): DashboardEvent {
  return { eventType, timestamp: 1, data };
}

function ev(seq: number, padChars: number): SeqEvent<DashboardEvent> {
  return { seq, event: event("message_update", { n: seq, pad: "x".repeat(padChars) }) };
}

function serializedEnvelopeBytes(entry: SeqEvent<DashboardEvent>): number {
  return new TextEncoder().encode(JSON.stringify(entry)).byteLength;
}

function serializedEnvelopeTotal(entries: readonly SeqEvent<DashboardEvent>[]): number {
  return entries.reduce((total, entry) => total + serializedEnvelopeBytes(entry), 0);
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
  it("returns nullable ranges for empty input", () => {
    const r = selectNewestEventsByBudget([], 10_000);
    expect(r).toEqual({
      events: [],
      hasMoreOlder: false,
      partialHead: false,
      windowMinSeq: null,
      windowMaxSeq: null,
      bytes: 0,
    });
  });

  it("treats a complete userless handoff source as a stable replay window", () => { const all = [ev(1, 10), ev(2, 10), ev(3, 10)]; const r = selectNewestEventsByBudget(all, 1_000_000); expect(r.events.map((e) => e.seq)).toEqual([1, 2, 3]); expect(r.hasMoreOlder).toBe(false); expect(r.windowMinSeq).toBe(1); expect(r.windowMaxSeq).toBe(3); expect(r.partialHead).toBe(false); });

  it("keeps a bounded userless handoff tail stable instead of requesting every older page", () => { const all = [ev(1, 800), ev(2, 800), ev(3, 800), ev(4, 800)]; const oneSize = estimateSeqEventBytes(all[3]!); const budget = oneSize * 2 + 10; const r = selectNewestEventsByBudget(all, budget); expect(r.events.map((e) => e.seq)).toEqual([3, 4]); expect(r.hasMoreOlder).toBe(true); expect(r.windowMinSeq).toBe(3); expect(r.windowMaxSeq).toBe(4); expect(r.partialHead).toBe(false); expect(r.bytes).toBeLessThanOrEqual(budget); expect(r.bytes).toBe(serializedEnvelopeTotal(r.events)); expect(r.bytes + serializedEnvelopeBytes(all[1]!)).toBeGreaterThan(budget); });

  it("never exceeds the budget when the newest turn is oversized", () => {
    const all: SeqEvent<DashboardEvent>[] = [
      { seq: 1, event: event("message_start", { message: { role: "user", content: "go" } }) },
      ...Array.from({ length: 8 }, (_, index) => ev(index + 2, 180)),
    ];
    const oneSize = estimateSeqEventBytes(all.at(-1)!);
    const budget = oneSize * 2 + 20;
    const r = selectNewestEventsByBudget(all, budget);
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events[0]!.seq).toBeGreaterThan(1);
    expect(r.events.map((entry) => entry.seq)).toEqual(
      Array.from({ length: r.events.length }, (_, index) => r.events[0]!.seq + index),
    );
    expect(r.partialHead).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(budget);
  });

  it("accounts oversized events at a per-event cap so other turns still fit", () => {
    const all: SeqEvent<DashboardEvent>[] = [
      { seq: 1, event: event("message_start", { message: { role: "user", content: "first" } }) },
      { seq: 2, event: event("message_update", { pad: "x".repeat(3 * 1024 * 1024) }) },
      { seq: 3, event: event("message_start", { message: { role: "user", content: "second" } }) },
      { seq: 4, event: event("message_update", { pad: "tiny" }) },
    ];
    const r = selectNewestEventsByBudget(all, 1024 * 1024, { maxEventBytes: 100 * 1024 });
    // Without the per-event cap the 3 MiB event consumes the whole 1 MiB
    // selection budget even though it is delivered truncated, crowding the
    // first turn out of the tail window.
    expect(r.events.map((entry) => entry.seq)).toEqual([1, 2, 3, 4]);
    expect(r.hasMoreOlder).toBe(false);
    expect(r.windowMinSeq).toBe(1);
    expect(r.windowMaxSeq).toBe(4);
    expect(r.bytes).toBeLessThanOrEqual(1024 * 1024);
  });

  it("outputs ascending contiguous seq order", () => {
    const all = [ev(10, 50), ev(11, 50), ev(12, 50)];
    const r = selectNewestEventsByBudget(all, 1_000_000);
    expect(r.events.map((entry) => entry.seq)).toEqual([10, 11, 12]);
  });

  it("classifies a noncontiguous source instead of returning a valid-looking range", () => {
    const r = selectNewestEventsByBudget([ev(10, 10), ev(20, 10), ev(21, 10)], 1_000_000);
    expect(r.events).toEqual([]);
    expect(r.sourceMalformed).toBe(true);
    expect(r.windowMinSeq).toBeNull();
    expect(r.windowMaxSeq).toBeNull();
  });

  it.each([
    { label: "duplicate", source: [ev(1, 1), ev(1, 1)] },
    { label: "descending", source: [ev(2, 1), ev(1, 1)] },
    { label: "noninteger", source: [{ ...ev(1, 1), seq: 1.5 }] },
    { label: "unsafe", source: [{ ...ev(1, 1), seq: Number.MAX_SAFE_INTEGER + 1 }] },
  ])("rejects $label sequences through newest and older selectors", ({ source }) => {
    const newest = selectNewestEventsByBudget(source as SeqEvent<DashboardEvent>[], 1_000);
    const older = selectOlderEventsByBudget(source as SeqEvent<DashboardEvent>[], 100, 1_000);
    const expected = {
      events: [],
      hasMoreOlder: false,
      partialHead: false,
      windowMinSeq: null,
      windowMaxSeq: null,
      bytes: 0,
      sourceMalformed: true,
    };
    expect(newest).toEqual(expected);
    expect(older).toEqual(expected);
  });

  it("classifies null or non-array sources without throwing", () => {
    expect(selectNewestEventsByBudget(null as unknown as SeqEvent<DashboardEvent>[]).sourceMalformed).toBe(true);
    expect(selectOlderEventsByBudget(null as unknown as SeqEvent<DashboardEvent>[], 2).sourceMalformed).toBe(true);
    expect(selectNewestEventsByBudget({} as unknown as SeqEvent<DashboardEvent>[]).sourceMalformed).toBe(true);
  });

  it("keeps an oversized single newest event bounded and usable", () => {
    const huge: SeqEvent<DashboardEvent> = {
      seq: 1,
      event: event("message_start", {
        message: { role: "user", content: "🙂".repeat(2_000) },
      }),
    };
    const r = selectNewestEventsByBudget([huge], 512);
    expect(r.events).toHaveLength(1);
    expect(r.windowMinSeq).toBe(1);
    expect(r.windowMaxSeq).toBe(1);
    expect(r.partialHead).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(512);
    const serialized = JSON.stringify(r.events[0]);
    expect(new TextEncoder().encode(serialized).byteLength).toBe(r.bytes);
    expect(serialized).toContain("earlier output hidden by byte limit");
    expect(serialized).not.toContain("🙂".repeat(2_000));
  });

  it.each([
    { seq: 1, event: { eventType: "message_update", timestamp: 1 } },
    { seq: 1, event: null },
    { seq: 1, event: 42 },
    { seq: 1, event: { eventType: "message_update", timestamp: 1, data: null } },
    { seq: 1, event: { eventType: null, timestamp: 1, data: {} } },
    { seq: 1, event: { eventType: "message_update", timestamp: null, data: {} } },
  ])("classifies malformed entries as an empty source", (entry) => {
    const source = [entry] as unknown as SeqEvent<DashboardEvent>[];
    expect(selectNewestEventsByBudget(source)).toEqual({
      events: [],
      hasMoreOlder: false,
      partialHead: false,
      windowMinSeq: null,
      windowMaxSeq: null,
      bytes: 0,
      sourceMalformed: true,
    });
    expect(selectOlderEventsByBudget(source, 2)).toEqual({
      events: [],
      hasMoreOlder: false,
      partialHead: false,
      windowMinSeq: null,
      windowMaxSeq: null,
      bytes: 0,
      sourceMalformed: true,
    });
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

  it("keeps a bounded userless older page stable", () => { const all = [ev(1, 800), ev(2, 800), ev(3, 800), ev(4, 800), ev(5, 800)]; const oneSize = estimateSeqEventBytes(all[2]!); const r = selectOlderEventsByBudget(all, 5, oneSize * 2 + 10); expect(r.events.map((e) => e.seq)).toEqual([3, 4]); expect(r.hasMoreOlder).toBe(true); expect(r.partialHead).toBe(false); });

  it("expands older pages by complete user turns within budget", () => {
    const all: SeqEvent<DashboardEvent>[] = [
      { seq: 1, event: event("message_start", { message: { role: "user", content: "old" } }) },
      ev(2, 150),
      { seq: 3, event: event("message_start", { message: { role: "user", content: "new" } }) },
      ev(4, 20),
      ev(5, 20),
    ];
    const budget = all.slice(2).reduce((total, entry) => total + serializedEnvelopeBytes(entry), 0) + 10;
    const r = selectOlderEventsByBudget(all, 6, budget);
    expect(r.events.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(r.partialHead).toBe(false);
    expect(r.hasMoreOlder).toBe(true);
    expect(r.bytes).toBe(serializedEnvelopeTotal(r.events));
    expect(r.bytes + serializedEnvelopeBytes(all[1]!)).toBeGreaterThan(budget);
  });

  it("returns nullable ranges when no older event exists", () => {
    const all = [ev(5, 10), ev(6, 10)];
    const r = selectOlderEventsByBudget(all, 5, 1_000_000);
    expect(r.events).toEqual([]);
    expect(r.windowMinSeq).toBeNull();
    expect(r.windowMaxSeq).toBeNull();
    expect(r.hasMoreOlder).toBe(false);
    expect(r.partialHead).toBe(false);
  });
});

describe("semantic replay preparation", () => {
  it("measures actual UTF-8 wire bytes", () => {
    const entry: SeqEvent<DashboardEvent> = {
      seq: 1,
      event: event("message_update", { text: "🙂漢字" }),
    };
    expect(estimateSeqEventBytes(entry)).toBe(
      new TextEncoder().encode(JSON.stringify(entry)).byteLength,
    );
    expect(estimateSeqEventBytes(entry)).toBeGreaterThan(JSON.stringify(entry).length);
  });

  it("starts a bounded tail at the newest complete user turn", () => {
    const all: SeqEvent<DashboardEvent>[] = [
      { seq: 1, event: event("message_start", { message: { role: "user", content: "old" } }) },
      ev(2, 900),
      { seq: 3, event: event("message_start", { message: { role: "user", content: "new" } }) },
      ev(4, 10),
      ev(5, 10),
    ];
    const newestTurnBytes = all.slice(2).reduce((sum, entry) => sum + estimateSeqEventBytes(entry), 0);
    const r = selectNewestEventsByBudget(all, newestTurnBytes + 10);
    expect(r.events.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(r.partialHead).toBe(false);
    expect(r.hasMoreOlder).toBe(true);
    expect(r.bytes).toBe(serializedEnvelopeTotal(r.events));
  });

  it("registers inline assets only after selecting their bounded suffix", () => {
    const registered: string[] = [];
    const source: SeqEvent<DashboardEvent>[] = [
      {
        seq: 1,
        event: event("message_end", {
          pad: "x".repeat(100),
          message: { role: "assistant", content: [{ type: "image", data: "drop", mimeType: "image/png" }] },
        }),
      },
      {
        seq: 2,
        event: event("message_end", {
          message: { role: "assistant", content: [{ type: "image", data: "keep", mimeType: "image/png" }] },
        }),
      },
    ];
    const budget = estimateSeqEventBytes(source[1]!) + 10;
    const result = selectNewestEventsByBudget(source, budget, {
      registerInlineAsset: ({ data }) => {
        registered.push(data);
        return `hash-${data}`;
      },
    });
    expect(result.events.map((entry) => entry.seq)).toEqual([2]);
    expect(registered).toEqual(["keep"]);
    expect(JSON.stringify(result.events)).toContain("pi-asset:hash-keep");
    expect(JSON.stringify(result.events)).not.toContain("drop");
    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(result.bytes).toBe(serializedEnvelopeTotal(result.events));
  });

  it("keeps more than fifty selected events ascending and contiguous", () => {
    const all = Array.from({ length: 75 }, (_, index) => ev(index + 1, 1));
    const r = selectNewestEventsByBudget(all, 1_000_000);
    expect(r.events).toHaveLength(75);
    expect(r.events.map((entry) => entry.seq)).toEqual(
      Array.from({ length: 75 }, (_, index) => index + 1),
    );
  });

  it("preserves the exact 200-line display marker and is idempotent", () => {
    const input = event("tool_execution_end", {
      toolCallId: "tool-1",
      toolName: "bash",
      result: Array.from({ length: 240 }, (_, index) => `line-${index + 1}`).join("\n"),
    });
    const first = prepareEventForReplay(input);
    const second = prepareEventForReplay(first.event);
    expect(first.event.data.result).toMatch(/^«40 earlier lines hidden»\nline-41/);
    expect(second.event).toEqual(first.event);
  });

  it("caps a single long line by UTF-8 bytes", () => {
    const input = event("tool_execution_end", {
      toolCallId: "tool-1",
      toolName: "bash",
      result: "🙂".repeat(200),
    });
    const prepared = prepareEventForReplay(input, { maxTextBytes: 96 });
    expect(new TextEncoder().encode(String(prepared.event.data.result)).byteLength).toBeLessThanOrEqual(96);
    expect(String(prepared.event.data.result)).toContain("byte limit");
  });

  it("canonicalizes circular data while retaining the envelope, siblings, and self marker", () => {
    const data: Record<string, unknown> = { text: "ok", sibling: { valid: true } };
    data.self = data;
    const prepared = prepareEventForReplay(event("message_update", data));
    expect(prepared.event).toEqual({
      eventType: "message_update",
      timestamp: 1,
      data: {
        text: "ok",
        sibling: { valid: true },
        self: "[unavailable: circular reference]",
      },
    });
    expect(prepared.issues.map((issue) => issue.code)).toContain("serialization_failed");
    expect(() => JSON.stringify(prepared.event)).not.toThrow();
    expect(() => estimateSeqEventBytes({ seq: 1, event: prepared.event })).not.toThrow();
  });

  it("collects only bounded asset references from prepared content", () => {
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "![one](pi-asset:abc123) and pi-asset:def456" }],
        },
      }),
    );
    expect(prepared.assetHashes).toEqual(["abc123", "def456"]);
  });

  it("registers inline result content images before display conversion", () => {
    const registered: string[] = [];
    const prepared = prepareEventForReplay(
      event("tool_execution_end", {
        toolCallId: "tool-1",
        toolName: "bash",
        result: {
          content: [
            { type: "text", text: "done" },
            { type: "image", data: "AAAA", mimeType: "image/png" },
          ],
        },
      }),
      {
        registerInlineAsset: (asset) => {
          registered.push(asset.data);
          return "asset123";
        },
      },
    );
    expect(registered).toEqual(["AAAA"]);
    expect(prepared.assetHashes).toEqual(["asset123"]);
    expect(JSON.stringify(prepared.event)).not.toContain("AAAA");
    expect(String(prepared.event.data.result)).toContain("pi-asset:asset123");
  });


  it("retains duplicate inline image blocks while deduplicating registration", () => {
    const registered: string[] = [];
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: [
            { type: "image", data: "SAME", mimeType: "image/png" },
            { type: "image", data: "SAME", mimeType: "image/png" },
            { type: "image", data: "DIFFERENT", mimeType: "image/png" },
          ],
        },
      }),
      {
        registerInlineAsset: ({ data }) => {
          registered.push(data);
          return data === "SAME" ? "asset-same" : "asset-different";
        },
      },
    );
    expect(registered).toEqual(["SAME", "DIFFERENT"]);
    expect(prepared.event.data.message).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "![image](pi-asset:asset-same)" },
        { type: "text", text: "![image](pi-asset:asset-same)" },
        { type: "text", text: "![image](pi-asset:asset-different)" },
      ],
    });
    expect(prepared.assetHashes).toEqual(["asset-same", "asset-different"]);
    expect(JSON.stringify(prepared.event)).not.toContain("SAME");
    expect(JSON.stringify(prepared.event)).not.toContain("DIFFERENT");
  });

  it("keeps prepared legacy data.images assets idempotent", () => {
    const first = prepareEventForReplay(
      event("message_end", { images: [{ data: "AAAA", mimeType: "image/png" }] }),
      { registerInlineAsset: () => "asset123" },
    );
    const second = prepareEventForReplay(first.event);
    expect(second.event).toEqual(first.event);
    expect(second.assetHashes).toEqual(["asset123"]);
    expect(second.issues.map((issue) => issue.code)).not.toContain("malformed_content_block");
  });


  it("does not register canonical asset or unavailable blocks", () => {
    let registrations = 0;
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: [
            { type: "asset", hash: "known", mimeType: "image/png", src: "pi-asset:known" },
            { type: "asset_unavailable", mimeType: "image/jpeg" },
          ],
        },
      }),
      { registerInlineAsset: () => { registrations += 1; return "unexpected"; } },
    );
    expect(registrations).toBe(0);
    expect(prepared.event.data.message).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "![image](pi-asset:known)" },
        { type: "text", text: "[image unavailable]" },
      ],
    });
    expect(prepared.assetHashes).toEqual(["known"]);
  });

  it("canonicalizes pre-marked unavailable assets without retaining inline fields", () => {
    const prepared = prepareEventForReplay(
      event("message_end", {
        images: [{ type: "asset_unavailable", data: "AAAA", mimeType: "image/png", extra: "x" }],
      }),
    );
    expect(prepared.event.data.images).toEqual([{ type: "asset_unavailable", mimeType: "image/png" }]);
    expect(JSON.stringify(prepared.event)).not.toContain("AAAA");
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
  });

  it("classifies malformed message content blocks without throwing", () => {
    const prepared = prepareEventForReplay(
      event("message_end", { message: { role: "assistant", content: [null, { type: "text", text: "ok" }] } }),
    );
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
    expect(() => JSON.stringify(prepared.event)).not.toThrow();
  });

  it("classifies malformed direct result blocks and tool names without throwing", () => {
    const prepared = prepareEventForReplay(
      event("tool_execution_start", {
        toolCallId: "tool-1",
        result: [{ type: "text", text: 42 }, null],
      }),
    );
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_tool_event");
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
    expect(() => JSON.stringify(prepared.event)).not.toThrow();
  });

  it("replaces unique asset references beyond the delivery cap", () => {
    const references = Array.from({ length: 129 }, (_, index) => `pi-asset:hash${index + 1}`).join(" ");
    const prepared = prepareEventForReplay(event("message_update", { text: references }));
    expect(prepared.assetHashes).toHaveLength(128);
    expect(JSON.stringify(prepared.event)).not.toContain("pi-asset:hash129");
    expect(JSON.stringify(prepared.event)).toContain("asset unavailable");
    expect(prepared.issues.map((issue) => issue.code)).toContain("asset_reference_limit");
  });

  it("keeps duplicate references after exactly 128 unique assets without a false overflow", () => {
    const references = [
      ...Array.from({ length: 128 }, (_, index) => `pi-asset:hash${index + 1}`),
      "pi-asset:hash1",
    ].join(" ");
    const prepared = prepareEventForReplay(event("message_update", { text: references }));
    expect(prepared.assetHashes).toHaveLength(128);
    expect(JSON.stringify(prepared.event)).toContain("pi-asset:hash1");
    expect(prepared.issues.map((issue) => issue.code)).not.toContain("asset_reference_limit");
  });

  it("does not register inline assets beyond the unique delivery cap", () => {
    let registrations = 0;
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: Array.from({ length: 129 }, (_, index) => ({
            type: "image",
            data: `data-${index}`,
            mimeType: "image/png",
          })),
        },
      }),
      {
        registerInlineAsset: () => {
          registrations += 1;
          return `hash${registrations}`;
        },
      },
    );
    expect(registrations).toBe(128);
    expect(prepared.assetHashes).toHaveLength(128);
    expect(JSON.stringify(prepared.event)).toContain("image unavailable");
    expect(JSON.stringify(prepared.event)).not.toContain('"data":"data-128"');
    expect((prepared.event.data.message as { content: unknown[] }).content.at(-1)).toEqual({
      type: "text",
      text: "[image unavailable]",
    });
    expect(prepared.issues.map((issue) => issue.code)).toContain("asset_reference_limit");
  });

  it("turns a throwing inline asset registrar into a recoverable unavailable placeholder", () => {
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
        },
      }),
      { registerInlineAsset: () => { throw new Error("registry unavailable"); } },
    );
    expect(JSON.stringify(prepared.event)).toContain("image unavailable");
    expect(JSON.stringify(prepared.event)).not.toContain("AAAA");
    expect(JSON.stringify(prepared.event)).not.toContain("pi-asset:");
    expect(prepared.event.data.message).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "[image unavailable]" }],
    });
    expect(prepared.assetHashes).toEqual([]);
    expect(prepared.issues.map((issue) => issue.code)).toContain("inline_asset_unavailable");
  });

  it("turns an undefined inline asset registrar result into an unavailable placeholder", () => {
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: [{ type: "image", data: "UNREGISTERED_BYTES", mimeType: "image/png" }],
        },
      }),
      { registerInlineAsset: () => undefined },
    );
    const serialized = JSON.stringify(prepared.event);
    expect(serialized).not.toContain("UNREGISTERED_BYTES");
    expect(serialized).not.toContain("pi-asset:");
    expect(prepared.event.data.message).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "[image unavailable]" }],
    });
    expect(prepared.assetHashes).toEqual([]);
    expect(prepared.issues.map((issue) => issue.code)).toContain("inline_asset_unavailable");
  });

  it("classifies malformed image blocks and replaces their bodies", () => {
    const prepared = prepareEventForReplay(
      event("message_end", {
        message: {
          role: "assistant",
          content: [{ type: "image", data: 42, mimeType: null }],
        },
      }),
    );
    expect(JSON.stringify(prepared.event)).toContain("image unavailable");
    expect(JSON.stringify(prepared.event)).not.toContain('"data":42');
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
  });


  it("does not reinterpret arbitrary data and mimeType records as images", () => {
    let registrations = 0;
    const payload = { type: "blob", data: "{}", mimeType: "application/json" };
    const prepared = prepareEventForReplay(
      event("message_update", { payload }),
      { registerInlineAsset: () => { registrations += 1; return "wrong"; } },
    );
    expect(registrations).toBe(0);
    expect(prepared.event.data.payload).toEqual(payload);
    expect(JSON.stringify(prepared.event)).not.toContain("pi-asset:wrong");
  });

  it("classifies malformed legacy data.images entries", () => {
    const prepared = prepareEventForReplay(
      event("message_end", { images: [{ data: 42, mimeType: "image/png" }] }),
    );
    expect(JSON.stringify(prepared.event)).toContain("asset_unavailable");
    expect(JSON.stringify(prepared.event)).not.toContain('"data":42');
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
  });

  it("canonicalizes every reserved image shape without retaining inline bytes", () => {
    const inlineBytes = "PRIVATE_INLINE_IMAGE_BYTES";
    const prepared = prepareEventForReplay(event("message_end", {
      images: [inlineBytes],
      message: {
        role: "assistant",
        content: [
          { type: "asset_unavailable", mimeType: "image/png", data: inlineBytes, extra: "discard" },
          {
            type: "asset",
            hash: "asset123",
            mimeType: "image/png",
            src: "pi-asset:asset123",
            data: inlineBytes,
            extra: "discard",
          },
        ],
      },
    }));
    expect(prepared.event.data.images).toEqual([{ type: "asset_unavailable" }]);
    expect(prepared.event.data.message).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "[image unavailable]" },
        { type: "text", text: "![image](pi-asset:asset123)" },
      ],
    });
    expect(prepared.assetHashes).toEqual(["asset123"]);
    expect(JSON.stringify(prepared.event)).not.toContain(inlineBytes);
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
  });

  it("canonicalizes reserved assets before traversing arbitrary extras", () => {
    const unavailable: Record<string, unknown> = { type: "asset_unavailable", mimeType: "image/png" };
    unavailable.extra = unavailable;
    const prepared = prepareEventForReplay(event("message_end", {
      images: [null, 42, unavailable],
      message: {
        role: "assistant",
        content: [{ type: "image", data: "inline-secret", mimeType: "image/png", extra: unavailable }],
      },
    }));
    expect(prepared.event.data.images).toEqual([
      { type: "asset_unavailable" },
      { type: "asset_unavailable" },
      { type: "asset_unavailable", mimeType: "image/png" },
    ]);
    expect(prepared.event.data.message).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "[image unavailable]" }],
    });
    expect(JSON.stringify(prepared.event)).not.toContain("inline-secret");
    expect(prepared.issues.map((issue) => issue.code)).toContain("malformed_content_block");
  });

  it.each([
    { eventType: null, timestamp: 1, data: {} },
    { eventType: "message_update", timestamp: 1n, data: {} },
    { eventType: "message_update", timestamp: () => undefined, data: {} },
  ])("canonicalizes malformed event envelopes before replay preparation", (input) => {
    const prepared = prepareEventForReplay(input as unknown as DashboardEvent, { maxEventBytes: 256 });
    expect(prepared.event).toEqual({ eventType: "unknown", timestamp: 0, data: {} });
    expect(() => JSON.stringify(prepared.event)).not.toThrow();
    expect(new TextEncoder().encode(JSON.stringify(prepared.event)).byteLength).toBeLessThanOrEqual(256);
    expect(prepared.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["malformed_event", "serialization_failed"]),
    );
  });

  it("collects admitted references after more than ten thousand bounded nodes", () => {
    const prepared = prepareEventForReplay(
      event("message_update", {
        items: [...Array.from({ length: 10_001 }, () => ({})), "pi-asset:deepHash"],
      }),
    );
    expect(prepared.assetHashes).toEqual(["deepHash"]);
    expect(JSON.stringify(prepared.event)).toContain("pi-asset:deepHash");
  });

  it("keeps every registered event in the final independent selection", () => {
    const source: SeqEvent<DashboardEvent>[] = [
      {
        seq: 1,
        event: event("message_end", {
          message: { role: "assistant", content: [{ type: "image", data: "old", mimeType: "image/png" }] },
        }),
      },
      {
        seq: 2,
        event: event("message_end", {
          message: { role: "assistant", content: [{ type: "image", data: "new", mimeType: "image/png" }] },
        }),
      },
    ];
    const unregistered = selectNewestEventsByBudget(source, 1_000_000);
    const budget = serializedEnvelopeTotal(unregistered.events);
    const registered: string[] = [];
    const result = selectNewestEventsByBudget(source, budget, {
      registerInlineAsset: ({ data }) => {
        registered.push(data);
        return data === "old" ? "h".repeat(400) : "keep";
      },
    });

    expect(registered).toEqual(["old", "new"]);
    expect(result.events.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(result.bytes).toBe(serializedEnvelopeTotal(result.events));
  });

  it("rejects invalid canonical and registrar asset hashes", () => {
    const canonical = prepareEventForReplay(event("message_end", {
      message: {
        role: "assistant",
        content: [{ type: "asset", hash: "bad.hash", mimeType: "image/png", src: "pi-asset:bad.hash" }],
      },
    }));
    expect(canonical.assetHashes).toEqual([]);
    expect(JSON.stringify(canonical.event)).not.toContain("pi-asset:bad.hash");
    expect(canonical.event.data.message).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "[image unavailable]" }],
    });

    const inline = prepareEventForReplay(event("message_end", {
      message: { role: "assistant", content: [{ type: "image", data: "secret", mimeType: "image/png" }] },
    }), { registerInlineAsset: () => "bad.hash" });
    expect(inline.assetHashes).toEqual([]);
    expect(JSON.stringify(inline.event)).not.toContain("pi-asset:");
    expect(JSON.stringify(inline.event)).not.toContain("secret");
    expect(inline.event.data.message).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "[image unavailable]" }],
    });

    const malformedReference = prepareEventForReplay(event("message_update", {
      text: "pi-asset:bad.hash",
    }));
    expect(JSON.stringify(malformedReference.event)).not.toContain("pi-asset:bad.hash");
    expect(malformedReference.assetHashes).toEqual([]);
  });

  it("snapshots accessor-backed entries before preparation", () => {
    let seqReads = 0;
    let eventReads = 0;
    const source = [{
      get seq() {
        if (seqReads++ > 0) throw new Error("seq reread");
        return 1;
      },
      get event() {
        if (eventReads++ > 0) throw new Error("event reread");
        return event("message_update", { text: "one-shot" });
      },
    }] as unknown as SeqEvent<DashboardEvent>[];
    const result = selectNewestEventsByBudget(source, 10_000);
    expect(result.events.map((entry) => entry.seq)).toEqual([1]);
    expect(result.sourceMalformed).toBeUndefined();

    const throwingSource = [{
      get seq(): number {
        throw new Error("unreadable seq");
      },
      event: event("message_update"),
    }] as unknown as SeqEvent<DashboardEvent>[];
    expect(selectNewestEventsByBudget(throwingSource, 10_000)).toEqual({
      events: [],
      hasMoreOlder: false,
      partialHead: false,
      windowMinSeq: null,
      windowMaxSeq: null,
      bytes: 0,
      sourceMalformed: true,
    });
  });
});
