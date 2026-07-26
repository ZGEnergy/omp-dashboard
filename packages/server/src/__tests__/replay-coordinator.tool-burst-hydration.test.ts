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
  it("delivers full chat context with contiguous seqs for a 1,285-event tail burst", async () => {
    const store = createMemoryEventStore(() => false);
    const sessionId = "session-tool-burst";

    const events: DashboardEvent[] = [];

    // seq 1: User prompt
    events.push({
      eventType: "message_start",
      timestamp: 1000,
      data: { message: { role: "user", content: "Implement feature X" } },
    });

    // seq 2: Assistant turn start
    events.push({
      eventType: "message_start",
      timestamp: 1010,
      data: { message: { role: "assistant" } },
    });

    // Create 12 tool calls, each having 1 start, ~76 updates (each 50 KB), and 1 end
    // Total events: 2 + 12 * (1 + 76 + 1) = 2 + 12 * 78 = 938... Let's make it 1,285 events total!
    let totalEventsCount = 2; // seq 1 and 2
    for (let t = 1; t <= 12; t++) {
      const toolCallId = `call-${t}`;
      events.push({
        eventType: "tool_execution_start",
        timestamp: 1010 + totalEventsCount,
        data: { toolCallId, toolName: "bash", args: { command: `echo ${t}` } },
      });
      totalEventsCount++;

      // 104 updates for calls 1-11, 115 updates for call 12 -> total 1285 events
      const updatesForThisCall = t === 12 ? 115 : 104;
      for (let u = 0; u < updatesForThisCall; u++) {
        events.push({
          eventType: "tool_execution_update",
          timestamp: 1010 + totalEventsCount,
          data: {
            toolCallId,
            toolName: "bash",
            partialResult: "z".repeat(50_000),
          },
        });
        totalEventsCount++;
      }

      events.push({
        eventType: "tool_execution_end",
        timestamp: 1010 + totalEventsCount,
        data: {
          toolCallId,
          toolName: "bash",
          result: "output".repeat(10_000),
        },
      });
      totalEventsCount++;
    }

    expect(events.length).toBe(1285);
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
        windowBytes: 1_572_864, // 1.5 MiB
      },
      ctx as unknown as Parameters<typeof coordinator.subscribe>[1],
    );

    const replayFrames = ws.frames.filter((f) => f.type === "event_replay");
    expect(replayFrames.length).toBeGreaterThan(0);

    // Collect all delivered event entries across frames (excluding terminal empty frame)
    const deliveredEntries = replayFrames.flatMap((f) => (f.events as Array<{ seq: number; event: DashboardEvent }>));
    expect(deliveredEntries.length).toBe(1285);

    // Verify strict sequence contiguity from 1 to 1285
    for (let i = 0; i < deliveredEntries.length; i++) {
      expect(deliveredEntries[i].seq).toBe(i + 1);
    }

    // Verify seq 1 is the initial user prompt and was NOT truncated/dropped
    const firstEvent = deliveredEntries[0]?.event;
    expect(firstEvent?.eventType).toBe("message_start");
    expect((firstEvent?.data as { message?: { role?: string } }).message?.role).toBe("user");

    const terminalFrame = replayFrames.at(-1);
    expect(terminalFrame?.partialHead).toBe(false);
  });
});
