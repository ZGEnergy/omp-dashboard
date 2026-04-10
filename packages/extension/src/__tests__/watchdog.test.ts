import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../connection.js";

// Mock WebSocket (same pattern as connection.test.ts)
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sentMessages: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }
}

describe("ConnectionManager watchdog", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  it("should force-close when no messages received for watchdogTimeout", () => {
    const cm = new ConnectionManager({
      url: "ws://localhost:9999",
      WebSocketImpl: MockWebSocket as any,
      watchdogTimeout: 60_000,
    });
    cm.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Advance past watchdog timeout (checked every 15s)
    vi.advanceTimersByTime(60_000);

    // Watchdog should have triggered — ws should be closed and reconnect scheduled
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    // The connection should have been torn down
    expect(cm.isConnected).toBe(false);

    cm.disconnect();
  });

  it("should NOT force-close when messages are received regularly", () => {
    const cm = new ConnectionManager({
      url: "ws://localhost:9999",
      WebSocketImpl: MockWebSocket as any,
      watchdogTimeout: 60_000,
    });
    cm.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Send messages every 20s to keep watchdog happy
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(20_000);
      ws.simulateMessage(JSON.stringify({ type: "heartbeat_ack" }));
    }

    // Should still be connected (100s elapsed, but messages kept coming)
    expect(cm.isConnected).toBe(true);
    expect(MockWebSocket.instances).toHaveLength(1);

    cm.disconnect();
  });

  it("should stop watchdog on disconnect", () => {
    const cm = new ConnectionManager({
      url: "ws://localhost:9999",
      WebSocketImpl: MockWebSocket as any,
      watchdogTimeout: 60_000,
    });
    cm.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Disconnect before watchdog fires
    cm.disconnect();

    // Advance past timeout — should not create new connections
    vi.advanceTimersByTime(120_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("should be disabled when watchdogTimeout is 0", () => {
    const cm = new ConnectionManager({
      url: "ws://localhost:9999",
      WebSocketImpl: MockWebSocket as any,
      watchdogTimeout: 0,
    });
    cm.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Advance way past any timeout — should stay connected
    vi.advanceTimersByTime(300_000);
    expect(cm.isConnected).toBe(true);
    expect(MockWebSocket.instances).toHaveLength(1);

    cm.disconnect();
  });

  it("should reconnect after watchdog triggers", () => {
    const onReconnect = vi.fn();
    const cm = new ConnectionManager({
      url: "ws://localhost:9999",
      WebSocketImpl: MockWebSocket as any,
      watchdogTimeout: 60_000,
      onReconnect,
    });
    cm.connect();

    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();

    // Let watchdog trigger
    vi.advanceTimersByTime(60_000);
    expect(cm.isConnected).toBe(false);

    // Reconnect timer fires (1s backoff)
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);

    // Simulate successful reconnect
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws2.simulateOpen();
    expect(cm.isConnected).toBe(true);
    expect(onReconnect).toHaveBeenCalled();

    cm.disconnect();
  });
});
