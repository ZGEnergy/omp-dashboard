/**
 * Tests that when a new session registers with a sessionFile already used by
 * another session, the old session's sessionFile is cleared.
 * This prevents resuming a stale session from loading the wrong conversation.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createServer, type DashboardServer } from "../server.js";
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
const httpPort = 19090;
const piPort = 19091;
let server: DashboardServer;

describe("session file deduplication", () => {
  afterAll(async () => {
    if (server) await server.stop();
  });

  it("clears sessionFile from old session when new session registers with same file", async () => {
    server = await createServer({
      port: httpPort, piPort, dev: true,
      autoShutdown: false, shutdownIdleSeconds: 999, tunnel: false,
    editor: { idleTimeoutMinutes: 10, maxInstances: 3 },
    });
    await server.start();

    const sharedFile = "/tmp/sessions/test.jsonl";

    // Bridge registers session A with a sessionFile
    const bridge = new WebSocket(`ws://localhost:${piPort}`);
    await waitForOpen(bridge);
    bridge.send(JSON.stringify({
      type: "session_register",
      sessionId: "session-a",
      cwd: "/tmp/project",
      source: "tui",
      name: "filesystem-browser",
      sessionFile: sharedFile,
    }));
    await delay(100);

    // Session A ends
    bridge.send(JSON.stringify({
      type: "session_unregister",
      sessionId: "session-a",
    }));
    await delay(100);

    // Browser connects to observe updates
    const browser = new WebSocket(`ws://localhost:${httpPort}/ws`);
    await waitForOpen(browser);
    const msgs = collectMsgs(browser, 500);
    await delay(50);

    // Bridge registers session B (continued from same file) with same sessionFile
    bridge.send(JSON.stringify({
      type: "session_register",
      sessionId: "session-b",
      cwd: "/tmp/project",
      source: "tui",
      name: "fix-concurrent-server-launch",
      sessionFile: sharedFile,
    }));

    const collected = await msgs;

    // Should see session_updated for session-a clearing its sessionFile
    const clearUpdate = collected.find(
      (m: any) => m.type === "session_updated" && m.sessionId === "session-a" && "sessionFile" in (m.updates ?? {}) && m.updates.sessionFile === null,
    );
    expect(clearUpdate).toBeDefined();

    // Session B should have the sessionFile
    const addedB = collected.find(
      (m: any) => m.type === "session_added" && m.session?.id === "session-b",
    );
    expect(addedB?.session?.sessionFile).toBe(sharedFile);

    bridge.close();
    browser.close();
    await delay(50);
  });
});
