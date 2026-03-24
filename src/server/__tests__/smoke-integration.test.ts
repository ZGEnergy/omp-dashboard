/**
 * Smoke integration tests — validates end-to-end flows without SQLite.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createServer, type DashboardServer, type ServerConfig } from "../server.js";
import { WebSocket } from "ws";

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.on("open", resolve);
    ws.on("error", reject);
    setTimeout(() => reject(new Error("open timeout")), 3000);
  });
}

function collectMsgs(ws: WebSocket, ms: number): Promise<any[]> {
  return new Promise((resolve) => {
    const arr: any[] = [];
    const h = (raw: any) => arr.push(JSON.parse(raw.toString()));
    ws.on("message", h);
    setTimeout(() => { ws.off("message", h); resolve(arr); }, ms);
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const httpPort = 19070;
const piPort = 19071;
let server: DashboardServer;

describe("Smoke integration", () => {
  afterAll(async () => {
    if (server) await server.stop();
  });

  it("9.2 — events flow and replay from memory on reconnect", async () => {
    server = await createServer({
      port: httpPort, piPort, dev: true,
      autoShutdown: false, shutdownIdleSeconds: 999, tunnel: false,
    });
    await server.start();

    // Bridge connects and registers
    const bridge = new WebSocket(`ws://localhost:${piPort}`);
    await waitForOpen(bridge);
    bridge.send(JSON.stringify({
      type: "session_register", sessionId: "s1", cwd: "/tmp", source: "tui", name: "Test",
    }));
    await delay(150);

    // Browser connects, subscribes, receives event
    const b1 = new WebSocket(`ws://localhost:${httpPort}/ws`);
    await waitForOpen(b1);
    await delay(100); // drain session_added
    b1.send(JSON.stringify({ type: "subscribe", sessionId: "s1", lastSeq: 0 }));
    await delay(50);

    bridge.send(JSON.stringify({
      type: "event_forward", sessionId: "s1",
      event: { eventType: "message_start", timestamp: Date.now(), data: { role: "user" } },
    }));

    const msgs1 = await collectMsgs(b1, 300);
    const liveEvent = msgs1.find((m) => m.type === "event" && m.sessionId === "s1");
    expect(liveEvent).toBeDefined();
    expect(liveEvent.seq).toBe(1);

    // Reconnect browser — should replay from memory
    b1.close();
    await delay(100);

    const b2 = new WebSocket(`ws://localhost:${httpPort}/ws`);
    await waitForOpen(b2);
    await delay(100); // drain session_added
    b2.send(JSON.stringify({ type: "subscribe", sessionId: "s1", lastSeq: 0 }));

    const msgs2 = await collectMsgs(b2, 300);
    const replay = msgs2.find((m) => m.type === "event_replay" && m.sessionId === "s1");
    expect(replay).toBeDefined();
    expect(replay.events.length).toBeGreaterThanOrEqual(1);
    expect(replay.events[0].event.eventType).toBe("message_start");

    b2.close();
    bridge.close();
    await delay(100);
  }, 15000);

  it("9.3 — hide session updates session manager", async () => {
    const bridge = new WebSocket(`ws://localhost:${piPort}`);
    await waitForOpen(bridge);
    bridge.send(JSON.stringify({
      type: "session_register", sessionId: "s3", cwd: "/tmp", source: "tui",
    }));
    await delay(150);

    const browser = new WebSocket(`ws://localhost:${httpPort}/ws`);
    await waitForOpen(browser);
    await delay(100); // drain session_added

    browser.send(JSON.stringify({ type: "hide_session", sessionId: "s3" }));

    const msgs = await collectMsgs(browser, 300);
    const hideUpdate = msgs.find((m) =>
      m.type === "session_updated" && m.sessionId === "s3" && m.updates?.hidden === true
    );
    expect(hideUpdate).toBeDefined();
    expect(server.sessionManager.get("s3")?.hidden).toBe(true);

    browser.close();
    bridge.close();
    await delay(100);
  }, 10000);

  it("9.5 — old session with no bridge shows dataUnavailable", async () => {
    // Use a unique cwd that won't match other sessions
    const bridge = new WebSocket(`ws://localhost:${piPort}`);
    await waitForOpen(bridge);
    bridge.send(JSON.stringify({
      type: "session_register", sessionId: "s5", cwd: "/unique/isolated/path",
      source: "tui", sessionFile: "/unique/old.json",
    }));
    await delay(100);
    bridge.send(JSON.stringify({
      type: "event_forward", sessionId: "s5",
      event: { eventType: "agent_start", timestamp: Date.now(), data: {} },
    }));
    await delay(50);
    bridge.send(JSON.stringify({ type: "session_unregister", sessionId: "s5" }));
    await delay(50);
    bridge.close();
    await delay(200);

    // Simulate eviction
    server.eventStore.deleteEventsForSession("s5");

    // Browser subscribes — should get dataUnavailable
    const browser = new WebSocket(`ws://localhost:${httpPort}/ws`);
    await waitForOpen(browser);
    await delay(200); // drain session_added

    browser.send(JSON.stringify({ type: "subscribe", sessionId: "s5", lastSeq: 0 }));

    const msgs = await collectMsgs(browser, 500);

    const emptyReplay = msgs.find((m) => m.type === "event_replay" && m.sessionId === "s5");
    expect(emptyReplay).toBeDefined();
    expect(emptyReplay.events).toHaveLength(0);
    expect(emptyReplay.isLast).toBe(true);

    const unavail = msgs.find((m) =>
      m.type === "session_updated" && m.sessionId === "s5" && m.updates?.dataUnavailable === true
    );
    expect(unavail).toBeDefined();

    browser.close();
    await delay(50);
  }, 15000);
});
