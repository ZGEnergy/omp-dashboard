import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../memory-event-store.js";
import { createReplayCoordinator } from "../replay-coordinator.js";

function event(label: string): DashboardEvent {
  return { eventType: "message_end", timestamp: 1, data: { label } };
}

function socket() {
  const frames: any[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    bufferedAmount: 0,
    frames,
    send(payload: string) { frames.push(JSON.parse(payload)); },
    close() { this.readyState = 3; },
  } as any;
}

describe("replay coordinator", () => {
  it("shares hydration but gives concurrent requests independent correlated terminals", async () => {
    const store = createMemoryEventStore(() => false);
    const wsA = socket();
    const wsB = socket();
    let resolveLoad!: (value: any) => void;
    let loads = 0;
    const sessionManager: any = { get: () => ({ sessionFile: "/tmp/session.jsonl" }), update() {} };
    const directoryService: any = {
      loadSessionEvents: () => {
        loads += 1;
        return new Promise((resolve) => { resolveLoad = resolve; });
      },
    };
    const coordinator = createReplayCoordinator({ store, directoryService });
    const ctx = (ws: any) => ({
      ws,
      sessionManager,
      eventStore: store,
      piGateway: { sendToSession() {} },
      sendTo(_ws: any, msg: any) { _ws.send(JSON.stringify(msg)); },
      broadcast() {},
      getSubscribers: () => [wsA, wsB],
      replayPendingUiRequests() {},
      markReplaying() {},
      clearReplaying() {},
    });
    const a = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "a", mode: "tail", windowBytes: 262144 }, ctx(wsA) as any);
    const b = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "b", fromSeq: 99, windowBytes: 262144 }, ctx(wsB) as any);
    expect(loads).toBe(1);
    resolveLoad({ success: true, events: [event("one"), event("two")] });
    await Promise.all([a, b]);
    const generation = store.getSourceGeneration("s");
    const aReplay = wsA.frames.filter((frame: any) => frame.type === "event_replay");
    const bReplay = wsB.frames.filter((frame: any) => frame.type === "event_replay");
    expect(aReplay.flatMap((frame: any) => frame.events.map((entry: any) => entry.event.data.label))).toEqual(["one", "two"]);
    expect(aReplay).toHaveLength(2);
    expect(aReplay.filter((frame: any) => frame.isLast)).toHaveLength(1);
    expect(aReplay.every((frame: any) => frame.requestId === "a")).toBe(true);
    expect(aReplay.at(-1)).toEqual({ type: "event_replay", sessionId: "s", requestId: "a", sourceGeneration: generation, replayKind: "cold", events: [], isLast: true, windowMinSeq: 1, windowMaxSeq: 2, retainedMinSeq: 1, hasMoreOlder: false, partialHead: true, historyTruncated: false });
    expect(bReplay).toHaveLength(2);
    expect(bReplay[0].isLast).toBe(false);
    expect(bReplay.every((frame: any) => frame.requestId === "b")).toBe(true);
    expect(bReplay.flatMap((frame: any) => frame.events.map((entry: any) => entry.event.data.label))).toEqual(["one", "two"]);
    expect(bReplay.at(-1)).toEqual({ type: "event_replay", sessionId: "s", requestId: "b", sourceGeneration: generation, replayKind: "older", events: [], isLast: true, windowMinSeq: 1, windowMaxSeq: 2, retainedMinSeq: 1, hasMoreOlder: false, partialHead: true, historyTruncated: false });
    expect(wsA.frames).toHaveLength(2);
    expect(wsB.frames).toHaveLength(2);
  });

  it("delivers a live event once across the replay barrier", async () => {
    const store = createMemoryEventStore(() => false);
    store.insertEvent("s", event("one"));
    const ws = socket();
    const coordinator = createReplayCoordinator({ store });
    const ctx: any = {
      ws, sessionManager: { get: () => undefined }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    const pending = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "r", lastSeq: 0 }, ctx);
    const live = event("live");
    const liveSeq = store.insertEvent("s", live);
    coordinator.publishLive("s", { seq: liveSeq, event: live });
    await pending;
    const seqs = ws.frames.flatMap((m: any) => m.type === "event_replay" ? m.events.map((e: any) => e.seq) : m.type === "event" ? [m.seq] : []);
    expect(seqs.filter((seq: number) => seq === 2)).toHaveLength(1);
    const terminalIndex = ws.frames.findIndex((frame: any) => frame.type === "event_replay" && frame.requestId === "r" && frame.isLast);
    const replayLiveIndex = ws.frames.findIndex((frame: any) => frame.type === "event_replay" && frame.events.some((entry: any) => entry.seq === 2));
    const rawLiveIndex = ws.frames.findIndex((frame: any) => frame.type === "event" && frame.seq === 2);
    expect(terminalIndex).toBeGreaterThanOrEqual(0);
    if (replayLiveIndex >= 0) expect(replayLiveIndex).toBeLessThan(terminalIndex);
    if (rawLiveIndex >= 0) expect(rawLiveIndex).toBeGreaterThan(terminalIndex);
  });

  it("fails and closes on byte overflow below the event cap after attempting serialized sends", async () => {
    const store = createMemoryEventStore(() => false);
    store.insertEvent("s", event("one"));
    const ws = socket();
    const attempted: string[] = [];
    let release!: () => void;
    let started = false;
    const hugeEvent = (): DashboardEvent => ({ eventType: "message_end", timestamp: 1, data: { image: { type: "image", mimeType: "image/png", data: "A".repeat(1_100_000) } } } as any);
    const send = async (target: any, msg: any) => {
      const payload = JSON.stringify(msg);
      attempted.push(payload);
      if (!started) {
        started = true;
        await new Promise<void>((resolve) => { release = resolve; });
      }
      if (target.readyState === 1) target.send(payload);
      return true;
    };
    let closed: [number, string | undefined] | undefined;
    const coordinator = createReplayCoordinator({ store, send, close: (_target, code, reason) => { closed = [code, reason]; ws.readyState = 3; } });
    const ctx: any = {
      ws, sessionManager: { get: () => undefined }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    const pending = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "overflow", lastSeq: 0 }, ctx);
    await Promise.resolve();
    coordinator.publishLive("s", { seq: 2, event: hugeEvent() } as any);
    coordinator.publishLive("s", { seq: 3, event: hugeEvent() } as any);
    expect(closed).toEqual([1013, "replay delivery queue overflow"]);
    expect(attempted.length).toBeGreaterThan(0);
    expect(attempted.every((payload) => typeof payload === "string" && JSON.parse(payload).type)).toBe(true);
    release();
    await pending;
  });


  it("fails a superseded correlation while its replacement succeeds", async () => {
    const store = createMemoryEventStore(() => false);
    const ws = socket();
    let resolveLoad!: (value: any) => void;
    const coordinator = createReplayCoordinator({
      store,
      directoryService: { loadSessionEvents: () => new Promise((resolve) => { resolveLoad = resolve; }) } as any,
    });
    const ctx: any = {
      ws, sessionManager: { get: () => ({ sessionFile: "/tmp/session.jsonl" }), update() {} }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    const first = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "same", lastSeq: 0 }, ctx);
    const second = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "same", lastSeq: 0 }, ctx);
    resolveLoad({ success: true, events: [event("one")] });
    await Promise.all([first, second]);
    const terminals = ws.frames.filter((frame: any) => frame.type === "event_replay" && frame.isLast);
    expect(terminals).toHaveLength(2);
    expect(terminals[0]).toMatchObject({ requestId: "same", replayKind: "cold", errorCode: "delivery_failed", events: [], isLast: true });
    expect(terminals[1]).toMatchObject({ requestId: "same", replayKind: "cold", events: [], isLast: true });
    expect(terminals[1]).not.toHaveProperty("errorCode");
    expect(ws.frames.filter((frame: any) => frame.type === "event_replay" && frame.requestId === "same" && !frame.isLast).flatMap((frame: any) => frame.events.map((entry: any) => entry.event.data.label))).toEqual(["one"]);
  });

  it("resets a retention-gap delta before cold-delivering the retained suffix", async () => {
    const store = createMemoryEventStore(() => false, 10, 1);
    store.insertEvent("s", event("old-one"));
    store.insertEvent("s", event("old-two"));
    store.insertEvent("s", event("current"));
    const ws = socket();
    const coordinator = createReplayCoordinator({ store });
    const ctx: any = {
      ws, sessionManager: { get: () => undefined }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "gap", lastSeq: 1, knownSourceGeneration: store.getSourceGeneration("s") }, ctx);
    const replay = ws.frames.filter((frame: any) => frame.type === "event_replay");
    expect(ws.frames[0]).toMatchObject({ type: "session_state_reset", requestId: "gap", reason: "retention_gap", sourceGeneration: store.getSourceGeneration("s") });
    expect(replay.flatMap((frame: any) => frame.events.map((entry: any) => [entry.seq, entry.event.data.label]))).toEqual([[3, "current"]]);
    expect(replay).toHaveLength(2);
    expect(replay.at(-1)).toMatchObject({ requestId: "gap", replayKind: "cold", isLast: true, windowMinSeq: 3, windowMaxSeq: 3, retainedMinSeq: 3, historyTruncated: true });
  });

  it("rejects an older cursor from a stale source generation", async () => {
    const store = createMemoryEventStore(() => false);
    store.insertEvent("s", event("one"));
    store.insertEvent("s", event("two"));
    const ws = socket();
    const coordinator = createReplayCoordinator({ store });
    const ctx: any = {
      ws, sessionManager: { get: () => undefined }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    const generation = store.getSourceGeneration("s");
    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "older", fromSeq: 3, knownSourceGeneration: "stale" }, ctx);
    expect(ws.frames.map((frame: any) => frame.type)).toEqual(["session_state_reset", "event_replay", "event_replay"]);
    expect(ws.frames[0]).toEqual({ type: "session_state_reset", sessionId: "s", requestId: "older", sourceGeneration: generation, reason: "source_generation_mismatch" });
    const replay = ws.frames.filter((frame: any) => frame.type === "event_replay");
    expect(replay.filter((frame: any) => frame.replayKind === "older")).toEqual([]);
    expect(replay[0].events.map((entry: any) => [entry.seq, entry.event.data.label])).toEqual([[1, "one"], [2, "two"]]);
    expect(replay.at(-1)).toEqual({ type: "event_replay", sessionId: "s", requestId: "older", sourceGeneration: generation, replayKind: "cold", events: [], isLast: true, windowMinSeq: 1, windowMaxSeq: 2, retainedMinSeq: 1, hasMoreOlder: false, partialHead: false, historyTruncated: false });
  });

  it("enforces queue limits for replay frames, not just suppressed live events", async () => {
    const store = createMemoryEventStore(() => false);
    for (let seq = 0; seq < 300; seq += 1) store.insertEvent("s", event(String(seq)));
    const ws = socket();
    let release!: () => void;
    const send = async () => new Promise<boolean>((resolve) => { release = () => resolve(true); });
    let closed: number | undefined;
    const coordinator = createReplayCoordinator({ store, send, close: (_target, code) => { closed = code; ws.readyState = 3; } });
    const ctx: any = {
      ws, sessionManager: { get: () => undefined }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo() {}, broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    const pending = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "queue", lastSeq: 0 }, ctx);
    await Promise.resolve();
    expect(closed).toBe(1013);
    release();
    await pending;
  });

  it("arms every bridge subscriber before awaiting replay delivery", async () => {
    const store = createMemoryEventStore(() => false);
    store.insertEvent("s", event("snapshot"));
    const first = socket();
    const second = socket();
    let release!: () => void;
    let sends = 0;
    const coordinator = createReplayCoordinator({
      store,
      send: async (ws: any, message: any) => {
        sends += 1;
        if (sends === 1) await new Promise<void>((resolve) => { release = resolve; });
        ws.send(JSON.stringify(message));
        return true;
      },
    });
    const replay = coordinator.completeBridgeReplay("s", () => [first, second], (target: any) => target.frames.push({ type: "ui_state" }));
    await Promise.resolve();
    const live = event("live");
    const liveSeq = store.insertEvent("s", live);
    coordinator.publishLive("s", { seq: liveSeq, event: live });
    expect(second.frames.filter((frame: any) => frame.type === "event")).toEqual([]);
    release();
    await replay;
    for (const target of [first, second]) {
      const terminalIndex = target.frames.findIndex((frame: any) => frame.type === "event_replay" && frame.isLast);
      const liveIndex = target.frames.findIndex((frame: any) => frame.type === "event" && frame.seq === 2);
      const uiStateIndex = target.frames.findIndex((frame: any) => frame.type === "ui_state");
      expect(terminalIndex).toBeGreaterThanOrEqual(0);
      expect(liveIndex).toBeGreaterThan(terminalIndex);
      expect(uiStateIndex).toBeGreaterThan(liveIndex);
      expect(target.frames.filter((frame: any) => frame.type === "event_replay" && frame.isLast)).toHaveLength(1);
    }
  });


  it("reserves aggregate budget for events before admitting referenced asset chunks", async () => {
    const store = createMemoryEventStore(() => false, 10, 20_000, 200 * 1024, 300 * 1024);
    const text = `pi-asset:chart ${"x".repeat(100 * 1024)}`;
    store.insertEvent("s", { eventType: "message_end", timestamp: 1, data: { text } } as any);
    const ws = socket();
    const coordinator = createReplayCoordinator({ store, sessionManager: { get: () => ({ assets: { chart: { mimeType: "image/png", data: "a".repeat(250 * 1024) } } }) } as any });
    const ctx: any = {
      ws, sessionManager: { get: () => ({ assets: { chart: { mimeType: "image/png", data: "a".repeat(250 * 1024) } } }) }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "asset", lastSeq: 0, windowBytes: 256 * 1024 }, ctx);
    const replayEvents = ws.frames.filter((frame: any) => frame.type === "event_replay" && !frame.isLast).flatMap((frame: any) => frame.events);
    expect(replayEvents.map((entry: any) => entry.seq)).toEqual([1]);
    expect(ws.frames.some((frame: any) => frame.type === "asset_replay_chunk")).toBe(false);
    expect(ws.frames).toContainEqual(expect.objectContaining({ type: "asset_unavailable", hash: "chart", reason: "budget_exceeded" }));
    expect(ws.frames.filter((frame: any) => frame.type === "event_replay" && frame.isLast).at(-1)).toMatchObject({ windowMinSeq: 1, windowMaxSeq: 1 });
  });


  it("registers selected raw inline images before correlated asset delivery", async () => {
    const store = createMemoryEventStore(() => false);
    store.insertEvent("s", { eventType: "message_end", timestamp: 1, data: { images: [{ type: "image", mimeType: "image/png", data: "inline-image-data" }] } } as any);
    const session: any = { assets: {} };
    const manager: any = { get: () => session, update: (_id: string, patch: any) => Object.assign(session, patch) };
    const ws = socket();
    const coordinator = createReplayCoordinator({ store, sessionManager: manager });
    const ctx: any = {
      ws, sessionManager: manager, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    };
    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "inline", mode: "tail", windowBytes: 256 * 1024 }, ctx);
    const chunkIndex = ws.frames.findIndex((frame: any) => frame.type === "asset_replay_chunk");
    const chunk = ws.frames[chunkIndex];
    const eventIndex = ws.frames.findIndex((frame: any) => frame.type === "event_replay" && !frame.isLast);
    const terminalIndex = ws.frames.findIndex((frame: any) => frame.type === "event_replay" && frame.isLast);
    expect(chunk).toMatchObject({ sessionId: "s", requestId: "inline", mimeType: "image/png", data: "inline-image-data" });
    expect(eventIndex).toBeGreaterThan(chunkIndex);
    expect(terminalIndex).toBeGreaterThan(eventIndex);
    const replayEntry = ws.frames[eventIndex].events[0];
    expect(replayEntry.event.data.images).toEqual([{ type: "asset", hash: chunk.hash, mimeType: "image/png", src: `pi-asset:${chunk.hash}` }]);
    expect(ws.frames[terminalIndex]).toMatchObject({ requestId: "inline", replayKind: "cold", isLast: true, windowMinSeq: 1, windowMaxSeq: 1 });
    expect(Object.values(session.assets)).toContainEqual({ mimeType: "image/png", data: "inline-image-data" });
  });


  it("cancels one socket without silencing a control subscriber", async () => {
    const store = createMemoryEventStore(() => false);
    const ws = socket();
    const control = socket();
    let resolveLoad!: (value: any) => void;
    const coordinator = createReplayCoordinator({ store, directoryService: { loadSessionEvents: () => new Promise((resolve) => { resolveLoad = resolve; }) } as any });
    const context = (target: any): any => ({
      ws: target, sessionManager: { get: () => ({ sessionFile: "/tmp/session.jsonl" }), update() {} }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws, control], replayPendingUiRequests() {}, markReplaying() {}, clearReplaying() {},
    });
    const pending = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "cancel", lastSeq: 0 }, context(ws));
    const controlPending = coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "control", lastSeq: 0 }, context(control));
    coordinator.unsubscribe(ws, "s");
    resolveLoad({ success: true, events: [event("one")] });
    await Promise.all([pending, controlPending]);
    coordinator.publishLive("s", { seq: 2, event: event("later") });
    await Promise.resolve();
    await Promise.resolve();
    expect(ws.frames).toEqual([]);
    expect(control.frames.filter((frame: any) => frame.type === "event_replay" && frame.isLast)).toHaveLength(1);
    expect(control.frames).toContainEqual(expect.objectContaining({ type: "event", sessionId: "s", seq: 2, event: event("later") }));
  });


  it("replays cached UI state only after its correlated terminal", async () => {
    const store = createMemoryEventStore(() => false);
    store.insertEvent("s", event("one"));
    const ws = socket();
    const coordinator = createReplayCoordinator({ store });
    const ctx: any = {
      ws, sessionManager: { get: () => undefined }, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, replayUiState: (_ws: any) => ws.frames.push({ type: "ui_state" }), markReplaying() {}, clearReplaying() {},
    };
    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "ui", lastSeq: 0 }, ctx);
    expect(ws.frames.at(-2)).toMatchObject({ type: "event_replay", requestId: "ui", isLast: true });
    expect(ws.frames.at(-1)).toEqual({ type: "ui_state" });
  });


  it("does not persist inline assets from events excluded before final replay planning", async () => {
    const store = createMemoryEventStore(() => false);
    for (let seq = 1; seq <= 100; seq += 1) store.insertEvent("s", { eventType: "message_end", timestamp: seq, data: { text: "x".repeat(3 * 1024) } } as any);
    store.insertEvent("s", { eventType: "message_end", timestamp: 101, data: { images: [{ type: "image", mimeType: "image/png", data: "excluded-inline-image" }] } } as any);
    const session: any = { assets: {} };
    const manager: any = { get: () => session, update: (_id: string, patch: any) => Object.assign(session, patch) };
    const ws = socket();
    const coordinator = createReplayCoordinator({ store, sessionManager: manager });
    const ctx: any = {
      ws, sessionManager: manager, eventStore: store,
      piGateway: { sendToSession() {} }, sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {}, getSubscribers: () => [ws], replayPendingUiRequests() {}, replayUiState() {}, markReplaying() {}, clearReplaying() {},
    };
    await coordinator.subscribe({ type: "subscribe", sessionId: "s", requestId: "excluded", mode: "full", windowBytes: 256 * 1024 }, ctx);
    const replaySeqs = ws.frames.filter((frame: any) => frame.type === "event_replay").flatMap((frame: any) => frame.events.map((entry: any) => entry.seq));
    expect(replaySeqs).not.toContain(101);
    expect(Object.keys(session.assets)).toHaveLength(0);
  });

});
