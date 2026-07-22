import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createMemoryEventStore, DEFAULT_MAX_EVENT_DATA_SIZE } from "../memory-event-store.js";
import { createReplayCoordinator } from "../replay-coordinator.js";

function toolEndEvent(resultBytes: number): DashboardEvent {
  return {
    eventType: "tool_execution_end",
    timestamp: 1,
    data: { toolCallId: "t1", result: "x".repeat(resultBytes) },
  };
}

function socket() {
  const frames: any[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    bufferedAmount: 0,
    frames,
    send(payload: string) { frames.push(JSON.parse(payload)); },
    close() { this.readyState = 3; },
  } as any;
}

describe("replay coordinator truncation parity", () => {
  it("truncates a persisted older-page tool output to the hot-store per-event cap", async () => {
    // maxEventsPerSession=1 forces the hot store to evict the big tool-result
    // event (seq 1), retaining only "two" (seq 2) with historyTruncated=true.
    // The persisted-source mock returns the raw (untruncated) JSONL events, as
    // loadSessionEvents would for a real on-disk session file. Fetching the
    // `older` page (fromSeq=2, i.e. seq < 2) must apply the same per-event cap
    // the hot store applies on insert.
    const store = createMemoryEventStore(() => false, 10, 1);
    const bigResultEvent = toolEndEvent(200_000);
    const persisted: DashboardEvent[] = [
      bigResultEvent,
      { eventType: "message_end", timestamp: 1, data: { label: "two" } },
    ];
    for (const entry of persisted) store.insertEvent("s", entry);
    expect(store.getRetainedRange("s")).toMatchObject({ retainedMinSeq: 2, historyTruncated: true });

    const ws = socket();
    const sessionManager: any = { get: () => ({ sessionFile: "/tmp/session.jsonl" }) };
    const coordinator = createReplayCoordinator({
      store,
      directoryService: { loadSessionEvents: async () => ({ success: true, events: persisted }) } as any,
      sessionManager,
    });
    const ctx: any = {
      ws, sessionManager, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };

    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "older", fromSeq: 2, windowBytes: 256 * 1024 }, ctx);
    const olderReplay = ws.frames.filter((frame: any) => frame.type === "event_replay");
    const delivered = olderReplay.flatMap((frame: any) => frame.events);
    const toolEnd = delivered.find((entry: any) => entry.event.eventType === "tool_execution_end");
    expect(toolEnd).toBeDefined();
    expect(JSON.stringify(toolEnd!.event).length).toBeLessThanOrEqual(DEFAULT_MAX_EVENT_DATA_SIZE + 1_000);
  });
});
