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
 * Every field is now populated from its real, content-free source: ledger
 * sizes from the replay controller, `persisterBytes` from
 * `ReplayPersister.bytes()`, `detailBytes` from `estimateDerivedDetailBytes`
 * (subagent detail timelines), `derivationMs` from the timed ChatView
 * `renderRows` derivation, `hydrationSource`/`coldStartTrigger` from the
 * actual cold-start path, and `evictions` as the exact sum of
 * `EvictedToolBurst.count`. `highWaterBytes` is tracked locally as the running
 * max of the computed `ledgerBytes` for each session.
 *
 * Budget-constant retuning from prod high-water marks (#78 item 3) remains a
 * separate follow-up that needs real prod data — not part of this emitter.
 *
 * NEVER reads message text, tool args, images, or raw event payloads —
 * `sanitizeHotWindowReport` is the final choke point even if a future caller
 * mistakenly widens what's gathered here.
 *
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.1); hot-window-metrics.
 */
import type { BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { estimateSeqEventBytes } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { type HydrationSource, sanitizeHotWindowReport } from "@blackbelt-technology/pi-dashboard-shared/hot-window-metrics.js";
import { useEffect, useRef } from "react";
import { estimateDerivedDetailBytes, type SessionState } from "../lib/event-reducer.js";
import type { ReplayPersister } from "../lib/replay-persist.js";
import type { SessionReplayController } from "./useSessionReplayController.js";

export const HOT_WINDOW_REPORT_MIN_INTERVAL_MS = 1000;

/** Per-session hydration path label + optional cold-start trigger. */
export interface HydrationStateEntry {
  source: HydrationSource;
  coldStartTrigger?: string;
}

interface UseHotWindowMetricsReporterOptions {
  sessionStates: Map<string, SessionState>;
  send: (message: BrowserToServerMessage) => void;
  replayController: Pick<SessionReplayController, "ledger">;
  connected: boolean;
  /** Per-session replay persisters — read for retained buffer bytes only. */
  replayPersisters: ReadonlyMap<string, { persister: Pick<ReplayPersister, "bytes"> }>;
  /** Per-session hydration path (stream/cache/memory) + optional trigger label. */
  hydrationState: ReadonlyMap<string, HydrationStateEntry>;
  /** Per-session latest ChatView renderRows derivation ms. */
  derivationTiming: ReadonlyMap<string, number>;
}

/** Gathers one session's readily-available hot-window sizes. Content-free by construction. */
function buildReport(
  sessionId: string,
  state: SessionState,
  replayController: Pick<SessionReplayController, "ledger">,
  highWaterRef: Map<string, number>,
  replayPersisters: ReadonlyMap<string, { persister: Pick<ReplayPersister, "bytes"> }>,
  hydrationState: ReadonlyMap<string, HydrationStateEntry>,
  derivationTiming: ReadonlyMap<string, number>,
) {
  const ledger = replayController.ledger(sessionId);
  const ledgerEvents = ledger.events;
  let ledgerBytes = 0;
  for (const entry of ledgerEvents) ledgerBytes += estimateSeqEventBytes(entry);

  const highWaterBytes = Math.max(ledgerBytes, highWaterRef.get(sessionId) ?? 0);
  highWaterRef.set(sessionId, highWaterBytes);

  // Exact eviction count = sum of each burst's collapsed member count (NOT the
  // burst array length, which under-counts multi-tool bursts).
  let evictions = 0;
  for (const burst of state.evictedToolBursts) evictions += burst.count;

  const hydration = hydrationState.get(sessionId);

  return sanitizeHotWindowReport({
    sessionId,
    ledgerBytes,
    ledgerEvents: ledgerEvents.length,
    // Retained UTF-8 bytes in the debounced replay-cache persister buffer.
    persisterBytes: replayPersisters.get(sessionId)?.persister.bytes(sessionId) ?? 0,
    messages: state.messages.length,
    toolCalls: state.toolCalls.size,
    subagents: state.subagents.size,
    interactiveRequests: state.interactiveRequests.length,
    // Serialized bytes of the subagent detail timelines (size only, no content).
    detailBytes: estimateDerivedDetailBytes(state),
    evictions,
    highWaterBytes,
    // Wall-clock ms of the ChatView renderRows derivation (0 until measured).
    derivationMs: derivationTiming.get(sessionId) ?? 0,
    hydrationSource: hydration?.source ?? "memory",
    // Optional — set only when defined; sanitize drops a non-string anyway.
    coldStartTrigger: hydration?.coldStartTrigger,
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
  replayPersisters,
  hydrationState,
  derivationTiming,
}: UseHotWindowMetricsReporterOptions): void {
  const lastSentAtRef = useRef(new Map<string, number>());
  const pendingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const highWaterRef = useRef(new Map<string, number>());
  const latestRef = useRef({ sessionStates, send, replayController, connected, replayPersisters, hydrationState, derivationTiming });
  latestRef.current = { sessionStates, send, replayController, connected, replayPersisters, hydrationState, derivationTiming };

  useEffect(() => {
    const pendingTimers = pendingTimersRef.current;
    return () => {
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
    };
  }, []);

  // Prune per-session tracking state for sessions no longer in
  // `sessionStates` so a long-lived tab with many rotated sessions doesn't
  // accumulate stale entries. Clears any pending timer for a pruned session.
  useEffect(() => {
    const liveIds = new Set(sessionStates.keys());
    for (const sessionId of lastSentAtRef.current.keys()) {
      if (!liveIds.has(sessionId)) lastSentAtRef.current.delete(sessionId);
    }
    for (const sessionId of highWaterRef.current.keys()) {
      if (!liveIds.has(sessionId)) highWaterRef.current.delete(sessionId);
    }
    for (const [sessionId, timer] of pendingTimersRef.current) {
      if (!liveIds.has(sessionId)) {
        clearTimeout(timer);
        pendingTimersRef.current.delete(sessionId);
      }
    }
  }, [sessionStates]);

  useEffect(() => {
    if (!connected) return;

    const emit = (sessionId: string) => {
      const {
        sessionStates: latestStates,
        send: latestSend,
        replayController: latestController,
        connected: stillConnected,
        replayPersisters: latestPersisters,
        hydrationState: latestHydration,
        derivationTiming: latestDerivation,
      } = latestRef.current;
      pendingTimersRef.current.delete(sessionId);
      if (!stillConnected) return;
      const state = latestStates.get(sessionId);
      if (!state) return;
      const report = buildReport(
        sessionId,
        state,
        latestController,
        highWaterRef.current,
        latestPersisters,
        latestHydration,
        latestDerivation,
      );
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
