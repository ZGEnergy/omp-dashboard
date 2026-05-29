/**
 * Tests for the bridge-owned-follow-up MUTATION handlers.
 *
 * Each of edit / remove / promote / clear / pull mutates `bridgeFollowUp`
 * locally + emits `queue_update`. NONE of them call `pi.sendUserMessage`,
 * `pi.clear*Queue`, or any other pi method. Pure-mirror of bridge.ts
 * message-router arms.
 *
 * Out-of-range indices emit `command_feedback { status: "error" }` with no
 * buffer mutation and no `queue_update`. `promote_followup_entry` with
 * `index <= 0` is a silent no-op (no emit).
 *
 * Spec: mid-turn-prompt-queue — Requirement "Per-entry follow-up mutation
 * mutates ONLY the bridge buffer" + "Pull-to-editor splices the entry and
 * round-trips text to the client draft".
 *
 * See change: rework-mid-turn-prompt-queue.
 */
import { describe, it, expect, vi } from "vitest";

type AnyMock = ((...args: any[]) => any) & ReturnType<typeof vi.fn>;

interface Sink {
  emit: AnyMock;
  feedback: AnyMock;
  pi: {
    sendUserMessage: AnyMock;
    clearSteeringQueue: AnyMock;
    clearFollowUpQueue: AnyMock;
  };
}

function makeSink(): Sink {
  return {
    emit: vi.fn() as AnyMock,
    feedback: vi.fn() as AnyMock,
    pi: {
      sendUserMessage: vi.fn() as AnyMock,
      clearSteeringQueue: vi.fn() as AnyMock,
      clearFollowUpQueue: vi.fn() as AnyMock,
    },
  };
}

/**
 * Pure handlers mirroring bridge.ts message-router arms. Each accepts the
 * current buffer (mutated in place) + the sink for side effects.
 */
const handlers = {
  edit(buffer: string[], msg: { index: number; text: string }, sink: Sink): void {
    if (typeof msg.index !== "number" || msg.index < 0 || msg.index >= buffer.length) {
      sink.feedback({ command: "edit_followup_entry", status: "error", message: "Index out of range" });
      return;
    }
    buffer[msg.index] = msg.text;
    sink.emit([...buffer]);
  },
  remove(buffer: string[], msg: { index: number }, sink: Sink): void {
    if (typeof msg.index !== "number" || msg.index < 0 || msg.index >= buffer.length) {
      sink.feedback({ command: "remove_followup_entry", status: "error", message: "Index out of range" });
      return;
    }
    buffer.splice(msg.index, 1);
    sink.emit([...buffer]);
  },
  promote(buffer: string[], msg: { index: number }, sink: Sink): void {
    // index <= 0 is a silent no-op (no emit, no feedback).
    if (typeof msg.index !== "number" || msg.index <= 0 || msg.index >= buffer.length) return;
    const [entry] = buffer.splice(msg.index, 1);
    buffer.unshift(entry);
    sink.emit([...buffer]);
  },
  clear(buffer: string[], msg: { indices: number[] | "all" }, sink: Sink): string[] {
    if (msg.indices === "all") {
      if (buffer.length > 0) {
        const cleared: string[] = [];
        sink.emit([...cleared]);
        return cleared;
      }
      return buffer;
    }
    if (!Array.isArray(msg.indices)) return buffer;
    const sorted = [...msg.indices].sort((a, b) => b - a);
    let mutated = false;
    for (const i of sorted) {
      if (typeof i === "number" && i >= 0 && i < buffer.length) {
        buffer.splice(i, 1);
        mutated = true;
      }
    }
    if (mutated) sink.emit([...buffer]);
    return buffer;
  },
};

function assertNoPiCalls(sink: Sink): void {
  expect(sink.pi.sendUserMessage).not.toHaveBeenCalled();
  expect(sink.pi.clearSteeringQueue).not.toHaveBeenCalled();
  expect(sink.pi.clearFollowUpQueue).not.toHaveBeenCalled();
}

describe("edit_followup_entry", () => {
  it("mutates buffer + emits, never touches pi", () => {
    const sink = makeSink();
    const buffer = ["alpha", "beta", "gamma"];
    handlers.edit(buffer, { index: 1, text: "BETA" }, sink);
    expect(buffer).toEqual(["alpha", "BETA", "gamma"]);
    expect(sink.emit).toHaveBeenCalledTimes(1);
    expect(sink.emit).toHaveBeenCalledWith(["alpha", "BETA", "gamma"]);
    assertNoPiCalls(sink);
  });

  it("out-of-range index emits command_feedback error, no mutation, no queue_update", () => {
    const sink = makeSink();
    const buffer = ["a"];
    handlers.edit(buffer, { index: 5, text: "x" }, sink);
    expect(buffer).toEqual(["a"]);
    expect(sink.emit).not.toHaveBeenCalled();
    expect(sink.feedback).toHaveBeenCalledWith({
      command: "edit_followup_entry",
      status: "error",
      message: "Index out of range",
    });
    assertNoPiCalls(sink);
  });
});

describe("remove_followup_entry", () => {
  it("splices the entry + emits", () => {
    const sink = makeSink();
    const buffer = ["alpha", "beta", "gamma"];
    handlers.remove(buffer, { index: 0 }, sink);
    expect(buffer).toEqual(["beta", "gamma"]);
    expect(sink.emit).toHaveBeenCalledWith(["beta", "gamma"]);
    assertNoPiCalls(sink);
  });

  it("out-of-range emits error, no mutation", () => {
    const sink = makeSink();
    const buffer = ["a"];
    handlers.remove(buffer, { index: 99 }, sink);
    expect(buffer).toEqual(["a"]);
    expect(sink.emit).not.toHaveBeenCalled();
    expect(sink.feedback).toHaveBeenCalled();
    assertNoPiCalls(sink);
  });
});

describe("promote_followup_entry", () => {
  it("moves the entry to head + emits", () => {
    const sink = makeSink();
    const buffer = ["alpha", "beta", "gamma"];
    handlers.promote(buffer, { index: 2 }, sink);
    expect(buffer).toEqual(["gamma", "alpha", "beta"]);
    expect(sink.emit).toHaveBeenCalledWith(["gamma", "alpha", "beta"]);
    assertNoPiCalls(sink);
  });

  it("index 0 is a silent no-op (no emit, no error feedback)", () => {
    const sink = makeSink();
    const buffer = ["alpha", "beta"];
    handlers.promote(buffer, { index: 0 }, sink);
    expect(buffer).toEqual(["alpha", "beta"]);
    expect(sink.emit).not.toHaveBeenCalled();
    expect(sink.feedback).not.toHaveBeenCalled();
    assertNoPiCalls(sink);
  });

  it("out-of-range index is also a silent no-op", () => {
    const sink = makeSink();
    const buffer = ["a"];
    handlers.promote(buffer, { index: 99 }, sink);
    expect(buffer).toEqual(["a"]);
    expect(sink.emit).not.toHaveBeenCalled();
    expect(sink.feedback).not.toHaveBeenCalled();
  });
});

describe("clear_followup_entries", () => {
  it("'all' empties the buffer + emits", () => {
    const sink = makeSink();
    let buffer = ["a", "b", "c"];
    buffer = handlers.clear(buffer, { indices: "all" }, sink);
    expect(buffer).toEqual([]);
    expect(sink.emit).toHaveBeenCalledWith([]);
    assertNoPiCalls(sink);
  });

  it("'all' on empty buffer does not emit", () => {
    const sink = makeSink();
    let buffer: string[] = [];
    buffer = handlers.clear(buffer, { indices: "all" }, sink);
    expect(buffer).toEqual([]);
    expect(sink.emit).not.toHaveBeenCalled();
  });

  it("indices array splices descending, single emit", () => {
    const sink = makeSink();
    const buffer = ["a", "b", "c", "d"];
    handlers.clear(buffer, { indices: [0, 2] }, sink);
    // descending splice: 2 first → ["a","b","d"], then 0 → ["b","d"]
    expect(buffer).toEqual(["b", "d"]);
    expect(sink.emit).toHaveBeenCalledTimes(1);
    expect(sink.emit).toHaveBeenCalledWith(["b", "d"]);
    assertNoPiCalls(sink);
  });

  it("indices array with all out-of-range values does not emit", () => {
    const sink = makeSink();
    const buffer = ["a", "b"];
    handlers.clear(buffer, { indices: [99, 100] }, sink);
    expect(buffer).toEqual(["a", "b"]);
    expect(sink.emit).not.toHaveBeenCalled();
  });
});


