import { describe, expect, it } from "vitest";
import { applyToolBudget, type SeqEvent, TOOL_CEILING_FRACTION } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

function toolPair(startSeq: number, toolCallId: string, resultBytes: number): SeqEvent<DashboardEvent>[] {
  return [
    {
      seq: startSeq,
      event: {
        eventType: "tool_execution_start",
        timestamp: startSeq,
        data: { toolCallId, toolName: "Read", args: { path: "a.ts" } },
      } as unknown as DashboardEvent,
    },
    {
      seq: startSeq + 1,
      event: {
        eventType: "tool_execution_end",
        timestamp: startSeq + 1,
        data: { toolCallId, toolName: "Read", result: "x".repeat(resultBytes), isError: false },
      } as unknown as DashboardEvent,
    },
  ];
}

function chat(seq: number, text: string): SeqEvent<DashboardEvent> {
  return {
    seq,
    event: {
      eventType: "message_end",
      timestamp: seq,
      data: { message: { role: "assistant", content: [{ type: "text", text }] } },
    } as unknown as DashboardEvent,
  };
}

const BUDGET = 1.5 * 1024 * 1024;
const CEILING = Math.floor(BUDGET * TOOL_CEILING_FRACTION);

function stubOf(out: SeqEvent<DashboardEvent>[], toolCallId: string) {
  const entry = out.find(
    (e) =>
      e.event.eventType === "tool_execution_end" &&
      (e.event.data as Record<string, unknown>).toolCallId === toolCallId,
  )!;
  return (entry.event.data as Record<string, unknown>).toolStub as { detailLevel: string; fullBytes: number } | undefined;
}

describe("applyToolBudget", () => {
  it("leaves small tool payloads untouched", () => {
    const input = [chat(1, "hi"), ...toolPair(2, "t1", 500)];
    const out = applyToolBudget(input, BUDGET);
    expect(out.degraded).toBe(0);
    expect((out.events[2]!.event.data as Record<string, unknown>).result).toBe("x".repeat(500));
  });

  it("keeps the seq set identical no matter how hard it degrades", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 100 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 200_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    expect(out.events.map((e) => e.seq)).toEqual(input.map((e) => e.seq));
  });

  it("holds tool bytes under the ceiling for a 500-call burst", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 500 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    expect(out.toolBytes).toBeLessThanOrEqual(CEILING);
  });

  it("degrades OLDEST-first, so the newest call keeps the most detail", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 60 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    const rank = { full: 3, sliced: 2, metadata: 1 } as const;
    const level = (id: string) => rank[(stubOf(out.events, id)?.detailLevel ?? "full") as keyof typeof rank];
    expect(level("t59")).toBeGreaterThanOrEqual(level("t0"));
  });

  it("issue #101 worked example: 12 calls x 20 KB fit under the ceiling with chat intact", () => {
    const input = [
      chat(1, "the user prompt"),
      ...Array.from({ length: 12 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 20 * 1024)).flat(),
    ];
    const out = applyToolBudget(input, BUDGET);
    expect(out.toolBytes).toBeLessThanOrEqual(CEILING);
    expect(out.degraded).toBe(0);
    const message = (out.events[0]!.event.data as { message: { content: Array<{ text: string }> } }).message;
    expect(message.content[0]!.text).toBe("the user prompt");
  });

  it("never degrades a chat event", () => {
    const input = [chat(1, "y".repeat(500_000)), ...toolPair(2, "t1", 500_000)];
    const out = applyToolBudget(input, BUDGET);
    const message = (out.events[0]!.event.data as { message: { content: Array<{ text: string }> } }).message;
    expect(message.content[0]!.text.length).toBe(500_000);
  });

  it("never degrades a still-running tool (no end event in range)", () => {
    const input: SeqEvent<DashboardEvent>[] = [
      chat(1, "hi"),
      {
        seq: 2,
        event: {
          eventType: "tool_execution_start",
          timestamp: 2,
          data: { toolCallId: "live", toolName: "Bash" },
        } as unknown as DashboardEvent,
      },
    ];
    const out = applyToolBudget(input, BUDGET);
    expect(out.degraded).toBe(0);
    expect((out.events[1]!.event.data as Record<string, unknown>).toolStub).toBeUndefined();
  });

  it("reports the ORIGINAL full byte count after collapsing sliced -> metadata", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 200 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 300_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    const stub = stubOf(out.events, "t0")!;
    expect(stub.detailLevel).toBe("metadata");
    // Not the sliced length — the true unloaded size, so the UI stays honest.
    expect(stub.fullBytes).toBe(300_000);
  });

  it("is deterministic — same range and budget yield byte-identical output", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 40 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    expect(JSON.stringify(applyToolBudget(input, BUDGET))).toEqual(JSON.stringify(applyToolBudget(input, BUDGET)));
  });

  it("does not mutate its input", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 40 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    const snapshot = JSON.stringify(input);
    applyToolBudget(input, BUDGET);
    expect(JSON.stringify(input)).toEqual(snapshot);
  });

  it("REGRESSION: never grows the range — a payload smaller than a stub is left alone", () => {
    // A stub envelope is ~150-250 B. Degrading 60-byte results once GREW the
    // range 23% while destroying every result, and still missed the ceiling.
    const input = Array.from({ length: 1500 }, (_, i) => toolPair(1 + i * 2, `t${i}`, 60)).flat();
    const before = input.reduce((sum, e) => sum + JSON.stringify(e).length, 0);
    const out = applyToolBudget(input, BUDGET);
    const after = out.events.reduce((sum, e) => sum + JSON.stringify(e).length, 0);
    expect(after).toBeLessThanOrEqual(before);
    expect(out.degraded).toBe(0); // nothing to gain, so nothing destroyed
  });

  it("REGRESSION: strips huge tool args, which otherwise sail past the ceiling", () => {
    // A Write/Edit `tool_execution_end` carries the whole written file in
    // `args.content`. Dropping only `result` left tool bytes 10x over ceiling.
    const input: SeqEvent<DashboardEvent>[] = [
      chat(1, "hi"),
      {
        seq: 2,
        event: {
          eventType: "tool_execution_start",
          timestamp: 2,
          data: { toolCallId: "w1", toolName: "Write" },
        } as unknown as DashboardEvent,
      },
      {
        seq: 3,
        event: {
          eventType: "tool_execution_end",
          timestamp: 3,
          data: { toolCallId: "w1", toolName: "Write", args: { content: "A".repeat(4_000_000) }, result: "ok" },
        } as unknown as DashboardEvent,
      },
    ];
    const out = applyToolBudget(input, BUDGET);
    expect(out.toolBytes).toBeLessThanOrEqual(CEILING);
    expect((out.events[2]!.event.data as Record<string, unknown>).args).toBeUndefined();
  });
});
