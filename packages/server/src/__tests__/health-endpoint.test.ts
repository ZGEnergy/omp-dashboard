/**
 * Tests for GET /api/health endpoint.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type DashboardServer } from "../server.js";

const httpPort = 19090;
const piPort = 19091;
let server: DashboardServer;

describe("GET /api/health", () => {
  afterEach(async () => {
    if (server) {
      try { await server.stop(); } catch { /* already stopped */ }
    }
  });

  it("should return ok, pid, and uptime", async () => {
    server = await createServer({
      port: httpPort, piPort, dev: true,
      autoShutdown: false, shutdownIdleSeconds: 999, tunnel: false,
    editor: { idleTimeoutMinutes: 10, maxInstances: 3 },
    });
    await server.start();

    const res = await fetch(`http://localhost:${httpPort}/api/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pid).toBe(process.pid);
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
