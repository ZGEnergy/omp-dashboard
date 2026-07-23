import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../lib/event-reducer.js";
import { HOT_WINDOW_REPORT_MIN_INTERVAL_MS, useHotWindowMetricsReporter } from "../useHotWindowMetricsReporter.js";
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
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [msg] = send.mock.calls[0];
    expect(msg.type).toBe("hot_window_report");
    expect(msg.report.sessionId).toBe("s1");
    expect(msg.report.messages).toBe(0);
    expect(JSON.stringify(msg)).not.toMatch(/messageText|toolArgs|rawEvent/);
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
          },
        },
      );
      expect(send).toHaveBeenCalledTimes(1);

      // Re-render several times within the window: must not send again yet,
      // and must not schedule more than one pending timer per session.
      sessionStates = new Map(sessionStates);
      rerender({ sessionStates, send, replayController: makeController(), connected: true });
      rerender({ sessionStates, send, replayController: makeController(), connected: true });
      expect(send).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(HOT_WINDOW_REPORT_MIN_INTERVAL_MS);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
