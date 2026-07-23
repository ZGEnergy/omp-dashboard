/**
 * Tests that `createBrowserGateway` accepts `hot_window_report` frames,
 * sanitizes them, and folds them into the injected `HotWindowMetrics`
 * aggregate without forwarding them anywhere.
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.2).
 */
import { describe, expect, it, vi } from "vitest";
import { createBrowserGateway } from "../browser-gateway.js";
import { createHotWindowMetrics } from "../hot-window-metrics.js";
import { createMemoryEventStore } from "../memory-event-store.js";
import { createMemorySessionManager } from "../memory-session-manager.js";
import { createDrainingWs } from "./helpers/draining-ws.js";

function report(overrides: Record<string, unknown> = {}) {
  return {
    type: "hot_window_report",
    report: {
      sessionId: "session-1",
      ledgerBytes: 1000,
      ledgerEvents: 5,
      persisterBytes: 0,
      messages: 3,
      toolCalls: 1,
      subagents: 0,
      interactiveRequests: 0,
      detailBytes: 0,
      evictions: 2,
      highWaterBytes: 1000,
      derivationMs: 0,
      hydrationSource: "memory",
      ...overrides,
    },
  };
}

// `createBrowserGateway`'s hotWindowMetrics param sits after 17 other
// (all-optional) positional params; pad with `undefined` rather than guess a
// shorter arg list, so we don't silently target the wrong parameter.
const UNDEFINED_PADDING = new Array(17).fill(undefined) as unknown[];

function makeGateway(hotWindowMetrics?: ReturnType<typeof createHotWindowMetrics>, sendToSession = vi.fn()) {
  return createBrowserGateway(
    createMemorySessionManager(),
    createMemoryEventStore(() => false),
    { start: vi.fn(), stop: vi.fn(), sendToSession, getConnectedSessionIds: vi.fn(), hasSession: vi.fn(), onEvent: vi.fn() } as any,
    ...(UNDEFINED_PADDING as []),
    hotWindowMetrics,
  );
}

describe("browser gateway hot_window_report", () => {
  it("sanitizes and folds a report into the aggregate without forwarding it", () => {
    const sendToSession = vi.fn();
    const hotWindowMetrics = createHotWindowMetrics(20);
    const gateway = makeGateway(hotWindowMetrics, sendToSession);
    const ws = createDrainingWs({ drainRateBytesPerMs: 10_000 });
    gateway.wss.emit("connection", ws, {});

    ws.emit("message", Buffer.from(JSON.stringify(report())));

    const snap = hotWindowMetrics.snapshot();
    expect(snap.totalReports).toBe(1);
    expect(snap.highWaterBytes).toBe(1000);
    expect(snap.reports[0].sessionId).toBe("session-1");
    expect(sendToSession).not.toHaveBeenCalled();
  });

  it("never throws into the WS handler on a malformed report", () => {
    const hotWindowMetrics = createHotWindowMetrics(20);
    const gateway = makeGateway(hotWindowMetrics);
    const ws = createDrainingWs({ drainRateBytesPerMs: 10_000 });
    gateway.wss.emit("connection", ws, {});

    expect(() =>
      ws.emit("message", Buffer.from(JSON.stringify({ type: "hot_window_report", report: null }))),
    ).not.toThrow();
    expect(() =>
      ws.emit("message", Buffer.from(JSON.stringify({ type: "hot_window_report" }))),
    ).not.toThrow();

    // A malformed/empty report still sanitizes to a valid (zeroed) report and
    // gets ingested — the sanitizer, not the gateway, is the content guard.
    expect(hotWindowMetrics.snapshot().totalReports).toBe(2);
  });

  it("no-ops safely when no hotWindowMetrics instance is injected", () => {
    const gateway = createBrowserGateway(
      createMemorySessionManager(),
      createMemoryEventStore(() => false),
      { start: vi.fn(), stop: vi.fn(), sendToSession: vi.fn(), getConnectedSessionIds: vi.fn(), hasSession: vi.fn(), onEvent: vi.fn() } as any,
    );
    const ws = createDrainingWs({ drainRateBytesPerMs: 10_000 });
    gateway.wss.emit("connection", ws, {});

    expect(() => ws.emit("message", Buffer.from(JSON.stringify(report())))).not.toThrow();
  });
});
