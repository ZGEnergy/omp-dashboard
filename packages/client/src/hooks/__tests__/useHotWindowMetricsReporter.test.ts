import type { SubagentTimelineEntry } from "@blackbelt-technology/pi-dashboard-subagents-plugin/client";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialState, type SessionState } from "../../lib/event-reducer.js";
import {
  HOT_WINDOW_REPORT_MIN_INTERVAL_MS,
  type HydrationStateEntry,
  useHotWindowMetricsReporter,
} from "../useHotWindowMetricsReporter.js";
import { SessionReplayController } from "../useSessionReplayController.js";

function makeController() {
  return new SessionReplayController({
    send: vi.fn(),
    apply: vi.fn(),
    replace: vi.fn(),
    reset: vi.fn(),
    loading: vi.fn(),
    reconnect: vi.fn(),
    publishAsset: vi.fn(),
  });
}

/** Default stub inputs for the new reporter options — empty maps, no leak. */
function defaultExtras() {
  return {
    replayPersisters: new Map<string, { persister: { bytes(id: string): number } }>(),
    hydrationState: new Map<string, HydrationStateEntry>(),
    derivationTiming: new Map<string, number>(),
  };
}

describe("useHotWindowMetricsReporter", () => {
  it("does nothing when disconnected", () => {
    const send = vi.fn();
    const sessionStates = new Map([["s1", createInitialState()]]);
    renderHook(() =>
      useHotWindowMetricsReporter({
        sessionStates,
        send,
        replayController: makeController(),
        connected: false,
        ...defaultExtras(),
      }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("emits a content-free hot_window_report frame once connected, immediately for the first report", () => {
    const send = vi.fn();
    const sessionStates = new Map([["s1", createInitialState()]]);
    renderHook(() =>
      useHotWindowMetricsReporter({
        sessionStates,
        send,
        replayController: makeController(),
        connected: true,
        ...defaultExtras(),
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [msg] = send.mock.calls[0];
    expect(msg.type).toBe("hot_window_report");
    expect(msg.report.sessionId).toBe("s1");
    expect(msg.report.messages).toBe(0);
    expect(JSON.stringify(msg)).not.toMatch(/messageText|toolArgs|rawEvent/);
  });

  it("populates every field from its real source and stays payload-free", () => {
    const send = vi.fn();
    const state: SessionState = createInitialState();
    // Subagent detail timeline → detailBytes.
    const entries: SubagentTimelineEntry[] = [
      { kind: "text", text: "hello", ts: 1 },
      { kind: "tool", toolName: "Read", input: { path: "x" }, ts: 2 },
    ];
    state.subagents.set("a", {
      id: "a",
      type: "general-purpose",
      description: "d",
      status: "running",
      entries,
    });
    // Evicted tool bursts with exact member counts → evictions (3 + 2 = 5),
    // NOT the burst array length (2).
    state.evictedToolBursts = [
      { fromSeq: 1, toSeq: 3, count: 3 },
      { fromSeq: 8, toSeq: 9, count: 2 },
    ];

    const sessionStates = new Map([["s1", state]]);
    const replayPersisters = new Map([["s1", { persister: { bytes: () => 4096 } }]]);
    const hydrationState = new Map<string, HydrationStateEntry>([
      ["s1", { source: "cache", coldStartTrigger: "cache_miss" }],
    ]);
    const derivationTiming = new Map([["s1", 7.5]]);

    renderHook(() =>
      useHotWindowMetricsReporter({
        sessionStates,
        send,
        replayController: makeController(),
        connected: true,
        replayPersisters,
        hydrationState,
        derivationTiming,
      }),
    );

    expect(send).toHaveBeenCalledTimes(1);
    const [msg] = send.mock.calls[0];
    const report = msg.report;
    expect(report.persisterBytes).toBe(4096);
    const expectedDetailBytes = new TextEncoder().encode(JSON.stringify(entries)).length;
    expect(report.detailBytes).toBe(expectedDetailBytes);
    expect(report.detailBytes).toBeGreaterThan(0);
    expect(report.derivationMs).toBe(7.5);
    expect(report.evictions).toBe(5);
    expect(report.hydrationSource).toBe("cache");
    expect(report.coldStartTrigger).toBe("cache_miss");

    // Sanitized invariant: no content keys, every numeric field finite.
    expect(JSON.stringify(msg)).not.toMatch(/messageText|toolArgs|rawEvent|content/i);
    for (const key of [
      "ledgerBytes",
      "persisterBytes",
      "detailBytes",
      "derivationMs",
      "evictions",
      "highWaterBytes",
    ] as const) {
      expect(Number.isFinite(report[key])).toBe(true);
    }
  });

  it("rate-limits repeated emissions to >=1s per session (coalesced, not queued)", () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn();
      let sessionStates = new Map([["s1", createInitialState()]]);
      const { rerender } = renderHook(
        (props) => useHotWindowMetricsReporter(props),
        {
          initialProps: {
            sessionStates,
            send,
            replayController: makeController(),
            connected: true,
            ...defaultExtras(),
          },
        },
      );
      expect(send).toHaveBeenCalledTimes(1);

      // Re-render several times within the window: must not send again yet,
      // and must not schedule more than one pending timer per session.
      sessionStates = new Map(sessionStates);
      rerender({ sessionStates, send, replayController: makeController(), connected: true, ...defaultExtras() });
      rerender({ sessionStates, send, replayController: makeController(), connected: true, ...defaultExtras() });
      expect(send).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(HOT_WINDOW_REPORT_MIN_INTERVAL_MS);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
