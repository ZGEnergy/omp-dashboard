/**
 * Tests for WS-level ping/pong dead connection detection in pi-gateway.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createPiGateway } from "../pi-gateway.js";
import { createMemorySessionManager } from "../memory-session-manager.js";
import { WebSocket } from "ws";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.on("open", resolve);
    ws.on("error", reject);
    setTimeout(() => reject(new Error("open timeout")), 3000);
  });
}

// Short intervals for fast tests
const SHORT_PING = 200; // 200ms ping interval
const SHORT_HB = 5000; // long heartbeat so it doesn't interfere
let portCounter = 19500;

describe("WS ping/pong", () => {
  let gateway: ReturnType<typeof createPiGateway>;

  afterEach(() => {
    gateway?.stop();
  });

  it("should keep session alive when client responds to pings", async () => {
    const sessionManager = createMemorySessionManager();
    gateway = createPiGateway(sessionManager, {
      heartbeatTimeout: SHORT_HB,
      pingInterval: SHORT_PING,
    });
    const port = portCounter++;
    gateway.start(port);

    // ws library auto-responds to pings with pong
    const ws = new WebSocket(`ws://localhost:${port}`);
    await waitForOpen(ws);
    ws.send(JSON.stringify({
      type: "session_register", sessionId: "ping-alive", cwd: "/tmp", source: "tui",
    }));
    await delay(100);

    // Wait for several ping cycles — session should stay alive
    await delay(SHORT_PING * 4);

    expect(sessionManager.get("ping-alive")!.status).toBe("active");
    ws.close();
  }, 10000);

  it("should terminate connection when client stops responding to pings", async () => {
    const sessionManager = createMemorySessionManager();
    gateway = createPiGateway(sessionManager, {
      heartbeatTimeout: SHORT_HB,
      pingInterval: SHORT_PING,
    });
    const port = portCounter++;
    gateway.start(port);

    const ws = new WebSocket(`ws://localhost:${port}`);
    await waitForOpen(ws);
    ws.send(JSON.stringify({
      type: "session_register", sessionId: "ping-dead", cwd: "/tmp", source: "tui",
    }));
    await delay(100);
    expect(sessionManager.get("ping-dead")!.status).toBe("active");

    // Disable pong responses by removing the pong handler and overriding
    // The ws library auto-responds at the protocol level, so we need to
    // break the connection at a lower level — pause the socket
    (ws as any)._socket?.pause();

    // Wait for ping cycle to detect the dead connection
    // First ping sets isAlive=false, second ping sees isAlive=false → terminate
    await delay(SHORT_PING * 3);

    expect(sessionManager.get("ping-dead")!.status).toBe("ended");
  }, 10000);

  it("should call onEmpty after ping timeout terminates last connection", async () => {
    const sessionManager = createMemorySessionManager();
    gateway = createPiGateway(sessionManager, {
      heartbeatTimeout: SHORT_HB,
      pingInterval: SHORT_PING,
    });
    const port = portCounter++;
    gateway.start(port);

    let emptyCalled = false;
    gateway.onEmpty = () => { emptyCalled = true; };

    const ws = new WebSocket(`ws://localhost:${port}`);
    await waitForOpen(ws);
    ws.send(JSON.stringify({
      type: "session_register", sessionId: "ping-empty", cwd: "/tmp", source: "tui",
    }));
    await delay(100);

    // Pause socket to prevent pong responses
    (ws as any)._socket?.pause();

    // Wait for ping timeout
    await delay(SHORT_PING * 3);

    expect(emptyCalled).toBe(true);
  }, 10000);
});
