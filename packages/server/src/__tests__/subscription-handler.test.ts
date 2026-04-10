import { describe, it, expect, vi } from "vitest";
import { handleSubscribe } from "../browser-handlers/subscription-handler.js";
import { createMemoryEventStore } from "../memory-event-store.js";
import { createMemorySessionManager } from "../memory-session-manager.js";
import type { BrowserHandlerContext } from "../browser-handlers/handler-context.js";
import type { ServerToBrowserMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function makeEvent(type: string = "test"): DashboardEvent {
  return { eventType: type, timestamp: Date.now(), data: {} };
}

function createMockContext(overrides: Partial<BrowserHandlerContext> = {}): BrowserHandlerContext {
  return {
    ws: { readyState: 1, OPEN: 1, bufferedAmount: 0 } as any,
    sessionManager: createMemorySessionManager(),
    eventStore: createMemoryEventStore(() => false),
    piGateway: { sendToSession: vi.fn() } as any,
    headlessPidRegistry: {} as any,
    pendingResumeRegistry: {} as any,
    sendTo: vi.fn(),
    broadcast: vi.fn(),
    getSubscribers: () => [],
    trackUiRequest: vi.fn(),
    replayPendingUiRequests: vi.fn(),
    markReplaying: vi.fn(),
    clearReplaying: vi.fn(),
    ...overrides,
  };
}

describe("handleSubscribe — metadata requests on subscribe", () => {
  it("sends request_commands, request_models, and request_roles to piGateway", () => {
    const ctx = createMockContext();
    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1" }, subs, ctx);

    const calls = (ctx.piGateway.sendToSession as any).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual(["s1", { type: "request_commands", sessionId: "s1" }]);
    expect(calls[1]).toEqual(["s1", { type: "request_models", sessionId: "s1" }]);
    expect(calls[2]).toEqual(["s1", { type: "request_roles", sessionId: "s1" }]);
  });
});

describe("handleSubscribe — stale lastSeq detection", () => {
  it("replays delta when lastSeq is within server range", async () => {
    const ctx = createMockContext();
    // Insert 5 events
    for (let i = 0; i < 5; i++) ctx.eventStore.insertEvent("s1", makeEvent(`e${i}`));

    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1", lastSeq: 3 }, subs, ctx);

    // Wait for async replay
    await new Promise((r) => setTimeout(r, 50));

    const calls = (ctx.sendTo as any).mock.calls as Array<[any, ServerToBrowserMessage]>;
    // Should NOT have sent session_state_reset
    const resets = calls.filter(([, msg]) => msg.type === "session_state_reset");
    expect(resets).toHaveLength(0);

    // Should have replayed only events 4 and 5
    const replays = calls.filter(([, msg]) => msg.type === "event_replay");
    expect(replays.length).toBeGreaterThanOrEqual(1);
    const allEvents = replays.flatMap(([, msg]: any) => msg.events);
    expect(allEvents).toHaveLength(2);
    expect(allEvents[0].seq).toBe(4);
    expect(allEvents[1].seq).toBe(5);
  });

  it("sends session_state_reset and full replay when lastSeq > server maxSeq", async () => {
    const ctx = createMockContext();
    // Insert 3 events (maxSeq = 3)
    for (let i = 0; i < 3; i++) ctx.eventStore.insertEvent("s1", makeEvent(`e${i}`));

    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1", lastSeq: 100 }, subs, ctx);

    // Wait for async replay
    await new Promise((r) => setTimeout(r, 50));

    const calls = (ctx.sendTo as any).mock.calls as Array<[any, ServerToBrowserMessage]>;
    // Should have sent session_state_reset first
    const resets = calls.filter(([, msg]) => msg.type === "session_state_reset");
    expect(resets).toHaveLength(1);

    // Should have replayed ALL events from seq 1
    const replays = calls.filter(([, msg]) => msg.type === "event_replay");
    const allEvents = replays.flatMap(([, msg]: any) => msg.events);
    expect(allEvents).toHaveLength(3);
    expect(allEvents[0].seq).toBe(1);
  });

  it("marks replaying during delta replay and clears after", async () => {
    const markReplaying = vi.fn();
    const clearReplaying = vi.fn();
    const ctx = createMockContext({ markReplaying, clearReplaying });
    for (let i = 0; i < 5; i++) ctx.eventStore.insertEvent("s1", makeEvent());

    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1", lastSeq: 3 }, subs, ctx);

    await new Promise((r) => setTimeout(r, 50));

    expect(markReplaying).toHaveBeenCalledWith(ctx.ws, "s1");
    expect(clearReplaying).toHaveBeenCalledWith(ctx.ws, "s1", 5); // lastSent = 5
  });

  it("does not mark replaying for fresh subscribe (lastSeq: 0)", async () => {
    const markReplaying = vi.fn();
    const ctx = createMockContext({ markReplaying });
    for (let i = 0; i < 3; i++) ctx.eventStore.insertEvent("s1", makeEvent());

    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1", lastSeq: 0 }, subs, ctx);

    await new Promise((r) => setTimeout(r, 50));

    expect(markReplaying).not.toHaveBeenCalled();
  });

  it("marks replaying during stale lastSeq full replay", async () => {
    const markReplaying = vi.fn();
    const clearReplaying = vi.fn();
    const ctx = createMockContext({ markReplaying, clearReplaying });
    for (let i = 0; i < 3; i++) ctx.eventStore.insertEvent("s1", makeEvent());

    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1", lastSeq: 100 }, subs, ctx);

    await new Promise((r) => setTimeout(r, 50));

    expect(markReplaying).toHaveBeenCalledWith(ctx.ws, "s1");
    expect(clearReplaying).toHaveBeenCalledWith(ctx.ws, "s1", 3);
  });

  it("does full replay when lastSeq is 0", async () => {
    const ctx = createMockContext();
    for (let i = 0; i < 3; i++) ctx.eventStore.insertEvent("s1", makeEvent());

    const subs = new Set<string>();
    handleSubscribe({ type: "subscribe", sessionId: "s1", lastSeq: 0 }, subs, ctx);

    await new Promise((r) => setTimeout(r, 50));

    const calls = (ctx.sendTo as any).mock.calls as Array<[any, ServerToBrowserMessage]>;
    const resets = calls.filter(([, msg]) => msg.type === "session_state_reset");
    expect(resets).toHaveLength(0); // No reset needed for fresh subscribe

    const replays = calls.filter(([, msg]) => msg.type === "event_replay");
    const allEvents = replays.flatMap(([, msg]: any) => msg.events);
    expect(allEvents).toHaveLength(3);
  });
});
