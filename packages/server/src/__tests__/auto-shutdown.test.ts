import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type ServerConfig, type DashboardServer } from "../server.js";

describe("Server auto-shutdown", () => {
  let server: DashboardServer;
  const baseConfig: ServerConfig = {
    port: 0,
    piPort: 0,
    dev: true,
    autoShutdown: true,
    shutdownIdleSeconds: 2,
    tunnel: false,
    pingInterval: 0, // Disable WS ping to avoid fake/real timer conflicts
    editor: { idleTimeoutMinutes: 10, maxInstances: 3 },
  };

  let testPort = 18700;

  beforeEach(async () => {
    vi.useFakeTimers();
    testPort += 2;
    server = await createServer({
      ...baseConfig,
      port: testPort,
      piPort: testPort + 1,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    try {
      await server.stop();
    } catch {
      // may already be stopped
    }
  });

  it("should shut down after idle timeout when no sessions connect", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await server.start();

    await vi.advanceTimersByTimeAsync(2000);

    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it("should not shut down when autoShutdown is false", async () => {
    await server.stop();
    testPort += 2;
    server = await createServer({
      ...baseConfig,
      port: testPort,
      piPort: testPort + 1,
      autoShutdown: false,
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await server.start();

    await vi.advanceTimersByTimeAsync(5000);

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("should not shut down if session reconnects before idle timer fires", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await server.start();

    // Advance to just before idle timeout
    await vi.advanceTimersByTimeAsync(1500);

    // Connect a session — this cancels the idle timer and sets lastConnectionTimestamp
    vi.useRealTimers();
    const { WebSocket } = await import("ws");
    const ws = new WebSocket(`ws://localhost:${testPort + 1}`);
    await new Promise<void>((resolve) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "session_register",
          sessionId: "wake-sess",
          cwd: "/tmp",
          source: "cli",
        }));
        setTimeout(resolve, 50);
      });
    });

    vi.useFakeTimers();

    // Even if we advance way past the idle timeout, should NOT exit because session is connected
    await vi.advanceTimersByTimeAsync(10000);
    expect(exitSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
    ws.close();
    exitSpy.mockRestore();
  }, 10000);

  it("should cancel idle timer when a session connects", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await server.start();

    await vi.advanceTimersByTimeAsync(1000);

    vi.useRealTimers();
    const { WebSocket } = await import("ws");
    const ws = new WebSocket(`ws://localhost:${testPort + 1}`);
    await new Promise<void>((resolve) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "session_register",
          sessionId: "test-sess",
          cwd: "/tmp",
          source: "cli",
        }));
        setTimeout(resolve, 50);
      });
    });

    vi.useFakeTimers();

    await vi.advanceTimersByTimeAsync(5000);

    expect(exitSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
    ws.close();
    exitSpy.mockRestore();
  });
});
