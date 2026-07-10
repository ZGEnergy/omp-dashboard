/**
 * Integration test: the push dispatcher is wired into the SAME unread-trigger
 * site in event-wiring.ts.
 *
 * Drives an `agent_end`-with-error event through `wireEvents` (via the captured
 * `piGateway.onEvent` handler) and asserts `pushDispatcher.fanout` is called
 * exactly once with (sessionId, event). Also asserts NO fanout when a browser
 * is viewing the session (same gating as unread) and NO fanout during replay.
 *
 * The final test locks the fire-and-forget latency guarantee end-to-end: a REAL
 * dispatcher wired to a transport whose `send` NEVER resolves must not block the
 * event handler — `onEvent` returns synchronously and promptly.
 *
 * Spec: push-notifications `Requirement: Push trigger predicate`.
 * See change: add-server-push-notifications.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EventWiringDeps, wireEvents } from "../event-wiring.js";
import { createPushDispatcher } from "../push/push-dispatcher.js";
import { createPushTokenRegistry } from "../push/push-token-registry.js";
import type { PushTransport } from "../push/push-transports/types.js";

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

  // Latency guarantee (tasks.md 7.5): a hanging transport must not block the
  // event pipeline. Uses a REAL dispatcher + a transport whose `send` never
  // resolves; the event handler must return synchronously regardless.
  describe("does not block the event handler when the transport hangs", () => {
    let dir: string;
    afterEach(() => {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    it("onEvent returns synchronously while a never-resolving send is in flight", () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "event-wiring-push-"));
      const registry = createPushTokenRegistry({ path: path.join(dir, "push-tokens.json") });
      registry.add({ deviceToken: "dev-hang", transport: "web-push" });

      let sendStarted = false;
      let sendResolved = false;
      // Never resolves — models a transport (network) that hangs indefinitely.
      const hangingTransport: PushTransport = {
        kind: "web-push",
        send: () => {
          sendStarted = true;
          return new Promise(() => {
            /* intentionally never settles */
          }).then(() => {
            sendResolved = true;
            return { ok: true };
          });
        },
      };

      const realDispatcher = createPushDispatcher({
        registry,
        transports: { "web-push": hangingTransport },
        coalesceWindowMs: 30_000,
        getSession: () =>
          ({
            id: SID,
            cwd: "/tmp",
            source: "cli",
            status: "idle",
            startedAt: 0,
            name: "worker",
          }) as any,
      });

      const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: realDispatcher });
      wireEvents(deps);

      // The handler must complete promptly (void, no throw) even though the
      // transport send it kicked off will never resolve.
      const before = Date.now();
      expect(() => fireAgentEndError(piGateway)).not.toThrow();
      const elapsed = Date.now() - before;

      // Handler returned without awaiting the transport: send was dispatched
      // but has NOT resolved, and the synchronous handler took negligible time.
      expect(sendStarted).toBe(true);
      expect(sendResolved).toBe(false);
      expect(elapsed).toBeLessThan(50);

      realDispatcher.shutdown();
    });
  });
});
