/**
 * Tests for POST /api/shutdown endpoint.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer, type DashboardServer } from "../server.js";

const httpPort = 19080;
const piPort = 19081;
let server: DashboardServer;

// Mock process.exit to prevent actually exiting
const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

describe("POST /api/shutdown", () => {
  afterEach(async () => {
    mockExit.mockClear();
    if (server) {
      try { await server.stop(); } catch { /* already stopped */ }
    }
  });

  it("should respond with { ok: true }", async () => {
    server = await createServer({
      port: httpPort, piPort, dev: true,
      autoShutdown: false, shutdownIdleSeconds: 999, tunnel: false,
    editor: { idleTimeoutMinutes: 10, maxInstances: 3 },
    });
    await server.start();

    const res = await fetch(`http://localhost:${httpPort}/api/shutdown`, {
      method: "POST",
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Give the setTimeout a chance to fire
    await new Promise((r) => setTimeout(r, 200));
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
