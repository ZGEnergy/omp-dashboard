/**
 * Integration coverage for bridge reconnect replay handling in event-wiring.
 * A reconnect may skip a replay only after the previous replay completed.
 */
import { describe, expect, it } from "vitest";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { EventWiringDeps } from "../event-wiring.js";
import { wireEvents } from "../event-wiring.js";
import { createMemoryEventStore } from "../memory-event-store.js";
import { createMemorySessionManager } from "../memory-session-manager.js";

const SID = "session-1";

function event(label: string): DashboardEvent {
  return { eventType: "message_start", timestamp: Date.now(), data: { label } };
}

function createWiring() {
  const sessionManager = createMemorySessionManager();
  sessionManager.register({ id: SID, cwd: "/tmp", source: "tui" });
  const eventStore = createMemoryEventStore(() => false);
  const piGateway: any = {
    onEvent: undefined,
    isSessionConnected: () => true,
    sendToSession: () => {},
  };
  const sessionUpdates: Record<string, unknown>[] = [];
  const browserGateway: any = {
    broadcastEvent: () => {},
    broadcastSessionUpdated: (_sessionId: string, update: Record<string, unknown>) => sessionUpdates.push(update),
    broadcastSessionAdded: () => {},
    broadcastSessionRemoved: () => {},
    broadcastSessionStateReset: () => {},
    broadcastToAll: () => {},
    completeBridgeReplay: () => {},
    headlessPidRegistry: {
      linkByToken: () => false,
      linkByPid: () => false,
      linkSession: () => {},
    },
    pendingResumeRegistry: { consume: () => undefined },
  };
  const deps: EventWiringDeps = {
    sessionManager,
    eventStore,
    piGateway,
    browserGateway,
    sessionOrderManager: { insert: () => {}, getOrder: () => [], moveToFront: () => {}, rekey: () => {} } as any,
    preferencesStore: { getPinnedDirectories: () => [] } as any,
    pendingForkRegistry: { consumeFork: () => undefined } as any,
    directoryService: { onDirectoryAdded: async () => ({ sessions: [], openspecData: null }) } as any,
    knownSessionIds: new Set([SID]),
    pendingDashboardSpawns: new Map(),
  };
  wireEvents(deps);

  const register = () => piGateway.onEvent(SID, {
    type: "session_register",
    sessionId: SID,
    cwd: "/tmp",
    source: "tui",
  });
  const forward = (label: string) => piGateway.onEvent(SID, {
    type: "event_forward",
    sessionId: SID,
    event: event(label),
  });
  const forwardTurnEnd = () => piGateway.onEvent(SID, {
    type: "event_forward",
    sessionId: SID,
    event: {
      eventType: "turn_end",
      timestamp: Date.now(),
      data: {
        message: { usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0.5 } } },
      },
    },
  });
  const complete = () => piGateway.onEvent(SID, { type: "replay_complete", sessionId: SID });

  return { complete, eventStore, forward, forwardTurnEnd, register, sessionManager, sessionUpdates };
}

describe("skip-wipe on bridge reconnect", () => {
  it("replays a complete transcript after an interrupted replay", () => {
    const { complete, eventStore, forward, register, sessionManager } = createWiring();

    register();
    forward("first");
    register();
    forward("first");
    forward("second");
    forward("third");
    complete();

    expect(eventStore.getEvents(SID, 1).map((entry) => entry.event.data.label)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("replays the current branch even after a prior replay completed", () => {
    const { complete, eventStore, forward, register } = createWiring();

    register();
    forward("first v1");
    forward("second v1");
    forward("third v1");
    complete();

    register();
    forward("first v2");
    forward("second v2");
    forward("third v2");

    expect(eventStore.getEvents(SID, 1).map((entry) => entry.event.data.label)).toEqual([
      "first v2",
      "second v2",
      "third v2",
    ]);
  });

  it("rebuilds cumulative stats without double counting on reconnect", () => {
    const { complete, forwardTurnEnd, register, sessionManager, sessionUpdates } = createWiring();

    register();
    forwardTurnEnd();
    complete();
    expect(sessionManager.get(SID)).toMatchObject({
      tokensIn: 10, tokensOut: 2, cacheRead: 3, cacheWrite: 4, cost: 0.5,
    });

    register();
    forwardTurnEnd();
    complete();
    expect(sessionManager.get(SID)).toMatchObject({
      tokensIn: 10, tokensOut: 2, cacheRead: 3, cacheWrite: 4, cost: 0.5,
    });
    expect(sessionUpdates.at(-1)).toMatchObject({
      tokensIn: 10, tokensOut: 2, cacheRead: 3, cacheWrite: 4, cost: 0.5,
    });
  });
});
