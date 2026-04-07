/**
 * System REST API routes: config, health, shutdown, tunnel, editors.
 */
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../memory-session-manager.js";
import type { PreferencesStore } from "../preferences-store.js";
import type { MetaPersistence } from "../meta-persistence.js";
import type { ServerConfig } from "../server.js";
import type { ApiResponse } from "../../shared/types.js";
import { localhostGuard } from "../localhost-guard.js";
import { detectEditors, EDITORS } from "../editor-registry.js";
import { detectCodeServerBinary, resetDetectionCache } from "../editor-detection.js";
import { readConfigRedacted, writeConfigPartial } from "../config-api.js";
import { createTunnel, deleteTunnel, getTunnelStatus } from "../tunnel.js";
import { spawn } from "node:child_process";
import path from "node:path";

export function registerSystemRoutes(
  fastify: FastifyInstance,
  deps: {
    sessionManager: SessionManager;
    preferencesStore: PreferencesStore;
    metaPersistence: MetaPersistence;
    config: ServerConfig;
  },
) {
  const { sessionManager, preferencesStore, metaPersistence, config } = deps;
  const serverStartTime = Date.now();

  // Editor detection endpoint
  fastify.get<{ Querystring: { path?: string } }>(
    "/api/editors",
    { preHandler: localhostGuard },
    async (request) => {
      const cwd = request.query.path;
      if (!cwd) {
        return { success: false, error: "path parameter required" } satisfies ApiResponse;
      }
      const editors = detectEditors(cwd);
      return { success: true, data: editors } satisfies ApiResponse;
    },
  );

  // code-server binary detection endpoint
  fastify.get(
    "/api/editor/detect",
    { preHandler: localhostGuard },
    async () => {
      resetDetectionCache();
      const result = detectCodeServerBinary(config.editor);
      return { success: true, data: result } satisfies ApiResponse;
    },
  );

  // Open editor endpoint
  fastify.post<{ Body: { path?: string; editor?: string; file?: string; line?: number } }>(
    "/api/open-editor",
    { preHandler: localhostGuard },
    async (request) => {
      const { path: cwd, editor: editorId, file, line } = request.body ?? {};
      if (!cwd || !editorId) {
        return { success: false, error: "path and editor required" } satisfies ApiResponse;
      }

      const allSessions = sessionManager.listAll();
      if (!allSessions.some((s) => s.cwd === cwd)) {
        return { success: false, error: "unknown session path" } satisfies ApiResponse;
      }

      const editorEntry = EDITORS.find((e) => e.id === editorId);
      if (!editorEntry) {
        return { success: false, error: "unknown editor" } satisfies ApiResponse;
      }

      const target = file ? path.resolve(cwd, file) : cwd;
      const args = line && file ? [`${target}:${line}`] : [target];

      try {
        const child = spawn(editorEntry.cli, args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return { success: true } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: `failed to open editor: ${err.message}` } satisfies ApiResponse;
      }
    },
  );

  // Config endpoints
  fastify.get(
    "/api/config",
    { preHandler: localhostGuard },
    async () => {
      return { success: true, data: readConfigRedacted() };
    },
  );

  fastify.put(
    "/api/config",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const partial = request.body as Record<string, any>;
      if (!partial || typeof partial !== "object") {
        return reply.code(400).send({ success: false, error: "Invalid body" });
      }
      const result = writeConfigPartial(partial);
      if (!result.success) {
        return reply.code(500).send({ success: false, error: result.error });
      }

      // Apply runtime-safe changes
      const reloaded = (await import("../../shared/config.js")).loadConfig();
      if (partial.autoShutdown !== undefined || partial.shutdownIdleSeconds !== undefined) {
        config.autoShutdown = reloaded.autoShutdown;
        config.shutdownIdleSeconds = reloaded.shutdownIdleSeconds;
      }
      if (partial.auth !== undefined) {
        config.authConfig = reloaded.auth;
        if (reloaded.auth && (fastify as any)._reloadAuth) {
          await (fastify as any)._reloadAuth(reloaded.auth);
        }
      }

      return { success: true, restartRequired: result.restartRequired };
    },
  );

  // Tunnel endpoints
  fastify.get("/api/tunnel-status", async () => {
    return getTunnelStatus();
  });

  fastify.post("/api/tunnel-connect", async () => {
    const status = getTunnelStatus();
    if (status.status === "active") return { ok: true, url: status.url };
    if (status.status === "unavailable") return { ok: false, error: "zrok not installed" };
    const url = await createTunnel(config.port, config.tunnelReservedToken);
    if (url) return { ok: true, url };
    return { ok: false, error: "Failed to create tunnel" };
  });

  fastify.post("/api/tunnel-disconnect", async () => {
    await deleteTunnel();
    return { ok: true };
  });

  // Health endpoint — includes server + agent process metrics
  fastify.get("/api/health", async () => {
    const mem = process.memoryUsage();
    const activeSessions = sessionManager.listActive();
    const agentMetrics = activeSessions
      .filter(s => s.processMetrics)
      .map(s => ({
        sessionId: s.id,
        cwd: s.cwd,
        ...s.processMetrics,
      }));
    return {
      ok: true,
      pid: process.pid,
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      mode: config.dev ? "dev" : "production",
      server: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        activeSessions: activeSessions.length,
        totalSessions: sessionManager.listAll().length,
      },
      agents: agentMetrics,
    };
  });

  // Shutdown endpoint — used by devBuildOnReload
  fastify.post(
    "/api/shutdown",
    { preHandler: localhostGuard },
    async () => {
      metaPersistence.flushAll();
      preferencesStore.flush();
      setTimeout(() => process.exit(0), 100);
      return { ok: true };
    },
  );

  // Restart endpoint — flush state, spawn new server, then exit
  fastify.post<{ Body: { dev?: boolean } }>(
    "/api/restart",
    { preHandler: localhostGuard },
    async (request) => {
      metaPersistence.flushAll();
      preferencesStore.flush();

      const cliPath = process.argv[1];
      if (!cliPath) return { ok: false, error: "Cannot determine CLI path" };

      // Find the TypeScript loader from process.execArgv (--import <loader>)
      const importIdx = process.execArgv.indexOf("--import");
      const loaderArgs = importIdx >= 0 ? ["--import", process.execArgv[importIdx + 1]] : [];

      // Allow overriding dev mode via request body
      const useDev = request.body?.dev ?? config.dev;
      const args = ["start"];
      if (useDev) args.push("--dev");

      // Spawn a shell script that:
      // 1. Waits for the old server's port to be free (up to 10s)
      // 2. Starts the new server
      // 3. Verifies health (up to 10s)
      // 4. If health check fails, logs error
      const port = config.port;
      const nodeCmd = `${JSON.stringify(process.execPath)} ${loaderArgs.map(a => JSON.stringify(a)).join(" ")} ${JSON.stringify(cliPath)} ${args.join(" ")}`;
      const script = [
        // Wait for port to be free
        `for i in $(seq 1 20); do`,
        `  lsof -i :${port} -sTCP:LISTEN >/dev/null 2>&1 || break`,
        `  sleep 0.5`,
        `done`,
        // Start new server
        nodeCmd,
        // Verify health
        `for i in $(seq 1 20); do`,
        `  curl -sf http://localhost:${port}/api/health >/dev/null 2>&1 && exit 0`,
        `  sleep 0.5`,
        `done`,
        `echo "[dashboard] Restart health check failed" >&2`,
      ].join("\n");

      const child = spawn("sh", ["-c", script], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });
      child.unref();

      setTimeout(() => process.exit(0), 200);
      return { ok: true };
    },
  );
}
