/**
 * Rate-limited, payload-free hot-window observability emitter.
 *
 * Folds the READILY-AVAILABLE bounded hot-transcript sizes (reducer counts,
 * ledger retained bytes/events, evicted-tool-burst count) into a
 * `HotWindowReport` and sends it over the existing browser→server socket as
 * a `hot_window_report` frame. Rate-limited to at most one send per session
 * per `HOT_WINDOW_REPORT_MIN_INTERVAL_MS` (coalesced: at most one pending
 * timer per session, always flushing the LATEST state at fire time).
 *
 * Fields not cheaply sourced from existing client state (`persisterBytes`,
 * `detailBytes`, `derivationMs`, `coldStartTrigger`) report a sane default
 * (`0` / omitted) — full population is metric-tuning tracked separately, not
 * a blocker for the frame itself. `highWaterBytes` is tracked locally as the
 * running max of the computed `ledgerBytes` for each session.
 *
 * NEVER reads message text, tool args, images, or raw event payloads —
 * `sanitizeHotWindowReport` is the final choke point even if a future caller
 * mistakenly widens what's gathered here.
 *
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.1).
 */
import type { BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { estimateSeqEventBytes } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { sanitizeHotWindowReport } from "@blackbelt-technology/pi-dashboard-shared/hot-window-metrics.js";
import { useEffect, useRef } from "react";
import type { SessionState } from "../lib/event-reducer.js";
import type { SessionReplayController } from "./useSessionReplayController.js";

export const HOT_WINDOW_REPORT_MIN_INTERVAL_MS = 1000;

interface UseHotWindowMetricsReporterOptions {
  sessionStates: Map<string, SessionState>;
  send: (message: BrowserToServerMessage) => void;
  replayController: Pick<SessionReplayController, "ledger">;
  connected: boolean;
}

/** Gathers one session's readily-available hot-window sizes. Content-free by construction. */
function buildReport(
  sessionId: string,
  state: SessionState,
  replayController: Pick<SessionReplayController, "ledger">,
  highWaterRef: Map<string, number>,
) {
  const ledger = replayController.ledger(sessionId);
  const ledgerEvents = ledger.events;
  let ledgerBytes = 0;
  for (const entry of ledgerEvents) ledgerBytes += estimateSeqEventBytes(entry);

  const highWaterBytes = Math.max(ledgerBytes, highWaterRef.get(sessionId) ?? 0);
  highWaterRef.set(sessionId, highWaterBytes);

  return sanitizeHotWindowReport({
    sessionId,
    ledgerBytes,
    ledgerEvents: ledgerEvents.length,
    // Not cheaply exposed by ReplayPersister today; metric-tuning follow-up.
    persisterBytes: 0,
    messages: state.messages.length,
    toolCalls: state.toolCalls.size,
    subagents: state.subagents.size,
    interactiveRequests: state.interactiveRequests.length,
    // Detail/inspector pane byte accounting not wired yet; metric-tuning follow-up.
    detailBytes: 0,
    evictions: state.evictedToolBursts.length,
    highWaterBytes,
    // No timing instrumentation around derivation yet; metric-tuning follow-up.
    derivationMs: 0,
    hydrationSource: "memory",
  });
}

/**
 * Reports bounded hot-window sizes for every active session over the
 * existing socket, rate-limited to >=1s per session with a single
 * coalesced pending timer (no unbounded timer growth, no queued backlog).
 */
export function useHotWindowMetricsReporter({
  sessionStates,
  send,
  replayController,
  connected,
}: UseHotWindowMetricsReporterOptions): void {
  const lastSentAtRef = useRef(new Map<string, number>());
  const pendingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const highWaterRef = useRef(new Map<string, number>());
  const latestRef = useRef({ sessionStates, send, replayController, connected });
  latestRef.current = { sessionStates, send, replayController, connected };

  useEffect(() => {
    const pendingTimers = pendingTimersRef.current;
    return () => {
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
    };
  }, []);

  useEffect(() => {
    if (!connected) return;

    const emit = (sessionId: string) => {
      const { sessionStates: latestStates, send: latestSend, replayController: latestController, connected: stillConnected } =
        latestRef.current;
      pendingTimersRef.current.delete(sessionId);
      if (!stillConnected) return;
      const state = latestStates.get(sessionId);
      if (!state) return;
      const report = buildReport(sessionId, state, latestController, highWaterRef.current);
      lastSentAtRef.current.set(sessionId, Date.now());
      latestSend({ type: "hot_window_report", report });
    };

    for (const sessionId of sessionStates.keys()) {
      if (pendingTimersRef.current.has(sessionId)) continue; // coalesce: one in-flight report per session
      const elapsed = Date.now() - (lastSentAtRef.current.get(sessionId) ?? -Infinity);
      if (elapsed >= HOT_WINDOW_REPORT_MIN_INTERVAL_MS) {
        emit(sessionId);
      } else {
        const timer = setTimeout(() => emit(sessionId), HOT_WINDOW_REPORT_MIN_INTERVAL_MS - elapsed);
        pendingTimersRef.current.set(sessionId, timer);
      }
    }
  }, [sessionStates, connected]);
}
