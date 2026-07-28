import { describe, expect, it } from "vitest";
import type { SeqEvent } from "../event-window.js";
import {
  coalesceProjection,
  isBlanked,
  makeToolStub,
  stubbedToolEndEvent,
  summarizeArgs,
  TOOL_STUB_HEAD_BYTES,
  TOOL_STUB_TAIL_BYTES,
} from "../replay-projection.js";
import type { DashboardEvent } from "../types.js";

function ev(seq: number, eventType: string, data: Record<string, unknown> = {}): SeqEvent<DashboardEvent> {
  return { seq, event: { eventType, timestamp: 1_700_000_000_000 + seq, data } as unknown as DashboardEvent };
}

function textUpdate(seq: number, text: string): SeqEvent<DashboardEvent> {
  return ev(seq, "message_update", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
}

describe("coalesceProjection", () => {
  it("keeps the seq set identical", () => {
    const input = [textUpdate(1, "a"), textUpdate(2, "ab"), ev(3, "tool_execution_start", { toolCallId: "t1" })];
    expect(coalesceProjection(input).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("blanks all but the LAST member of a consecutive message_update run", () => {
    const out = coalesceProjection([textUpdate(1, "a"), textUpdate(2, "ab"), textUpdate(3, "abc")]);
    expect(isBlanked(out[0]!.event)).toBe(true);
    expect(isBlanked(out[1]!.event)).toBe(true);
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("SPLITS a run on any non-update event — text before a tool survives at its own seq", () => {
    const out = coalesceProjection([
      textUpdate(1, "a"),
      textUpdate(2, "ab"),
      ev(3, "tool_execution_start", { toolCallId: "t1" }),
      textUpdate(4, "abc"),
      textUpdate(5, "abcd"),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(true);
    expect(isBlanked(out[1]!.event)).toBe(false); // last of run 1 — survives BEFORE the tool
    expect(isBlanked(out[2]!.event)).toBe(false); // the tool event itself
    expect(isBlanked(out[3]!.event)).toBe(true);
    expect(isBlanked(out[4]!.event)).toBe(false); // last of run 2
  });

  it("blanks superseded tool_execution_update but keeps start and end", () => {
    const out = coalesceProjection([
      ev(1, "tool_execution_start", { toolCallId: "t1", toolName: "Read" }),
      ev(2, "tool_execution_update", { toolCallId: "t1", partialResult: "partial" }),
      ev(3, "tool_execution_end", { toolCallId: "t1", result: "final" }),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(false);
    expect(isBlanked(out[1]!.event)).toBe(true);
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("keeps the final progress update of a STILL-RUNNING tool (no end event)", () => {
    const out = coalesceProjection([
      ev(1, "tool_execution_start", { toolCallId: "t1", toolName: "Bash" }),
      ev(2, "tool_execution_update", { toolCallId: "t1", partialResult: "first" }),
      ev(3, "tool_execution_update", { toolCallId: "t1", partialResult: "second" }),
    ]);
    expect(isBlanked(out[1]!.event)).toBe(true);
    expect(isBlanked(out[2]!.event)).toBe(false); // newest progress is all the UI has
  });

  it("keeps a thinking delta's incremental payload but drops its duplicate text snapshot", () => {
    const out = coalesceProjection([
      ev(1, "message_update", {
        message: { id: "m1", role: "assistant", content: [{ type: "text", text: "long prose" }] },
        assistantMessageEvent: { type: "thinking_delta", text: "hmm" },
      }),
    ]);
    const data = out[0]!.event.data as Record<string, unknown>;
    expect(data.assistantMessageEvent).toEqual({ type: "thinking_delta", text: "hmm" });
    expect(data.message).toBeUndefined();
  });

  it("a thinking delta does not split a text run — it renders as reasoning, not prose", () => {
    const out = coalesceProjection([
      textUpdate(1, "a"),
      ev(2, "message_update", {
        message: { id: "m1", role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", text: "hmm" },
      }),
      textUpdate(3, "ab"),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(true); // superseded by seq 3
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("an assistant message_end supersedes the last cumulative update before it", () => {
    const out = coalesceProjection([
      textUpdate(1, "a"),
      textUpdate(2, "ab"),
      ev(3, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text: "ab" }] } }),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(true);
    expect(isBlanked(out[1]!.event)).toBe(true); // canonical content is on the end event
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("a USER message_end does not supersede an assistant text run", () => {
    const out = coalesceProjection([
      textUpdate(1, "a"),
      ev(2, "message_end", { message: { role: "user", content: [{ type: "text", text: "next prompt" }] } }),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(false);
  });

  it("drops args alongside result when stubbing, so huge tool args cannot survive", () => {
    const out = coalesceProjection([
      ev(1, "tool_execution_start", { toolCallId: "t1", toolName: "Write" }),
      ev(2, "tool_execution_end", {
        toolCallId: "t1",
        toolName: "Write",
        args: { content: "A".repeat(1000) },
        result: "ok",
      }),
    ]);
    // Coalescing alone leaves args intact; only stubbing drops them.
    expect((out[1]!.event.data as Record<string, unknown>).args).toBeDefined();
    const stub = makeToolStub({
      toolCallId: "t1",
      toolName: "Write",
      args: { content: "A".repeat(1000) },
      result: "ok",
      status: "ok",
      startedAt: 1,
      detailLevel: "metadata",
    });
    const stubbed = stubbedToolEndEvent(out[1]!.event, stub);
    const data = stubbed.data as Record<string, unknown>;
    expect(data.args).toBeUndefined();
    expect(data.result).toBeUndefined();
    expect((data.toolStub as { argsSummary: string }).argsSummary).toContain("Write");
  });

  it("empties tool-only assistant shells, which duplicate large tool args", () => {
    const shell = (seq: number) =>
      ev(seq, "message_update", {
        message: {
          id: "m1",
          role: "assistant",
          content: [{ type: "toolCall", toolCallId: "t1", args: { body: "x".repeat(5000) } }],
        },
      });
    const out = coalesceProjection([shell(1), shell(2)]);
    for (const entry of out) {
      const message = (entry.event.data as { message: { role: string; id: string; content: unknown[] } }).message;
      expect(message.content).toEqual([]);
      // Envelope survives: a fully blanked assistant `message_end` would lose
      // `role` and suppress the reducer's turnSeparator — a rendered-output
      // change the ordering invariant forbids.
      expect(message.role).toBe("assistant");
      expect(message.id).toBe("m1");
    }
    expect(JSON.stringify(out).length).toBeLessThan(400);
  });

  it("keeps the turn envelope on a tool-only assistant message_end", () => {
    const out = coalesceProjection([
      ev(1, "message_end", {
        message: { id: "m1", role: "assistant", content: [{ type: "toolCall", toolCallId: "t1" }] },
      }),
    ]);
    const message = (out[0]!.event.data as { message: { role: string } }).message;
    expect(message.role).toBe("assistant");
  });

  it("does not blank an assistant shell that also carries text", () => {
    const out = coalesceProjection([
      ev(1, "message_update", {
        message: {
          id: "m1",
          role: "assistant",
          content: [{ type: "toolCall", toolCallId: "t1" }, { type: "text", text: "real prose" }],
        },
      }),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(false);
  });

  it("a tool-only shell does not split a text run", () => {
    const out = coalesceProjection([
      textUpdate(1, "a"),
      ev(2, "message_update", {
        message: { id: "m1", role: "assistant", content: [{ type: "toolCall", toolCallId: "t1" }] },
      }),
      textUpdate(3, "ab"),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(true); // superseded by seq 3
    expect((out[1]!.event.data as { message: { content: unknown[] } }).message.content).toEqual([]);
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("is deterministic — same input yields byte-identical output", () => {
    const input = [textUpdate(1, "a"), textUpdate(2, "ab"), ev(3, "tool_execution_end", { toolCallId: "t1" })];
    expect(JSON.stringify(coalesceProjection(input))).toEqual(JSON.stringify(coalesceProjection(input)));
  });

  it("does not mutate its input", () => {
    const input = [textUpdate(1, "a"), textUpdate(2, "ab")];
    const snapshot = JSON.stringify(input);
    coalesceProjection(input);
    expect(JSON.stringify(input)).toEqual(snapshot);
  });
});

describe("makeToolStub", () => {
  it("slices head and tail and reports the full byte count", () => {
    const result = "H".repeat(TOOL_STUB_HEAD_BYTES) + "M".repeat(50_000) + "T".repeat(TOOL_STUB_TAIL_BYTES);
    const stub = makeToolStub({
      toolCallId: "t1",
      toolName: "Read",
      args: { path: "src/a.ts" },
      result,
      status: "ok",
      startedAt: 1000,
      durationMs: 25,
      detailLevel: "sliced",
    });
    expect(stub.head!.length).toBe(TOOL_STUB_HEAD_BYTES);
    expect(stub.tail!.length).toBe(TOOL_STUB_TAIL_BYTES);
    expect(stub.head!.startsWith("H")).toBe(true);
    expect(stub.tail!.endsWith("T")).toBe(true);
    expect(stub.fullBytes).toBe(result.length);
  });

  it("omits head/tail at metadata detail level", () => {
    const stub = makeToolStub({
      toolCallId: "t1",
      toolName: "Read",
      result: "x".repeat(100_000),
      status: "ok",
      startedAt: 1000,
      detailLevel: "metadata",
    });
    expect(stub.head).toBeUndefined();
    expect(stub.tail).toBeUndefined();
    expect(stub.fullBytes).toBe(100_000);
    expect(JSON.stringify(stub).length).toBeLessThan(400);
  });

  it("does not slice a result already under the cap", () => {
    const stub = makeToolStub({
      toolCallId: "t1",
      toolName: "Read",
      result: "short",
      status: "ok",
      startedAt: 1000,
      detailLevel: "sliced",
    });
    expect(stub.head).toBe("short");
    expect(stub.tail).toBeUndefined();
  });

  it("carries the error status through", () => {
    const stub = makeToolStub({
      toolCallId: "t1",
      toolName: "Read",
      result: "boom",
      status: "error",
      startedAt: 1000,
      detailLevel: "sliced",
    });
    expect(stub.status).toBe("error");
  });
});

describe("stubbedToolEndEvent", () => {
  it("removes the raw result and attaches the stub at the same eventType", () => {
    const raw = {
      eventType: "tool_execution_end",
      timestamp: 1,
      data: { toolCallId: "t1", result: "big", isError: false },
    } as unknown as DashboardEvent;
    const stub = makeToolStub({
      toolCallId: "t1",
      toolName: "Read",
      result: "big",
      status: "ok",
      startedAt: 1,
      detailLevel: "metadata",
    });
    const out = stubbedToolEndEvent(raw, stub) as unknown as { eventType: string; data: Record<string, unknown> };
    expect(out.eventType).toBe("tool_execution_end");
    expect(out.data.result).toBeUndefined();
    expect(out.data.toolStub).toEqual(stub);
    expect(out.data.toolCallId).toBe("t1");
  });
});

describe("summarizeArgs", () => {
  it("renders a bounded call signature", () => {
    expect(summarizeArgs("Read", { path: "src/a.ts" })).toBe('Read("src/a.ts")');
  });
  it("bounds a pathological arg", () => {
    expect(summarizeArgs("Read", { path: "x".repeat(5000) }).length).toBeLessThanOrEqual(200);
  });
  it("handles missing args", () => {
    expect(summarizeArgs("Read", undefined)).toBe("Read()");
  });
  it("falls back to the whole arg object when no primary key is present", () => {
    expect(summarizeArgs("Custom", { alpha: 1 })).toBe('Custom({"alpha":1})');
  });
  it("survives a circular arg object", () => {
    const circular: Record<string, unknown> = { self: null };
    circular.self = circular;
    expect(() => summarizeArgs("Custom", circular)).not.toThrow();
  });
});
