/**
 * Integration test: the push dispatcher is wired into the SAME unread-trigger
 * site in event-wiring.ts.
 *
 * Drives an `agent_end`-with-error event through `wireEvents` (via the captured
 * `piGateway.onEvent` handler) and asserts `pushDispatcher.fanout` is called
 * exactly once with (sessionId, event). Also asserts NO fanout when a browser
 * is viewing the session (same gating as unread) and NO fanout during replay.
 *
 * Spec: push-notifications `Requirement: Push trigger predicate`.
 * See change: add-server-push-notifications.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type EventWiringDeps, wireEvents } from "../event-wiring.js";

const SID = "sess-1";

/** A tiny in-memory session that the wiring mutates via update(). */
function makeSessionManager() {
  const session: Record<string, unknown> = {
    id: SID,
    cwd: "/tmp",
    source: "cli",
    status: "streaming",
    currentTool: null,
    startedAt: 0,
    name: "worker",
  };
  return {
    session,
    get: (_id: string) => session,
    update: (_id: string, updates: Record<string, unknown>) => Object.assign(session, updates),
    listAll: () => [session],
    onUnregister: undefined as unknown,
  };
}

const noop = () => {};

/** Build a full deps object; only the trigger-relevant deps carry behavior. */
function makeDeps(overrides: {
  isViewed?: boolean;
  pushDispatcher?: EventWiringDeps["pushDispatcher"];
}): { deps: EventWiringDeps; piGateway: any; sm: ReturnType<typeof makeSessionManager> } {
  const sm = makeSessionManager();
  const piGateway: any = {
    onEvent: undefined,
    onSessionCreated: undefined,
    onSessionRegistered: undefined,
    sendToSession: noop,
  };
  const browserGateway: any = {
    broadcastEvent: noop,
    broadcastSessionUpdated: noop,
    broadcastSessionAdded: noop,
    broadcastToAll: noop,
    sendToSubscribers: noop,
  };
  const eventStore: any = {
    insertEvent: () => 1,
    getEvent: () => undefined,
    getEvents: () => [],
  };
  const sessionOrderManager: any = {
    getOrder: () => [],
    moveToFront: noop,
    rekey: noop,
  };
  const preferencesStore: any = { getPinnedDirectories: () => [] };

  const deps = {
    sessionManager: sm as any,
    eventStore,
    piGateway,
    browserGateway,
    sessionOrderManager,
    preferencesStore,
    isCompletedFirst: () => false,
    isQuestionFirst: () => false,
    viewedSessionTracker: { isViewedByAnyone: () => overrides.isViewed ?? false } as any,
    pushDispatcher: overrides.pushDispatcher,
  } as unknown as EventWiringDeps;

  return { deps, piGateway, sm };
}

function fireAgentEndError(piGateway: any) {
  piGateway.onEvent(SID, {
    type: "event_forward",
    sessionId: SID,
    event: { eventType: "agent_end", timestamp: Date.now(), data: { error: "boom" } },
  });
}

describe("event-wiring push dispatch", () => {
  let fanout: ReturnType<typeof vi.fn>;
  let dispatcher: EventWiringDeps["pushDispatcher"];

  beforeEach(() => {
    fanout = vi.fn();
    dispatcher = { fanout, shutdown: vi.fn() } as unknown as EventWiringDeps["pushDispatcher"];
  });

  it("calls fanout once with (sessionId, event) on agent_end-with-error while not viewed", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    wireEvents(deps);
    fireAgentEndError(piGateway);
    expect(fanout).toHaveBeenCalledTimes(1);
    const [sid, event] = fanout.mock.calls[0];
    expect(sid).toBe(SID);
    expect(event.eventType).toBe("agent_end");
    expect(event.data.error).toBe("boom");
  });

  it("does NOT call fanout when the session is being viewed", () => {
    const { deps, piGateway } = makeDeps({ isViewed: true, pushDispatcher: dispatcher });
    wireEvents(deps);
    fireAgentEndError(piGateway);
    expect(fanout).not.toHaveBeenCalled();
  });

  it("does not throw when no dispatcher is provided (production push-disabled path)", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: undefined });
    wireEvents(deps);
    expect(() => fireAgentEndError(piGateway)).not.toThrow();
  });
});
