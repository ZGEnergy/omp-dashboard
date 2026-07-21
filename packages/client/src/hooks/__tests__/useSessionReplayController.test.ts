import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it, vi } from "vitest";
import { SessionReplayController } from "../useSessionReplayController.js";

const entry = (seq: number) => ({ seq, event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent });

function frame(requestId: string, events = [entry(1)], isLast = false, sourceGeneration = "source-a") {
  return { type: "event_replay" as const, sessionId: "s", requestId, sourceGeneration, replayKind: "cold" as const, events, isLast, windowMinSeq: events[0]?.seq ?? null, windowMaxSeq: events.at(-1)?.seq ?? null, retainedMinSeq: 1, hasMoreOlder: false, partialHead: false, historyTruncated: false };
}

describe("SessionReplayController", () => {
  it("fences stale replay before reducer/loading effects and atomically rebuilds older state", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");
    const loadingCalls = effects.loading.mock.calls.length;
    controller.handle(frame(cold.requestId!, [entry(12)], false, "source-b"));
    expect(effects.apply).not.toHaveBeenCalled();
    expect(effects.replace).not.toHaveBeenCalled();
    expect(effects.reset).not.toHaveBeenCalled();
    expect(effects.loading).toHaveBeenCalledTimes(loadingCalls);
    expect(controller.ledger("s").events).toEqual([]);

    controller.handle(frame(cold.requestId!, [entry(10), entry(11)], true));
    expect(effects.apply).toHaveBeenCalledWith("s", [entry(10), entry(11)]);
    const calls = effects.apply.mock.calls.length;
    controller.handle(frame("stale", [entry(12)], true));
    expect(effects.apply).toHaveBeenCalledTimes(calls);
    const older = controller.begin("s", "older", "source-a", "anchor-1");
    controller.handle({ ...frame(older.requestId!, [entry(8), entry(9)], true), replayKind: "older", windowMinSeq: 8, windowMaxSeq: 9 });
    expect(effects.apply).toHaveBeenCalledTimes(1);
    expect(effects.replace).toHaveBeenCalledWith("s", [entry(8), entry(9), entry(10), entry(11)], { requestId: older.requestId, anchorToken: "anchor-1" });
  });

  it("renders cold replay batches before terminal arrives", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");

    controller.handle(frame(cold.requestId!, [entry(1)], false));

    expect(effects.apply).toHaveBeenCalledWith("s", [entry(1)]);
    expect(effects.loading).toHaveBeenLastCalledWith("s", true);

    controller.handle(frame(cold.requestId!, [], true));

    expect(effects.loading).toHaveBeenLastCalledWith("s", false);
  });

  it("keeps a matching reset request correlated so its cold terminal replaces state", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const request = controller.begin("s", "cold", "source-a");
    controller.handle({ type: "session_state_reset", sessionId: "s", requestId: request.requestId!, sourceGeneration: "source-b", reason: "source_replaced" });
    controller.handle(frame(request.requestId!, [entry(20), entry(21)], true, "source-b"));
    expect(effects.reset).toHaveBeenCalledWith("s");
    expect(effects.apply).toHaveBeenCalledWith("s", [entry(20), entry(21)]);
    expect(effects.loading).toHaveBeenLastCalledWith("s", false);
    expect(effects.reconnect).not.toHaveBeenCalled();
    expect(controller.ledger("s").events).toEqual([entry(20), entry(21)]);
    expect(controller.ledger("s").status).toBe("ready");
    expect(controller.ledger("s").request).toBeNull();
  });

  it("exposes an atomic reset for foreground lifecycle recovery", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const request = controller.begin("s", "cold", "source-a");
    controller.handle(frame(request.requestId!, [entry(1)], true));

    controller.reset("s", "source-b");

    expect(effects.reset).toHaveBeenCalledWith("s");
    expect(controller.ledger("s").events).toEqual([]);
    expect(controller.ledger("s").sourceGeneration).toBe("source-b");
    expect(controller.ledger("s").status).toBe("cold");
    expect(controller.ledger("s").request).toBeNull();
    expect(effects.loading).toHaveBeenLastCalledWith("s", false);
  });

  it("retries a matching replay terminal through the open sender before settling", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn(), retry: vi.fn() };
    const controller = new SessionReplayController(effects);
    const first = controller.begin("s", "cold", "source-a");
    controller.handle({ ...frame(first.requestId!, [], true), errorCode: "delivery_failed" });
    expect(effects.reconnect).not.toHaveBeenCalled();
    expect(effects.retry).not.toHaveBeenCalled();
    expect(effects.send).toHaveBeenCalledTimes(2);
    const second = effects.send.mock.calls.at(-1)![0];
    expect(second.requestId).not.toBe(first.requestId);
    controller.handle({ ...frame(second.requestId, [], true), errorCode: "delivery_failed" });
    expect(effects.retry).toHaveBeenCalledWith("s", "cold");
    expect(effects.loading).toHaveBeenLastCalledWith("s", false);
    expect(controller.ledger("s").status).toBe("retry");
  });

  it("publishes authoritative continuation metadata and anchors older paging at the retained head", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), window: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");

    controller.handle({ ...frame(cold.requestId!, [entry(50)], true), windowMinSeq: 50, hasMoreOlder: true, partialHead: true });
    expect(effects.window).toHaveBeenLastCalledWith("s", { minSeq: 50, hasMoreOlder: true, partialHead: true, kind: "cold" });

    // The UI's older callback uses the controller's canonical minimum sequence.
    const older = controller.begin("s", "older", "source-a", "anchor-50");
    expect(older.fromSeq).toBe(50);
    controller.handle({ ...frame(older.requestId!, [entry(49)], true), replayKind: "older", windowMinSeq: 49, hasMoreOlder: false });

    expect(effects.window).toHaveBeenLastCalledWith("s", { minSeq: 49, hasMoreOlder: false, partialHead: false, kind: "older" });
    expect(effects.replace).toHaveBeenCalledWith("s", [entry(49), entry(50)], { requestId: older.requestId, anchorToken: "anchor-50" });
  });

  it("resets conflicting live state and starts cold recovery without preserving the prefix", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const initial = controller.begin("s", "cold", "source-a");
    controller.handle(frame(initial.requestId!, [entry(10), entry(11)], true));

    const conflictingEvent = { ...entry(11).event, data: { changed: true } };
    controller.handle({ type: "event", sessionId: "s", seq: 11, event: conflictingEvent });

    expect(effects.reset).toHaveBeenCalledWith("s");
    expect(effects.apply).toHaveBeenCalledTimes(1);
    const recovery = effects.send.mock.calls.at(-1)![0];
    expect(recovery.lastSeq).toBe(0);
    expect(recovery.mode).toBe("tail");
    expect(controller.ledger("s").events).toEqual([]);
    expect(controller.ledger("s").status).toBe("cold");
    expect(controller.ledger("s").request?.requestId).toBe(recovery.requestId);
  });

  it("assembles only current bounded asset chunks and discards superseded chunks", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const request = controller.begin("s", "cold", "source-a");
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: "old", sourceGeneration: "source-a", hash: "h", mimeType: "image/png", chunkIndex: 0, chunkCount: 2, data: "discard" });
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: request.requestId!, sourceGeneration: "source-a", hash: "h", mimeType: "image/png", chunkIndex: 1, chunkCount: 2, data: "b" });
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: request.requestId!, sourceGeneration: "source-a", hash: "h", mimeType: "image/png", chunkIndex: 0, chunkCount: 2, data: "a" });
    expect(effects.publishAsset).toHaveBeenCalledWith("s", { hash: "h", mimeType: "image/png", data: "ab" });
  });

  it("drops malformed, unavailable, and superseded asset assemblies before publication", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn(), assetUnavailable: vi.fn() };
    const controller = new SessionReplayController(effects);
    const first = controller.begin("s", "cold", "source-a");
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: first.requestId!, sourceGeneration: "source-a", hash: "bad hash", mimeType: "not-a-mime", chunkIndex: 0, chunkCount: 1, data: "no" });
    const second = controller.begin("s", "cold", "source-a");
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: first.requestId!, sourceGeneration: "source-a", hash: "asset_1", mimeType: "image/png", chunkIndex: 0, chunkCount: 2, data: "stale" });
    controller.handle({ type: "asset_unavailable", sessionId: "s", requestId: second.requestId!, sourceGeneration: "source-a", hash: "asset_1", reason: "missing" });
    expect(effects.publishAsset).not.toHaveBeenCalled();
    expect(effects.assetUnavailable).toHaveBeenCalledWith("s", "asset_1", "missing");
  });

  it("cancels the second timed-out request so its late terminal is inert", () => {
    vi.useFakeTimers();
    try {
      const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn(), retry: vi.fn() };
      const controller = new SessionReplayController(effects);
      const first = controller.begin("s", "cold", "source-a");
      vi.advanceTimersByTime(90_000);
      const second = effects.send.mock.calls.at(-1)![0];
      expect(second.requestId).not.toBe(first.requestId);
      expect(effects.reconnect).not.toHaveBeenCalled();
      expect(effects.retry).not.toHaveBeenCalled();
      vi.advanceTimersByTime(89_999);
      expect(effects.retry).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(effects.retry).toHaveBeenCalledWith("s", "cold");
      controller.handle(frame(second.requestId, [entry(1)], true));
      expect(effects.apply).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels superseded request deadlines before they can affect replacement state", () => {
    vi.useFakeTimers();
    try {
      const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn(), retry: vi.fn() };
      const controller = new SessionReplayController(effects);
      const first = controller.begin("s", "cold", "source-a");
      const replacement = controller.begin("s", "cold", "source-a");
      expect(replacement.requestId).not.toBe(first.requestId);
      vi.advanceTimersByTime(90_000);
      expect(effects.reconnect).not.toHaveBeenCalled();
      expect(effects.retry).not.toHaveBeenCalled();
      expect(effects.send).toHaveBeenCalledTimes(3);
      controller.handle(frame(first.requestId!, [entry(1)], true));
      expect(effects.apply).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps cold replay authoritative when cached history lacks a root user turn", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");
    const toolEntry = { ...entry(100), event: { sessionId: "s", eventType: "task:subagent:event", timestamp: 100, data: { event: { message: { role: "user", content: "parent interruption" } } } } as unknown as DashboardEvent };

    expect(controller.seedCached("s", "source-a", [toolEntry])).toBe(false);
    expect(controller.ledger("s").request?.requestId).toBe(cold.requestId);
    expect(effects.send).toHaveBeenCalledTimes(1);
  });

  it("automatically continues a partial tool-only tail", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");
    const toolEntry = { ...entry(100), event: { sessionId: "s", eventType: "tool_execution_end", timestamp: 100, data: { toolCallId: "hub-1" } } as unknown as DashboardEvent };

    controller.handle({ ...frame(cold.requestId!, [toolEntry], false), windowMinSeq: 100, windowMaxSeq: 100, hasMoreOlder: true, partialHead: true });
    controller.handle({ ...frame(cold.requestId!, [], true), windowMinSeq: 100, windowMaxSeq: 100, hasMoreOlder: true, partialHead: true });

    expect(effects.send).toHaveBeenCalledTimes(2);
    expect(effects.send.mock.calls[1]![0]).toMatchObject({ sessionId: "s", fromSeq: 100 });
  });

  it("continues past assistant narration until a user turn", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");
    const assistantEntry = { ...entry(100), event: { sessionId: "s", eventType: "message_end", timestamp: 100, data: { message: { role: "assistant", content: [{ type: "text", text: "still working" }] } } } as unknown as DashboardEvent };

    controller.handle({ ...frame(cold.requestId!, [assistantEntry], false), windowMinSeq: 100, windowMaxSeq: 100, hasMoreOlder: true, partialHead: true });
    controller.handle({ ...frame(cold.requestId!, [], true), windowMinSeq: 100, windowMaxSeq: 100, hasMoreOlder: true, partialHead: true });

    expect(effects.send).toHaveBeenCalledTimes(2);
  });

  it("stops automatic paging at the latest user turn", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    const cold = controller.begin("s", "cold", "source-a");
    const userEntry = { ...entry(100), event: { sessionId: "s", eventType: "message_start", timestamp: 100, data: { message: { role: "user", content: "review this" } } } as unknown as DashboardEvent };

    controller.handle({ ...frame(cold.requestId!, [userEntry], false), windowMinSeq: 100, windowMaxSeq: 100, hasMoreOlder: true, partialHead: true });
    controller.handle({ ...frame(cold.requestId!, [], true), windowMinSeq: 100, windowMaxSeq: 100, hasMoreOlder: true, partialHead: true });

    expect(effects.send).toHaveBeenCalledTimes(1);
  });

  it("bounds aggregate asset assembly and publishes a completed asset exactly once", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn(), assetUnavailable: vi.fn() };
    const controller = new SessionReplayController(effects);
    const request = controller.begin("s", "cold", "source-a");
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: request.requestId!, sourceGeneration: "source-a", hash: "large_a", mimeType: "image/png", chunkIndex: 0, chunkCount: 2, data: "a".repeat(600_000) });
    controller.handle({ type: "asset_replay_chunk", sessionId: "s", requestId: request.requestId!, sourceGeneration: "source-a", hash: "large_b", mimeType: "image/png", chunkIndex: 0, chunkCount: 2, data: "b".repeat(500_001) });
    expect(effects.assetUnavailable).toHaveBeenCalledWith("s", "large_b", "budget_exceeded");

    const assetChunk = (chunkIndex: number, data: string) => ({ type: "asset_replay_chunk" as const, sessionId: "s", requestId: request.requestId!, sourceGeneration: "source-a", hash: "asset_once", mimeType: "image/png", chunkIndex, chunkCount: 2, data });
    controller.handle(assetChunk(0, "a"));
    controller.handle(assetChunk(1, "b"));
    // A replayed full sequence for the same request/hash is idempotent.
    controller.handle(assetChunk(0, "a"));
    controller.handle(assetChunk(1, "b"));
    expect(effects.publishAsset).toHaveBeenCalledTimes(1);
    expect(effects.publishAsset).toHaveBeenCalledWith("s", { hash: "asset_once", mimeType: "image/png", data: "ab" });
  });
});
