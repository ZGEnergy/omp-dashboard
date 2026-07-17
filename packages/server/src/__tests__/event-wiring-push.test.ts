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
  pushPreferences?: { actionsRequired?: boolean; claudeDecides?: boolean };
}): {
  deps: EventWiringDeps;
  piGateway: any;
  sm: ReturnType<typeof makeSessionManager>;
  broadcastSessionUpdated: ReturnType<typeof vi.fn>;
} {
  const sm = makeSessionManager();
  const broadcastSessionUpdated = vi.fn();
  const piGateway: any = {
    onEvent: undefined,
    onSessionCreated: undefined,
    onSessionRegistered: undefined,
    sendToSession: noop,
    isSessionConnected: () => false,
  };
  const browserGateway: any = {
    broadcastEvent: noop,
    broadcastSessionUpdated,
    broadcastSessionAdded: noop,
    broadcastToAll: noop,
    sendToSubscribers: noop,
    broadcastSessionStateReset: noop,
    broadcastSessionRemoved: noop,
    clearPendingPromptResponses: vi.fn(),
    headlessPidRegistry: {
      linkByToken: () => false,
      linkByPid: () => false,
      linkSession: noop,
    },
    pendingResumeRegistry: { consume: () => undefined },
  };
  const eventStore: any = {
    insertEvent: () => 1,
    getEvent: () => undefined,
    getEvents: () => [],
    hasEvents: () => false,
    deleteEventsForSession: noop,
  };
  const sessionOrderManager: any = {
    getOrder: () => [],
    moveToFront: noop,
    rekey: noop,
    insert: noop,
  };
  const preferencesStore: any = { getPinnedDirectories: () => [] };
  const pendingForkRegistry: any = { consumeFork: () => undefined };
  const directoryService: any = {
    onDirectoryAdded: async () => ({ sessions: [], openspecData: null }),
  };

  const deps = {
    sessionManager: sm as any,
    eventStore,
    piGateway,
    browserGateway,
    pendingForkRegistry,
    directoryService,
    knownSessionIds: new Set<string>(),
    pendingDashboardSpawns: new Map<string, number>(),
    sessionOrderManager,
    preferencesStore,
    isCompletedFirst: () => false,
    isQuestionFirst: () => false,
    viewedSessionTracker: { isViewedByAnyone: () => overrides.isViewed ?? false } as any,
    getPushPreferences: () => ({
      actionsRequired: overrides.pushPreferences?.actionsRequired ?? true,
      claudeDecides: overrides.pushPreferences?.claudeDecides ?? true,
    }),
    pushDispatcher: overrides.pushDispatcher,
  } as unknown as EventWiringDeps;

  return { deps, piGateway, sm, broadcastSessionUpdated };
}

function fireAgentEndError(piGateway: any) {
  piGateway.onEvent(SID, {
    type: "event_forward",
    sessionId: SID,
    event: { eventType: "agent_end", timestamp: Date.now(), data: { error: "boom" } },
  });
}

function fireTurnDone(piGateway: any) {
  piGateway.onEvent(SID, {
    type: "event_forward",
    sessionId: SID,
    event: { eventType: "agent_end", timestamp: Date.now(), data: {} },
  });
}

function fireInputNeeded(piGateway: any, toolName: "ask_user" | "ask") {
  piGateway.onEvent(SID, {
    type: "event_forward",
    sessionId: SID,
    event: {
      eventType: "tool_execution_start",
      timestamp: Date.now(),
      data: { toolName },
    },
  });
}

describe("event-wiring push dispatch", () => {
  let fanout: ReturnType<typeof vi.fn>;
  let dispatcher: EventWiringDeps["pushDispatcher"];

  beforeEach(() => {
    fanout = vi.fn();
    dispatcher = { fanout, shutdown: vi.fn() } as unknown as EventWiringDeps["pushDispatcher"];
  });

  it("clears queued prompt responses when a session unregisters", () => {
    const { deps, sm } = makeDeps({});
    wireEvents(deps);

    (sm.onUnregister as (sessionId: string) => void)(SID);

    expect((deps.browserGateway as any).clearPendingPromptResponses).toHaveBeenCalledWith(SID);
  });

  it("calls fanout once with (sessionId, event) on agent_end-with-error while not viewed and both buckets enabled", () => {
    const { deps, piGateway } = makeDeps({
      isViewed: false,
      pushDispatcher: dispatcher,
      pushPreferences: { actionsRequired: true, claudeDecides: true },
    });
    wireEvents(deps);
    fireAgentEndError(piGateway);
    expect(fanout).toHaveBeenCalledTimes(1);
    const [sid, event] = fanout.mock.calls[0];
    expect(sid).toBe(SID);
    expect(event.eventType).toBe("agent_end");
    expect(event.data.error).toBe("boom");
  });

  it("fans out a turn-done trigger when claude-decides is enabled", () => {
    const { deps, piGateway } = makeDeps({
      isViewed: false,
      pushDispatcher: dispatcher,
      pushPreferences: { actionsRequired: true, claudeDecides: true },
    });
    wireEvents(deps);
    fireTurnDone(piGateway);
    expect(fanout).toHaveBeenCalledTimes(1);
  });

  const preferenceMatrix = [
    ["both buckets enabled", true, true, 1],
    ["actions-required only", true, false, 1],
    ["claude-decides only", false, true, 0],
    ["both buckets disabled", false, false, 0],
  ] as const;

  it.each(preferenceMatrix)(
    "%s applies the actions-required bucket to crash fanout",
    (_label, actionsRequired, claudeDecides, expectedFanout) => {
      const { deps, piGateway, sm, broadcastSessionUpdated } = makeDeps({
        isViewed: false,
        pushDispatcher: dispatcher,
        pushPreferences: { actionsRequired, claudeDecides },
      });
      wireEvents(deps);
      fireAgentEndError(piGateway);
      expect(fanout).toHaveBeenCalledTimes(expectedFanout);
      expect(sm.session.unread).toBe(true);
      expect(broadcastSessionUpdated).toHaveBeenCalledWith(SID, { unread: true });
    },
  );

  it.each(preferenceMatrix)(
    "%s applies the claude-decides bucket to turn-done fanout",
    (_label, actionsRequired, claudeDecides) => {
      const { deps, piGateway, sm, broadcastSessionUpdated } = makeDeps({
        isViewed: false,
        pushDispatcher: dispatcher,
        pushPreferences: { actionsRequired, claudeDecides },
      });
      wireEvents(deps);
      fireTurnDone(piGateway);
      expect(fanout).toHaveBeenCalledTimes(claudeDecides ? 1 : 0);
      expect(sm.session.unread).toBe(true);
      expect(broadcastSessionUpdated).toHaveBeenCalledWith(SID, { unread: true });
    },
  );

  it.each(["ask_user", "ask"] as const)(
    "fans out the %s input-needed trigger in the actions-required bucket",
    (toolName) => {
      const { deps, piGateway, sm, broadcastSessionUpdated } = makeDeps({
        isViewed: false,
        pushDispatcher: dispatcher,
        pushPreferences: { actionsRequired: true, claudeDecides: true },
      });
      wireEvents(deps);
      fireInputNeeded(piGateway, toolName);
      expect(fanout).toHaveBeenCalledTimes(1);
      expect(fanout.mock.calls[0][1]).toMatchObject({
        eventType: "tool_execution_start",
        data: { toolName },
      });
      expect(sm.session.unread).toBe(true);
      expect(broadcastSessionUpdated).toHaveBeenCalledWith(SID, { unread: true });
    },
  );

  it("does not fan out unknown events", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    wireEvents(deps);
    piGateway.onEvent(SID, {
      type: "event_forward",
      sessionId: SID,
      event: { eventType: "message_end", timestamp: Date.now(), data: {} },
    });
    expect(fanout).not.toHaveBeenCalled();
  });

  it("does not fan out trigger events during replay", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    wireEvents(deps);
    piGateway.onEvent(SID, { type: "session_register", sessionId: SID, cwd: "/tmp" });
    fireAgentEndError(piGateway);
    expect(fanout).not.toHaveBeenCalled();
    piGateway.onEvent(SID, { type: "replay_complete", sessionId: SID });
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

  it("keeps the both-on baseline when the live push config is absent", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    deps.getPushPreferences = () => undefined;
    wireEvents(deps);
    fireAgentEndError(piGateway);
    expect(fanout).toHaveBeenCalledTimes(1);
  });

  it("clears a queued prompt response when the bridge acknowledges receipt", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    const clearPromptRequest = vi.fn();
    (deps.browserGateway as any).clearPromptRequest = clearPromptRequest;
    wireEvents(deps);

    piGateway.onEvent(SID, {
      type: "prompt_response_ack",
      sessionId: SID,
      promptId: "prompt-1",
    });

    expect(clearPromptRequest).toHaveBeenCalledWith(SID, "prompt-1");
  });

  it("clears pending PromptBus requests when an ask_user tool ends", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    const clearPromptRequestsForTool = vi.fn(() => ["prompt-1"]);
    const sendToSubscribers = vi.fn();
    (deps.browserGateway as any).clearPromptRequestsForTool = clearPromptRequestsForTool;
    (deps.browserGateway as any).sendToSubscribers = sendToSubscribers;
    wireEvents(deps);

    piGateway.onEvent(SID, {
      type: "event_forward",
      sessionId: SID,
      event: {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: { toolName: "ask_user", toolCallId: "tool-ask-1", result: "yes" },
      },
    });

    expect(clearPromptRequestsForTool).toHaveBeenCalledWith(SID, "tool-ask-1");
    expect(sendToSubscribers).toHaveBeenCalledWith(
      SID,
      expect.objectContaining({ type: "prompt_dismiss", sessionId: SID, promptId: "prompt-1" }),
    );
  });

  it("does not clear pending prompts on non-input-needed tool end", () => {
    const { deps, piGateway } = makeDeps({ isViewed: false, pushDispatcher: dispatcher });
    const clearPromptRequestsForTool = vi.fn(() => ["prompt-1"]);
    (deps.browserGateway as any).clearPromptRequestsForTool = clearPromptRequestsForTool;
    wireEvents(deps);

    piGateway.onEvent(SID, {
      type: "event_forward",
      sessionId: SID,
      event: {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: { toolName: "bash", toolCallId: "tool-bash-1", result: "ok" },
      },
    });

    expect(clearPromptRequestsForTool).not.toHaveBeenCalled();
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
