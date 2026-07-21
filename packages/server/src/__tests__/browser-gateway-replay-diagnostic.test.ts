import { describe, expect, it, vi } from "vitest";
import { createBrowserGateway } from "../pairing/browser-gateway.js"
import { createMemoryEventStore } from "../persistence/memory-event-store.js"
import { createMemorySessionManager } from "../session/memory-session-manager.js"
import { createDrainingWs } from "./helpers/draining-ws.js";

function diagnostic(sessionId = "session-1", code = "sequence_gap") {
  return {
    type: "replay_diagnostic",
    code,
    sessionId,
    requestId: "request-1",
    sourceGeneration: "generation-1",
    connectionEpoch: 1,
    replayGeneration: 2,
    contiguousMinSeq: 4,
    contiguousMaxSeq: 7,
    eventCount: 3,
    byteCount: 1024,
    durationMs: 10,
    scrollOwner: "FOLLOWING",
  };
}

describe("browser gateway replay diagnostics", () => {
  it("accepts bounded metadata once per code/session minute without forwarding it", () => {
    const sendToSession = vi.fn();
    const gateway = createBrowserGateway(
      createMemorySessionManager(),
      createMemoryEventStore(() => false),
      { start: vi.fn(), stop: vi.fn(), sendToSession, getConnectedSessionIds: vi.fn(), hasSession: vi.fn(), onEvent: vi.fn() } as any,
    );
    const ws = createDrainingWs({ drainRateBytesPerMs: 10_000 });
    gateway.wss.emit("connection", ws, {});

    ws.emit("message", Buffer.from(JSON.stringify(diagnostic())));
    ws.emit("message", Buffer.from(JSON.stringify(diagnostic())));

    expect(gateway.getReplayDiagnosticStats()).toEqual({
      total: 1,
      byCode: { sequence_gap: 1 },
      bySession: { "session-1": 1 },
    });
    expect(sendToSession).not.toHaveBeenCalled();
  });

  it("rejects oversized metadata and bounds the per-session diagnostic LRU", () => {
    const gateway = createBrowserGateway(
      createMemorySessionManager(),
      createMemoryEventStore(() => false),
      { start: vi.fn(), stop: vi.fn(), sendToSession: vi.fn(), getConnectedSessionIds: vi.fn(), hasSession: vi.fn(), onEvent: vi.fn() } as any,
    );
    const ws = createDrainingWs({ drainRateBytesPerMs: 10_000 });
    gateway.wss.emit("connection", ws, {});
    ws.emit("message", Buffer.from(JSON.stringify({ ...diagnostic(), sourceGeneration: "x".repeat(257) })));
    expect(gateway.getReplayDiagnosticStats().total).toBe(0);

    for (let index = 0; index < 130; index += 1) {
      ws.emit("message", Buffer.from(JSON.stringify(diagnostic(`s-${index}`, "terminal_timeout"))));
    }
    const stats = gateway.getReplayDiagnosticStats();
    expect(stats.total).toBe(130);
    expect(Object.keys(stats.bySession)).toHaveLength(128);
    expect(stats.bySession["s-0"]).toBeUndefined();
    expect(stats.bySession["s-129"]).toBe(1);
  });
});
