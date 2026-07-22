import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it, vi } from "vitest";
import { type ChatMessage, createInitialState, evictBelow, type SessionState, type ToolCallState } from "../../lib/event-reducer.js";
import { SessionReplayController } from "../useSessionReplayController.js";

const entry = (seq: number) => ({ seq, event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent });

function frame(requestId: string, events = [entry(1)], isLast = false, sourceGeneration = "source-a") {
  return { type: "event_replay" as const, sessionId: "s", requestId, sourceGeneration, replayKind: "cold" as const, events, isLast, windowMinSeq: events[0]?.seq ?? null, windowMaxSeq: events.at(-1)?.seq ?? null, retainedMinSeq: 1, hasMoreOlder: false, partialHead: false, historyTruncated: false };
}

// Mirrors event-reducer.evict-below.test.ts: a `toolResult` ChatMessage row
// paired with a `toolCalls` map entry of the same seq, the shape the real
// reducer stamps from a tool_execution_start/_end event pair.
const tool = (seq: number): [string, ToolCallState] => [`t${seq}`, { toolCallId: `t${seq}`, toolName: "bash", status: "complete", seq }];
const toolRow = (seq: number): ChatMessage => ({
  id: `tool-t${seq}`,
  role: "toolResult",
  content: "bash",
  toolName: "bash",
  toolCallId: `t${seq}`,
  toolStatus: "complete",
  timestamp: 0,
  seq,
});

describe("reconnect delta after eviction (#48 Slice 2 Task 2.3 regression guard)", () => {
  it("appends the reconnect delta at newest with no visible clear, and preserves the evicted-tool-burst marker", () => {
    // Reducer-shaped state seeded with two tool-tier rows that eviction will
    // collapse into a burst marker (mirrors event-reducer.evict-below.test.ts).
    let state: SessionState = {
      ...createInitialState(),
      messages: [toolRow(1), toolRow(2)],
      toolCalls: new Map([tool(1), tool(2)]),
    };
    const effects = {
      send: vi.fn(),
      apply: vi.fn(),
      window: vi.fn(),
      trimmed: vi.fn(),
      replace: vi.fn(),
      // Mirrors App's `evict` wiring: prune the reducer's hot state to the
      // ledger's floor. Real App recomputes floors from viewport/tier budgets;
      // for this guard the ledger's minSeq stands in for both floors.
      evict: vi.fn((_sessionId: string, minSeq: number) => {
        state = evictBelow(state, { chatFloorSeq: minSeq, toolFloorSeq: minSeq });
      }),
      // Mirrors App's `reset` wiring: a full reset discards hot state,
      // including any evictedToolBursts markers — this is the "visible clear"
      // the guard must prove never happens across the reconnect delta.
      reset: vi.fn(() => {
        state = createInitialState();
      }),
      loading: vi.fn(),
      reconnect: vi.fn(),
      publishAsset: vi.fn(),
    };
    const budget = JSON.stringify(entry(1)).length * 2;
    const controller = new (SessionReplayController as any)(effects, { maxRetainedBytes: budget });

    // Establish a ready baseline via cold replay.
    const cold = controller.begin("s", "cold", "source-a");
    controller.handle(frame(cold.requestId!, [entry(1), entry(2)], true));
    expect(controller.ledger("s").status).toBe("ready");

    // A subsequent live frame trips the byte cap: Slice 1 eviction fires,
    // dropping the tail below the new floor and collapsing the preseeded
    // tool-tier rows into a burst marker.
    controller.handle({ type: "event", sessionId: "s", seq: 3, event: entry(3).event });
    expect(effects.evict).toHaveBeenCalled();
    // The floor (ledger.minSeq === 2) evicts only the seq-1 tool row; seq 2
    // is retained (it is the new tail's floor, not below it).
    expect(state.evictedToolBursts).toEqual([{ fromSeq: 1, toSeq: 1, count: 1 }]);
    expect(controller.ledger("s").cursor).toBe(3);

    effects.apply.mockClear();
    effects.reset.mockClear();
    effects.replace.mockClear();

    // Transport reconnect (#59): re-subscribe as a delta continuation over
    // the retained tail, not a fresh cold replay.
    const deltaReq = controller.begin("s", "delta", "source-a", undefined, "transport_reconnect");
    const sent = effects.send.mock.calls.at(-1)![0];
    expect(sent.lastSeq).toBe(3); // delta from the post-eviction cursor
    expect(sent.mode).toBeUndefined(); // not a cold tail
    expect(effects.reset).not.toHaveBeenCalled();
    expect(effects.replace).not.toHaveBeenCalled();

    controller.handle({ ...frame(deltaReq.requestId!, [entry(4)], true, "source-a"), replayKind: "delta" });

    // No visible clear at any point across eviction + reconnect: only the
    // newly-missed tail is applied, additively, at the newest position. The
    // ledger sits at a fixed 2-entry byte ceiling, so admitting entry 4 evicts
    // entry 2 in turn (a second, legitimate eviction) — the guard's point is
    // that this NEVER surfaces as `reset`/`replace`, only `apply` + `evict`.
    expect(effects.apply).toHaveBeenCalledTimes(1);
    expect(effects.apply).toHaveBeenCalledWith("s", [entry(4)]);
    expect(effects.reset).not.toHaveBeenCalled();
    expect(effects.replace).not.toHaveBeenCalled();
    expect(controller.ledger("s").events.map((e: { seq: number }) => e.seq)).toEqual([3, 4]);

    // The eviction's burst marker survives the reconnect delta, merging with
    // the second eviction's tool row into one contiguous run — never reset.
    expect(state.evictedToolBursts).toEqual([{ fromSeq: 1, toSeq: 2, count: 2 }]);
  });
});
