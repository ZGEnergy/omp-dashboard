/**
 * End-to-end test: `providers_list` arriving from a (fake) bridge updates
 * the provider-catalogue cache, and `getAuthStatus()` reflects it.
 * Also pins the broadcast-gating contract: `models_refreshed` is emitted to
 * browsers only when the catalogue contents actually changed (regression for
 * the over-aggressive global wipe that left previously-visited sessions
 * with empty model selectors).
 * See changes: replace-hardcoded-provider-lists,
 *              fix-providers-list-spurious-models-refreshed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createServer, type DashboardServer } from "../server.js";
import { _resetForTests, getLatestCatalogue } from "../provider-catalogue-cache.js";
import { getAuthStatus } from "../provider-auth-storage.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connectSession(piPort: number, sessionId: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${piPort}`);
  await new Promise<void>((resolve) => {
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "session_register",
        sessionId,
        cwd: "/tmp",
        source: "cli",
      }));
      ws.send(JSON.stringify({ type: "replay_complete", sessionId }));
      setTimeout(resolve, 60);
    });
  });
  return ws;
}

describe("providers_list — server wiring", () => {
  let server: DashboardServer;
  let piPort: number;
  let browserPort: number;
  let testPort = 19500;

  beforeEach(async () => {
    _resetForTests();
    testPort += 2;
    browserPort = testPort;
    piPort = testPort + 1;
    server = await createServer({
      port: browserPort,
      piPort,
      dev: true,
      autoShutdown: false,
      shutdownIdleSeconds: 999,
      tunnel: false,
      editor: { idleTimeoutMinutes: 10, maxInstances: 3 },
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    _resetForTests();
  });

  it("incoming providers_list updates the cache and is visible via getAuthStatus", async () => {
    const piWs = await connectSession(piPort, "p1");
    expect(getLatestCatalogue()).toEqual([]);

    piWs.send(JSON.stringify({
      type: "providers_list",
      sessionId: "p1",
      providers: [
        { id: "deepseek", displayName: "DeepSeek", hasOAuth: false, configured: false },
        { id: "fireworks", displayName: "Fireworks", hasOAuth: false, configured: false, envVar: "FIREWORKS_API_KEY" },
      ],
    }));

    await wait(80);

    const cached = getLatestCatalogue();
    expect(cached).toHaveLength(2);
    expect(cached.map((p) => p.id).sort()).toEqual(["deepseek", "fireworks"]);

    const status = getAuthStatus();
    const deepseekRow = status.find((r) => r.id === "deepseek");
    const fireworksRow = status.find((r) => r.id === "fireworks");
    expect(deepseekRow).toBeDefined();
    expect(deepseekRow?.flowType).toBe("api_key");
    expect(fireworksRow?.envVar).toBe("FIREWORKS_API_KEY");

    piWs.close();
  });

  // Regression — see change: fix-providers-list-spurious-models-refreshed.
  it("broadcasts models_refreshed only when catalogue contents actually change", async () => {
    const piWs = await connectSession(piPort, "p1");
    const browserWs = new WebSocket(`ws://localhost:${browserPort}/ws`);
    const browserMessages: any[] = [];
    await new Promise<void>((resolve) => {
      browserWs.on("open", () => resolve());
    });
    browserWs.on("message", (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        browserMessages.push(m);
      } catch { /* ignore */ }
    });
    // Drain initial snapshot/handshake messages.
    await wait(80);
    browserMessages.length = 0;

    const cat1 = [
      { id: "deepseek", displayName: "DeepSeek", hasOAuth: false, configured: false },
      { id: "fireworks", displayName: "Fireworks", hasOAuth: false, configured: false, envVar: "FIREWORKS_API_KEY" },
    ];

    // 1) First push — must broadcast.
    piWs.send(JSON.stringify({ type: "providers_list", sessionId: "p1", providers: cat1 }));
    await wait(80);
    const refreshes1 = browserMessages.filter((m) => m.type === "models_refreshed");
    expect(refreshes1.length).toBe(1);
    browserMessages.length = 0;

    // 2) Identical re-push (the routine state-sync case) — must NOT broadcast.
    piWs.send(JSON.stringify({ type: "providers_list", sessionId: "p1", providers: cat1 }));
    await wait(80);
    const refreshes2 = browserMessages.filter((m) => m.type === "models_refreshed");
    expect(refreshes2.length).toBe(0);

    // 3) Push with a flipped `custom` flag — must broadcast (catalogue truly changed).
    const cat2 = [
      { id: "deepseek", displayName: "DeepSeek", hasOAuth: false, configured: false, custom: true },
      { id: "fireworks", displayName: "Fireworks", hasOAuth: false, configured: false, envVar: "FIREWORKS_API_KEY" },
    ];
    piWs.send(JSON.stringify({ type: "providers_list", sessionId: "p1", providers: cat2 }));
    await wait(80);
    const refreshes3 = browserMessages.filter((m) => m.type === "models_refreshed");
    expect(refreshes3.length).toBe(1);

    piWs.close();
    browserWs.close();
  });
});
