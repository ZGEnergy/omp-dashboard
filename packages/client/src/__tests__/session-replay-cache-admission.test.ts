import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { replayEntriesAsEvents } from "@blackbelt-technology/pi-dashboard-shared/state-replay.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { SessionReplayController } from "../hooks/useSessionReplayController.js";
import { createInitialState, reduceEvent, type SessionState } from "../lib/event-reducer.js";
import { createReplayCache, type CachedEvent } from "../lib/replay-cache.js";
import { rehydrateSession } from "../lib/rehydrate-session.js";

function reduceEntries(state: SessionState, entries: readonly CachedEvent[]): SessionState {
  return entries.reduce((current, entry) => reduceEvent(current, entry.event), state);
}

describe("session replay cache admission", () => {
  it("installs reset-era cached history and keeps it after an empty delta terminal", async () => {
    const sessionId = "session-cache-admission";
    const scope = { serverEpoch: "server-1", sourceGeneration: "source-1" };
    const cachedEvents = replayEntriesAsEvents(sessionId, [
      {
        type: "message",
        id: "user-entry",
        parentId: null,
        timestamp: "2026-01-01T00:00:00Z",
        message: { role: "user", content: [{ type: "text", text: "cached question" }] },
      },
      {
        type: "message",
        id: "assistant-entry",
        parentId: "user-entry",
        timestamp: "2026-01-01T00:00:01Z",
        message: { role: "assistant", content: [{ type: "text", text: "cached answer" }] },
      },
    ]).map((entry, index) => ({ seq: index + 1, event: entry.event as DashboardEvent }));
    const cache = createReplayCache({ factory: new IDBFactory() });
    await cache.putScoped(scope, sessionId, { maxSeq: cachedEvents.at(-1)!.seq, payload: cachedEvents });

    // Match the shell's per-session state boundary: a reset leaves this
    // selected session keyed to a fresh, empty reducer state.
    let sessionStates = new Map([[sessionId, createInitialState()]]);
    const controller = new SessionReplayController({
      send: () => {},
      apply: (_sid, entries) => {
        const next = new Map(sessionStates);
        next.set(_sid, reduceEntries(next.get(_sid) ?? createInitialState(), entries));
        sessionStates = next;
      },
      replace: (_sid, entries) => {
        const next = new Map(sessionStates);
        next.set(_sid, reduceEntries(createInitialState(), entries));
        sessionStates = next;
      },
      reset: () => { sessionStates = new Map([[sessionId, createInitialState()]]); },
      loading: () => {},
      reconnect: () => {},
      publishAsset: () => {},
    });

    const cold = controller.begin(sessionId, "cold", scope.sourceGeneration);
    const abort = new AbortController();
    const rehydrated = await rehydrateSession(sessionId, cache, {
      authority: {
        scope,
        signal: abort.signal,
        isCurrent: () => controller.ledger(sessionId).request?.requestId === cold.requestId &&
          controller.ledger(sessionId).sourceGeneration === scope.sourceGeneration,
      },
    });
    expect(rehydrated).not.toBeNull();

    // The cache admission replaces only the reset-era placeholder. A state
    // update that raced the async read would have a different identity here.
    const stateAtAdmission = sessionStates.get(sessionId);
    const ledger = controller.ledger(sessionId);
    expect(ledger.seed(scope.sourceGeneration, rehydrated!.events)).toBe(true);
    const admitted = new Map(sessionStates);
    if (admitted.get(sessionId) === stateAtAdmission) {
      admitted.set(sessionId, rehydrated!.state);
      sessionStates = admitted;
    }
    expect(sessionStates.get(sessionId)!.messages.map((message) => message.content)).toEqual(["cached question", "cached answer"]);

    const delta = controller.begin(sessionId, "delta", scope.sourceGeneration);
    controller.handle({
      type: "event_replay",
      sessionId,
      requestId: delta.requestId,
      replayKind: "delta",
      sourceGeneration: scope.sourceGeneration,
      events: [],
      isLast: true,
      // Empty delta terminal: the frame delivers nothing, so the delivered
      // window is null/null; the cache still retains the full 1..2 window.
      windowMinSeq: null,
      windowMaxSeq: null,
      retainedMinSeq: cachedEvents[0]!.seq,
      hasMoreOlder: false,
      partialHead: false,
      historyTruncated: false,
    });

    expect(sessionStates.get(sessionId)!.messages.map((message) => message.content)).toEqual(["cached question", "cached answer"]);
  });
});
