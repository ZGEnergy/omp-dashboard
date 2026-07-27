import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../memory-event-store.js";
import { createReplayCoordinator } from "../replay-coordinator.js";

interface TestSocket {
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  frames: Record<string, unknown>[];
  send(payload: string): void;
  close(): void;
}

function socket(): TestSocket {
  const frames: Record<string, unknown>[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    bufferedAmount: 0,
    frames,
    send(payload: string) {
      frames.push(JSON.parse(payload) as Record<string, unknown>);
    },
    close() {
      this.readyState = 3;
    },
  };
}

describe("replay coordinator tool burst hydration", () => {
  it("hydrates chat before a tool burst without charging superseded raw updates", async () => {
    const store = createMemoryEventStore(() => false);
    const sessionId = "session-tool-burst";
    const events: DashboardEvent[] = [
      {
        eventType: "message_start",
        timestamp: 1000,
        data: { message: { role: "user", content: "Implement feature X" } },
      },
      {
        eventType: "message_start",
        timestamp: 1010,
        data: { message: { role: "assistant" } },
      },
    ];

    for (let tool = 1; tool <= 8; tool += 1) {
      const toolCallId = `call-${tool}`;
      events.push({
        eventType: "tool_execution_start",
        timestamp: 1100 + events.length,
        data: { toolCallId, toolName: "bash", args: { command: `echo ${tool}` } },
      });
      for (let update = 0; update < 2_000; update += 1) {
        events.push({
          eventType: "tool_execution_update",
          timestamp: 1100 + events.length,
          data: { toolCallId, toolName: "bash", partialResult: "z".repeat(1_024) },
        });
      }
      events.push({
        eventType: "tool_execution_end",
        timestamp: 1100 + events.length,
        data: { toolCallId, toolName: "bash", result: "output".repeat(10_000) },
      });
    }

    store.replaceEvents(sessionId, events);
    const ws = socket();
    const coordinator = createReplayCoordinator({ store });
    const ctx = {
      ws,
      eventStore: store,
      piGateway: { sendToSession() {} },
      sendTo(_ws: TestSocket, msg: Record<string, unknown>) {
        _ws.send(JSON.stringify(msg));
      },
      broadcast() {},
      getSubscribers: () => [ws],
      replayPendingUiRequests() {},
      markReplaying() {},
      clearReplaying() {},
    };

    await coordinator.subscribe(
      {
        type: "subscribe",
        sessionId,
        requestId: "req-burst",
        mode: "tail",
        windowBytes: 1_572_864,
      },
      ctx as unknown as Parameters<typeof coordinator.subscribe>[1],
    );

    const replayFrames = ws.frames.filter((frame) => frame.type === "event_replay");
    const delivered = replayFrames.flatMap((frame) => frame.events as Array<{ seq: number; event: DashboardEvent }>);
    const skipped = replayFrames.flatMap((frame) => (frame.skippedSeqRanges ?? []) as Array<{ fromSeq: number; toSeq: number }>);
    const coverage = [
      ...delivered.map(({ seq }) => ({ fromSeq: seq, toSeq: seq })),
      ...skipped,
    ].sort((left, right) => left.fromSeq - right.fromSeq);

    expect(delivered).toHaveLength(10);
    expect(delivered[0]).toMatchObject({
      event: { eventType: "message_start", data: { message: { role: "user" } } },
    });
    expect(coverage[0]?.fromSeq).toBe(1);
    expect(coverage.at(-1)?.toSeq).toBe(events.length);
    for (let index = 1; index < coverage.length; index += 1) {
      expect(coverage[index]?.fromSeq).toBe(coverage[index - 1]!.toSeq + 1);
    }
    expect(delivered.filter(({ event }) => event.eventType.startsWith("tool_execution_"))).toHaveLength(8);
    expect(delivered.some(({ event }) => event.data.coalesced === true)).toBe(false);

    const terminal = replayFrames.at(-1);
    expect(terminal).toMatchObject({
      isLast: true,
      windowMinSeq: 1,
      windowMaxSeq: events.length,
      hasMoreOlder: false,
      partialHead: false,
    });
    expect(ws.frames.reduce((bytes, frame) => bytes + Buffer.byteLength(JSON.stringify(frame)), 0)).toBeLessThanOrEqual(1_572_864);
  });
});
