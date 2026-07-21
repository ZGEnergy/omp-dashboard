import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../persistence/memory-event-store.js"
import { createReplayCoordinator } from "../replay-coordinator.js";

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

describe("replay coordinator wire limits", () => {
  it("delivers only referenced assets, keeps leading frames and every frame under 256 KiB", async () => {
    const store = createMemoryEventStore(() => false);
    const ws = socket();
    const referenced = "A".repeat(100_000);
    const unreferenced = "U".repeat(300_000);
    const event: DashboardEvent = { eventType: "message_end", timestamp: 1, data: { text: "pi-asset:asset-hash" } };
    store.insertEvent("s", event);
    const ctx: any = {
      ws,
      sessionManager: { get: () => ({ assets: { "asset-hash": { data: referenced, mimeType: "image/png" }, "unused-hash": { data: unreferenced, mimeType: "image/png" } } }) },
      eventStore: store,
      piGateway: { sendToSession() {} },
      sendTo: (_w: any, msg: any) => _w.send(JSON.stringify(msg)),
      broadcast() {},
      getSubscribers: () => [ws],
      replayPendingUiRequests() {},
      markReplaying() {},
      clearReplaying() {},
    };
    await createReplayCoordinator({ store }).subscribe({ type: "subscribe", sessionId: "s", requestId: "r", mode: "tail", windowBytes: 256 * 1024 }, ctx);
    const serialized = ws.frames.map((frame: any) => JSON.stringify(frame));
    expect(serialized.every((payload: string) => Buffer.byteLength(payload, "utf8") <= 256 * 1024)).toBe(true);
    const chunks = ws.frames.filter((frame: any) => frame.type === "asset_replay_chunk");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ hash: "asset-hash", data: referenced });
    expect(chunks.some((frame: any) => frame.hash === "unused-hash")).toBe(false);
    expect(ws.frames[0]).toMatchObject({ type: "asset_replay_chunk", hash: "asset-hash", requestId: "r" });
    const eventIndex = ws.frames.findIndex((frame: any) => frame.type === "event_replay" && !frame.isLast);
    const terminalIndex = ws.frames.findIndex((frame: any) => frame.type === "event_replay" && frame.isLast);
    expect(eventIndex).toBeGreaterThan(0);
    expect(terminalIndex).toBeGreaterThan(eventIndex);
    expect(ws.frames[eventIndex].events.map((entry: any) => entry.event.data.text)).toEqual(["pi-asset:asset-hash"]);
    expect(ws.frames[terminalIndex]).toMatchObject({ requestId: "r", replayKind: "cold", events: [], isLast: true, windowMinSeq: 1, windowMaxSeq: 1 });
  });
});
