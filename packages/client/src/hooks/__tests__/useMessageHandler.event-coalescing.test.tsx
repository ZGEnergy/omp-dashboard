/**
 * Phase 3 (change: reduce-chat-render-cpu-umbrella): render-count probe.
 *
 * A burst of N live `event` messages arriving before the next animation frame
 * MUST produce at most ONE `setSessionStates` application (⇒ one ChatView
 * render), not N. Per-event side effects (seq tracking, replay buffer, plugin
 * mirror) stay synchronous — verified elsewhere; here we assert the state
 * setter is coalesced onto the rAF flush.
 */

import type { ServerToBrowserMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MessageHandlerSetters, useMessageHandler } from "../useMessageHandler.js";

function liveEvent(sessionId: string, seq: number): Extract<ServerToBrowserMessage, { type: "event" }> {
  return {
    type: "event",
    sessionId,
    seq,
    event: { sessionId, eventType: "message_update", timestamp: seq, data: { assistantMessageEvent: { type: "text_delta", delta: `x${seq}` } } } as unknown as DashboardEvent,
  };
}

describe("useMessageHandler — live-event coalescing (render-count probe)", () => {
  let rafCallbacks: FrameRequestCallback[];
  let setSessionStates: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rafCallbacks = [];
    // Capture rAF callbacks instead of running them, so we control the "frame".
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    setSessionStates = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  function makeHandler() {
    const { result } = renderHook(() => {
      const setters = new Proxy({ setSessionStates }, {
        get: (target, prop) => (prop === "setSessionStates" ? setSessionStates : vi.fn()),
      }) as unknown as MessageHandlerSetters;
      const deps: any = {
        send: vi.fn(), navigate: vi.fn(), clearSpawningCwd: vi.fn(),
        spawningCwdsRef: useRef(new Set<string>()), subscribedRef: useRef(new Set<string>()),
        pendingTerminalCwdRef: useRef(null), lastCreatedTerminalIdRef: useRef(null),
        maxSeqMapRef: useRef(new Map<string, number>()), selectedSessionIdRef: useRef(undefined),
        pendingSpawnsRef: useRef(new Map()), loadingHistoryTimersRef: useRef(new Map()),
        replayPersister: undefined,
      };
      return useMessageHandler(setters, deps);
    });
    return result.current;
  }

  it("a 200-event burst produces zero state applications before the frame, one after", () => {
    const handle = makeHandler();
    for (let seq = 1; seq <= 200; seq++) handle(liveEvent("s1", seq));

    // Nothing applied yet — all 200 events are queued for the next frame.
    expect(setSessionStates).toHaveBeenCalledTimes(0);
    // Exactly one rAF scheduled for the whole burst.
    expect(rafCallbacks).toHaveLength(1);

    // Fire the frame.
    for (const cb of rafCallbacks.splice(0)) cb(performance.now());

    // One state application for the entire burst ⇒ at most one render.
    expect(setSessionStates).toHaveBeenCalledTimes(1);
  });

  it("bursts across two frames apply once per frame", () => {
    const handle = makeHandler();
    handle(liveEvent("s1", 1));
    handle(liveEvent("s1", 2));
    for (const cb of rafCallbacks.splice(0)) cb(performance.now());
    expect(setSessionStates).toHaveBeenCalledTimes(1);

    handle(liveEvent("s1", 3));
    handle(liveEvent("s1", 4));
    for (const cb of rafCallbacks.splice(0)) cb(performance.now());
    expect(setSessionStates).toHaveBeenCalledTimes(2);
  });
});
