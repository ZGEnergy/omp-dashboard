import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSessionMeta } from "@blackbelt-technology/pi-dashboard-shared/session-meta.js";
import { createMemorySessionManager } from "../memory-session-manager.js";
import { createMetaPersistence } from "../meta-persistence.js";
import { createServer, type DashboardServer } from "../server.js";
import { sessionToMeta } from "../session-to-meta.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openBrowser(port: number, messages: unknown[]): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return ws;
}

async function registerSession(
  port: number,
  payload: Record<string, unknown>,
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "session_register", source: "tui", ...payload }));
      resolve();
    });
    ws.on("error", reject);
  });
  return ws;
}

describe("advisor spawn proof persistence", () => {
  let server: DashboardServer;
  let tmpDir: string;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "advisor-spawn-"));
    server = await createServer({
      port: 0,
      piPort: 0,
      host: "127.0.0.1",
      dev: true,
      autoShutdown: false,
      shutdownIdleSeconds: 999,
      tunnel: false,
    });
    await server.start();
  });

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    sockets.length = 0;
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("consumes advisor proof only for its matching token, persists it, and broadcasts it", async () => {
    const messages: unknown[] = [];
    sockets.push(await openBrowser(server.httpPort()!, messages));

    const sessionFileA = join(tmpDir, "advisor-a.jsonl");
    const sessionFileB = join(tmpDir, "advisor-b.jsonl");
    writeFileSync(sessionFileA, "");
    writeFileSync(sessionFileB, "");

    server.browserGateway.headlessPidRegistry.register(
      95_001,
      tmpDir,
      new EventEmitter() as never,
      "advisor-token-a",
    );
    server.browserGateway.headlessPidRegistry.register(
      95_002,
      tmpDir,
      new EventEmitter() as never,
      "ordinary-token-b",
    );
    server.pendingAdvisorRegistry.record("advisor-token-a");

    // Register B first to prove same-cwd arrival order cannot inherit A's proof.
    sockets.push(await registerSession(server.piPort()!, {
      sessionId: "session-b",
      cwd: tmpDir,
      sessionFile: sessionFileB,
      spawnToken: "ordinary-token-b",
    }));
    await wait(80);
    expect(server.sessionManager.get("session-b")?.advisor).toBeUndefined();

    sockets.push(await registerSession(server.piPort()!, {
      sessionId: "session-a",
      cwd: tmpDir,
      sessionFile: sessionFileA,
      spawnToken: "advisor-token-a",
    }));
    await wait(80);

    expect(server.sessionManager.get("session-a")?.advisor).toBe(true);
    expect(readSessionMeta(sessionFileA)?.advisor).toBe(true);
    expect(readSessionMeta(sessionFileB)?.advisor).toBeUndefined();
    expect(server.pendingAdvisorRegistry.size()).toBe(0);
    expect(messages).toContainEqual(expect.objectContaining({
      type: "session_updated",
      sessionId: "session-a",
      updates: { advisor: true },
    }));
    expect(messages).toContainEqual(expect.objectContaining({
      type: "session_added",
      session: expect.objectContaining({ id: "session-a", advisor: true }),
    }));
  });

  it("does not stamp advisor for an unmatched registration token", async () => {
    const sessionFile = join(tmpDir, "unmatched.jsonl");
    writeFileSync(sessionFile, "");
    server.pendingAdvisorRegistry.record("real-token");

    sockets.push(await registerSession(server.piPort()!, {
      sessionId: "unmatched-session",
      cwd: tmpDir,
      sessionFile,
      spawnToken: "unmatched-token",
    }));
    await wait(80);

    expect(server.sessionManager.get("unmatched-session")?.advisor).toBeUndefined();
    expect(readSessionMeta(sessionFile)?.advisor).toBeUndefined();
    expect(server.pendingAdvisorRegistry.size()).toBe(1);
  });

  it("retains advisor through a later full sessionToMeta overwrite and omits false", () => {
    const sessionFile = join(tmpDir, "overwrite.jsonl");
    const manager = createMemorySessionManager();
    const persistence = createMetaPersistence();
    manager.onChange = (id) => {
      const session = manager.get(id);
      if (session?.sessionFile) persistence.save(session.sessionFile, sessionToMeta(session));
    };
    manager.register({ id: "overwrite", cwd: tmpDir, source: "tui", startedAt: 1 });
    manager.update("overwrite", { sessionFile, advisor: true });
    manager.update("overwrite", { name: "unrelated update" });
    persistence.flushAll();

    expect(JSON.parse(readFileSync(join(tmpDir, "overwrite.meta.json"), "utf8"))).toMatchObject({
      advisor: true,
      name: "unrelated update",
    });
    expect(sessionToMeta({
      id: "false", cwd: tmpDir, source: "tui", status: "idle", startedAt: 1, advisor: false as never,
    })).not.toHaveProperty("advisor");
    persistence.dispose();
  });
});
