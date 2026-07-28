/**
 * Delivery-level contract for a hydration window.
 *
 * WHY THIS FILE EXISTS
 *
 * `coalesceProjection` had passing unit tests while production delivered ~10
 * minutes of a multi-hour session with zero user turns. The projection ran and
 * did exactly what its tests asserted; it just did not recognize the payload an
 * openai-codex/gpt-5.6-sol session emits, so 64% of the window was
 * `message.providerPayload` and a "reasoning" block was 97% `thinkingSignature`
 * — neither of which anything renders.
 *
 * Every test here therefore asserts on the DELIVERED WINDOW rather than on
 * projection internals. A future provider whose event shape misses the
 * detectors fails these tests even though the projection's own unit tests stay
 * green — which is the failure mode that shipped.
 *
 * See change: shed-unrendered-hydration-payload.
 */
import { selectNewestEventsByBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../memory-event-store.js";
import { projectForHydration } from "../replay-coordinator.js";

const BUDGET = 1.5 * 1024 * 1024;
const FRAME = 260_096;

/**
 * Message-envelope fields the client actually reads.
 *
 * Derived from `packages/client/src/lib/event-reducer.ts` (`message_start`,
 * `message_update`, `message_end` cases): `role`, `content`, `id`,
 * `customType`, `display`, `details`. Everything else on the envelope is
 * provider bookkeeping. Small bookkeeping is tolerated — the contract below
 * bounds BULK, not presence.
 */
const RENDERED_MESSAGE_FIELDS = new Set(["role", "content", "id", "customType", "display", "details"]);

/**
 * A single unrendered field may not exceed this in any delivered event.
 *
 * Calibrated from the real session: legitimate bookkeeping is small (`usage`
 * ~200 B, `responseId` ~57 B), while the regressions were `providerPayload` at
 * 12,547 B and `thinkingSignature` at 4,029 B. 1 KiB separates them cleanly.
 */
const MAX_UNRENDERED_FIELD_BYTES = 1024;

/**
 * Tool calls per user turn. Matches the real session's density — 91 user turns
 * across 10,045 events, ~22 calls per turn — which is what makes the window
 * assertion below discriminating. At a thinner 6 calls/turn the unfixed
 * projection still delivered 12 turns and the test could not tell the two
 * apart; at this density it delivers 3.
 */
const TOOL_CALLS_PER_TURN = 20;

const size = (value: unknown): number => (JSON.stringify(value) ?? "").length;

/**
 * The real per-tool-call cycle, captured from session 019fa587
 * (openai-codex/gpt-5.6-sol, thinkingLevel high): a cumulative `message_update`
 * immediately superseded by a byte-identical `message_end`, then stats and the
 * tool pair. Field sizes mirror the measured anatomy.
 */
function toolCycle(baseSeq: number): StoredEvent[] {
  const assistantMessage = () => ({
    role: "assistant",
    id: `m${baseSeq}`,
    content: [
      { type: "thinking", thinking: "brief visible reasoning", thinkingSignature: "s".repeat(4029) },
      { type: "toolCall", toolCallId: `t${baseSeq}`, args: { path: "a.ts", body: "b".repeat(1200) } },
    ],
    providerPayload: { raw: "p".repeat(12_547) },
    usage: { input: 100, output: 20 },
    responseId: "resp_".padEnd(57, "x"),
  });

  const ev = (offset: number, eventType: string, data: unknown): StoredEvent =>
    ({ seq: baseSeq + offset, event: { eventType, timestamp: baseSeq + offset, data } }) as StoredEvent;

  return [
    ev(0, "message_update", { type: "message_update", message: assistantMessage() }),
    ev(1, "message_end", { type: "message_end", message: assistantMessage(), entryId: `e${baseSeq}` }),
    ev(2, "stats_update", { tokensIn: 10, tokensOut: 2 }),
    ev(3, "tool_execution_end", { toolCallId: `t${baseSeq}`, result: "r".repeat(1500) }),
    ev(4, "tool_execution_start", { toolCallId: `t${baseSeq}`, toolName: "Read", args: { path: "a.ts" } }),
  ];
}

function userTurn(seq: number, text: string): StoredEvent {
  return {
    seq,
    event: {
      eventType: "message_start",
      timestamp: seq,
      data: { message: { role: "user", id: `u${seq}`, content: [{ type: "text", text }] } },
    },
  } as StoredEvent;
}

/** A session of `turns` user turns, each followed by `cyclesPerTurn` tool calls. */
function session(turns: number, cyclesPerTurn: number): StoredEvent[] {
  const events: StoredEvent[] = [];
  let seq = 1;
  for (let turn = 0; turn < turns; turn += 1) {
    events.push(userTurn(seq, `user request ${turn}`));
    seq += 1;
    for (let cycle = 0; cycle < cyclesPerTurn; cycle += 1) {
      events.push(...toolCycle(seq));
      seq += 5;
    }
  }
  return events;
}

/**
 * The window the browser actually receives: project, then select the newest
 * events that fit the budget. Mirrors `replay-coordinator.ts` — `deliverRequestBody`
 * calls `projectForHydration` and then `selectNewestEventsByBudget` for a
 * `cold` + `tail` subscribe.
 */
function deliveredWindow(source: StoredEvent[]): StoredEvent[] {
  const projected = projectForHydration(source, BUDGET, "cold", "tail");
  const selected = selectNewestEventsByBudget(projected, BUDGET, { maxEventBytes: FRAME });
  const seqs = new Set(selected.events.map((e) => e.seq));
  return projected.filter((e) => seqs.has(e.seq));
}

function countUserTurns(events: readonly StoredEvent[]): number {
  return events.filter((e) => {
    if (e.event.eventType !== "message_start") return false;
    const data = e.event.data as { role?: unknown; message?: { role?: unknown } };
    return data.role === "user" || data.message?.role === "user";
  }).length;
}

interface UnrenderedField {
  seq: number;
  field: string;
  bytes: number;
}

/** A content block renders its own type/text/thinking/toolCall payload. */
const RENDERED_BLOCK_FIELDS = new Set(["type", "text", "thinking", "toolCall", "toolCallId"]);

function unrenderedInBlocks(seq: number, content: unknown): UnrenderedField[] {
  if (!Array.isArray(content)) return [];
  const found: UnrenderedField[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (!block || typeof block !== "object") continue;
    for (const [key, value] of Object.entries(block)) {
      if (RENDERED_BLOCK_FIELDS.has(key)) continue;
      found.push({ seq, field: `content[${String(block.type)}].${key}`, bytes: size(value) });
    }
  }
  return found;
}

function unrenderedInMessage(seq: number, message: Record<string, unknown>): UnrenderedField[] {
  const envelope = Object.entries(message)
    .filter(([key]) => !RENDERED_MESSAGE_FIELDS.has(key))
    .map(([key, value]) => ({ seq, field: `message.${key}`, bytes: size(value) }));
  return [...envelope, ...unrenderedInBlocks(seq, message.content)];
}

/** Every unrendered envelope/content field in the window, with its byte cost. */
function unrenderedFields(events: readonly StoredEvent[]): UnrenderedField[] {
  return events.flatMap((entry) => {
    const message = (entry.event.data as { message?: Record<string, unknown> } | undefined)?.message;
    if (!message || typeof message !== "object") return [];
    return unrenderedInMessage(entry.seq, message);
  });
}

describe("hydration window contract", () => {
  it("delivers many user turns, not just the last few tool calls", () => {
    // A 29 MiB session of 40 user turns. Measured on this fixture: shedding
    // unrendered payload takes the window from 3 turns (401 events, 1.489 MiB,
    // more older pending) to all 40 (4,040 events, 0.802 MiB — the whole
    // session inside half the budget). 25 sits far from both ends, so this
    // fails on the regression without being tuned to an exact byte count.
    const window = deliveredWindow(session(40, TOOL_CALLS_PER_TURN));
    expect(countUserTurns(window)).toBeGreaterThanOrEqual(25);
  });

  it("holds no bulk payload in a field nothing renders", () => {
    const window = deliveredWindow(session(40, TOOL_CALLS_PER_TURN));
    const oversized = unrenderedFields(window).filter((f) => f.bytes > MAX_UNRENDERED_FIELD_BYTES);

    // Name the offenders — a bare boolean here is unreadable when it fires.
    expect(
      oversized.map((f) => `${f.field} = ${f.bytes} B (seq ${f.seq})`),
    ).toEqual([]);
  });

  it("spends the window on content rather than bookkeeping", () => {
    const window = deliveredWindow(session(40, TOOL_CALLS_PER_TURN));
    const total = window.reduce((sum, e) => sum + size(e), 0);
    const unrendered = unrenderedFields(window).reduce((sum, f) => sum + f.bytes, 0);

    expect(unrendered / total).toBeLessThan(0.15);
  });

  it("keeps the delivered window contiguous", () => {
    const window = deliveredWindow(session(40, TOOL_CALLS_PER_TURN));
    expect(window.length).toBeGreaterThan(0);
    for (let i = 1; i < window.length; i += 1) {
      expect(window[i]!.seq).toBe(window[i - 1]!.seq + 1);
    }
  });
});
