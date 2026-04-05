/**
 * Dashboard HTTP + WebSocket server.
 */
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createMemoryEventStore, type EventStore } from "./memory-event-store.js";
import { createMemorySessionManager, type SessionManager } from "./memory-session-manager.js";
import { createPiGateway, type PiGateway } from "./pi-gateway.js";
import { createBrowserGateway, type BrowserGateway } from "./browser-gateway.js";
import { createPreferencesStore, type PreferencesStore } from "./preferences-store.js";
import { createMetaPersistence, type MetaPersistence } from "./meta-persistence.js";
import { createSessionOrderManager, type SessionOrderManager } from "./session-order-manager.js";
import { createPendingForkRegistry, type PendingForkRegistry } from "./pending-fork-registry.js";

// pending-load-manager removed — server loads sessions directly via DirectoryService
import { createDirectoryService, type DirectoryService } from "./directory-service.js";
import { createTerminalManager, type TerminalManager } from "./terminal-manager.js";
import { createTerminalGateway, type TerminalGateway } from "./terminal-gateway.js";
import { writePid, removePid } from "./server-pid.js";
import { wireEvents } from "./event-wiring.js";
import { createIdleTimer } from "./idle-timer.js";
import { discoverAndBroadcastSessions } from "./session-bootstrap.js";
import { scanAllSessions } from "./session-scanner.js";
import { needsMigration, runMigration } from "./migrate-persistence.js";
import { detectZrokBinary, cleanupStaleZrok, createTunnel, deleteTunnel } from "./tunnel.js";
import { registerAuthPlugin, validateWsUpgrade, isBypassedHost } from "./auth-plugin.js";
import type { AuthConfig } from "../shared/config.js";
import { registerSessionApi } from "./session-api.js";
import { registerSessionRoutes } from "./routes/session-routes.js";
import { registerGitRoutes } from "./routes/git-routes.js";
import { registerFileRoutes } from "./routes/file-routes.js";
import { registerOpenSpecRoutes } from "./routes/openspec-routes.js";
import { registerSystemRoutes } from "./routes/system-routes.js";
import { registerProviderAuthRoutes } from "./routes/provider-auth-routes.js";
import { registerPackageRoutes } from "./routes/package-routes.js";
import { PackageManagerWrapper } from "./package-manager-wrapper.js";

export interface ServerConfig {
  port: number;
  piPort: number;
  dev: boolean;
  autoShutdown: boolean;
  shutdownIdleSeconds: number;
  tunnel: boolean;
  tunnelReservedToken?: string;
  authConfig?: AuthConfig;
  /** Override WS ping interval for pi-gateway (ms). Default 60000. Set 0 to disable. */
  pingInterval?: number;
  /** Memory limit overrides from config */
  maxEventsPerSession?: number;
  maxStringFieldSize?: number;
  maxWsBufferBytes?: number;
}

export interface DashboardServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sessionManager: SessionManager;
  eventStore: EventStore;
  browserGateway: BrowserGateway;
}

export async function createServer(config: ServerConfig): Promise<DashboardServer> {
  // Run migration from sessions.json + state.json if needed
  if (needsMigration()) {
    const migResult = runMigration();
    console.log(`[dashboard] Migration complete: ${migResult.sessionsWritten} sessions, ${migResult.hiddenApplied} hidden applied, ${migResult.hiddenOrphaned} orphaned, renamed: ${migResult.oldFilesRenamed.join(", ")}`);
  }

  const preferencesStore = createPreferencesStore();
  const sessionManager = createMemorySessionManager();
  const metaPersistence = createMetaPersistence();
  const sessionOrderManager = createSessionOrderManager(preferencesStore);
  const pendingForkRegistry = createPendingForkRegistry();

  // Restore sessions from per-session .meta.json files (scans ~/.pi/agent/sessions/)
  const scanResult = scanAllSessions();
  for (const session of scanResult.sessions) {
    const restored = { ...session, dataUnavailable: true };
    if (restored.status !== "ended") {
      restored.status = "ended";
      restored.endedAt = restored.endedAt ?? Date.now();
    }
    sessionManager.restore(restored);
  }
  if (scanResult.cacheUpdates > 0) {
    console.log(`[dashboard] Session scan: ${scanResult.sessions.length} sessions, ${scanResult.cacheUpdates} cache updates`);
  }

  // Save per-session .meta.json on any change
  sessionManager.onChange = (sessionId: string) => {
    const session = sessionManager.get(sessionId);
    if (!session?.sessionFile) return;
    metaPersistence.save(session.sessionFile, {
      source: session.source,
      name: session.name,
      attachedProposal: session.attachedProposal,
      hidden: session.hidden,
      cwd: session.cwd,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      tokensIn: session.tokensIn,
      tokensOut: session.tokensOut,
      cacheRead: session.cacheRead,
      cacheWrite: session.cacheWrite,
      cost: session.cost,
      contextTokens: session.contextTokens,
      contextWindow: session.contextWindow,
      firstMessage: session.firstMessage,
      cachedAt: Date.now(),
    });
  };

  // Track cwds with pending dashboard-spawned sessions (for writing .meta.json).
  // Uses a counter per cwd to handle multiple spawns and avoid reconnects consuming entries.
  const pendingDashboardSpawns = new Map<string, number>();
  // Track known session IDs so we can distinguish new sessions from reconnections.
  const knownSessionIds = new Set<string>();
  // Populate from persisted sessions
  for (const s of sessionManager.listAll()) {
    knownSessionIds.add(s.id);
  }

  const directoryService = createDirectoryService(preferencesStore, sessionManager);

  const piGateway = createPiGateway(sessionManager, {
    ...(config.pingInterval !== undefined ? { pingInterval: config.pingInterval } : {}),
  });

  // Create event store with pinning callback and configurable limits
  const eventStore = createMemoryEventStore(
    (sessionId) =>
      piGateway.isSessionConnected(sessionId) ||
      browserGateway.getSubscriberCount(sessionId) > 0,
    undefined, // maxCachedSessions (use default)
    config.maxEventsPerSession,
    config.maxStringFieldSize,
  );

  // Create terminal manager with exit callback
  const terminalManager = createTerminalManager({
    onExit: (terminalId) => {
      // Find and remove from session order
      const allOrders = sessionOrderManager.getAllOrders();
      for (const [cwd, ids] of Object.entries(allOrders)) {
        if (ids.includes(terminalId)) {
          sessionOrderManager.remove(cwd, terminalId);
          break;
        }
      }
      browserGateway.broadcastToAll({ type: "terminal_removed", terminalId });
    },
  });

  const terminalGateway = createTerminalGateway(terminalManager);

  const browserGateway = createBrowserGateway(sessionManager, eventStore, piGateway, undefined, pendingForkRegistry, sessionOrderManager, preferencesStore, directoryService, terminalManager, pendingDashboardSpawns, config.maxWsBufferBytes);


  // Wire up event forwarding from pi gateway to browser gateway
  wireEvents({
    sessionManager,
    eventStore,
    piGateway,
    browserGateway,
    sessionOrderManager,
    pendingForkRegistry,
    directoryService,
    knownSessionIds,
    pendingDashboardSpawns,
  });

  // Auto-shutdown idle timer
  const idleTimer = createIdleTimer(config, piGateway);

  const fastify = Fastify({
    logger: false,
    keepAliveTimeout: 30_000,
    connectionTimeout: 10_000,
  });

  // Register auth plugin if configured (must be before routes)
  if (config.authConfig) {
    await registerAuthPlugin(fastify, { authConfig: config.authConfig, port: config.port });
  } else {
    // Auth disabled — still expose /auth/status so clients can detect this
    fastify.get("/auth/status", async () => ({ authenticated: true, authEnabled: false }));
  }

  // Session control REST API (wraps WebSocket-only operations)
  registerSessionApi(fastify, {
    sessionManager,
    piGateway,
    browserGateway,
    pendingForkRegistry,
    pendingDashboardSpawns,
  });

  // Register route modules
  registerSessionRoutes(fastify, { sessionManager, eventStore });
  registerGitRoutes(fastify);
  registerFileRoutes(fastify, { sessionManager, preferencesStore });
  registerOpenSpecRoutes(fastify, { sessionManager, preferencesStore, directoryService });
  registerSystemRoutes(fastify, { sessionManager, preferencesStore, metaPersistence, config });
  // Package management
  const packageManagerWrapper = new PackageManagerWrapper();

  // Forward progress events to all browser clients
  packageManagerWrapper.setProgressListener((operationId, event) => {
    browserGateway.broadcastToAll({ type: "package_progress", operationId, event } as any);
  });

  // On completion: broadcast to browsers
  packageManagerWrapper.setCompleteListener((result) => {
    browserGateway.broadcastToAll({
      type: "package_operation_complete",
      operationId: result.operationId,
      action: result.action,
      source: result.source,
      scope: result.scope,
      success: result.success,
      error: result.error,
      sessionsReloaded: (result as any).sessionsReloaded,
    } as any);
  });

  // Reload all active sessions after a successful package operation
  packageManagerWrapper.setReloadSessions(async () => {
    const connectedIds = piGateway.getConnectedSessionIds();
    let count = 0;
    for (const sid of connectedIds) {
      const session = sessionManager.get(sid);
      if (session && session.status !== "ended") {
        piGateway.sendToSession(sid, {
          type: "send_prompt",
          sessionId: sid,
          text: "/reload",
        });
        count++;
      }
    }
    return count;
  });

  registerPackageRoutes(fastify, { packageManagerWrapper });

  registerProviderAuthRoutes(fastify, { piGateway });

  // Serve static files / SPA fallback
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.join(__dirname, "../../dist/client");
  const hasProductionBuild = existsSync(path.join(clientDir, "index.html"));

  // Register static file serving for production build.
  // Always enabled — in dev mode, Vite handles most requests via the
  // not-found proxy, but asset files (JS/CSS with hashed names) must be
  // served directly when Vite is not running (production fallback).
  if (hasProductionBuild) {
    await fastify.register(fastifyStatic, {
      root: clientDir,
      prefix: "/",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    });
  }

  if (config.dev) {
    // Dev mode: proxy to Vite dev server, fall back to production build
    const VITE_PORTS = [3000, 5173, 5174];
    let vitePort = 0;

    async function detectVitePort(): Promise<number> {
      for (const port of VITE_PORTS) {
        try {
          const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) });
          if (res.ok) return port;
        } catch { /* not listening */ }
      }
      return 0;
    }

    vitePort = await detectVitePort();

    fastify.setNotFoundHandler(async (request, reply) => {
      // Try Vite proxy first
      if (!vitePort) vitePort = await detectVitePort();
      if (vitePort) {
        try {
          const viteUrl = `http://localhost:${vitePort}${request.url}`;
          const res = await fetch(viteUrl);
          const contentType = res.headers.get("content-type");
          if (contentType) reply.header("Content-Type", contentType);
          reply.code(res.status);
          return reply.send(Buffer.from(await res.arrayBuffer()));
        } catch {
          vitePort = 0; // Vite stopped — re-probe next time
        }
      }
      // Fallback: serve production build if available
      if (hasProductionBuild) {
        reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
        return reply.sendFile("index.html");
      }
      return reply.code(502).send({ error: "Neither Vite dev server nor production build available" });
    });
  } else if (hasProductionBuild) {
    // Production mode: SPA fallback
    fastify.setNotFoundHandler(async (_request, reply) => {
      reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
      return reply.sendFile("index.html");
    });
  } else {
    fastify.setNotFoundHandler(async (_request, reply) => {
      return reply.code(500).send({ error: "No client build found. Run `npm run build` first." });
    });
  }

  const server: DashboardServer = {
    sessionManager,
    eventStore,
    browserGateway,

    async start() {
      // Clean up orphan headless processes from a previous server instance
      browserGateway.headlessPidRegistry.cleanupOrphans();

      piGateway.start(config.piPort);

      fastify.server.on("upgrade", (request, socket, head) => {
        // Auth check for WebSocket upgrades (when auth is configured)
        if (config.authConfig?.secret) {
          const remoteAddress = request.socket.remoteAddress || "";
          if (isBypassedHost(remoteAddress, config.authConfig.bypassHosts ?? [])) {
            // Trusted host — skip auth
          } else if (!validateWsUpgrade(request.headers.cookie, remoteAddress, config.authConfig.secret)) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
          }
        }

        if (request.url === "/ws") {
          browserGateway.wss.handleUpgrade(request, socket, head, (ws) => {
            browserGateway.wss.emit("connection", ws, request);
          });
        } else if (request.url?.startsWith("/ws/terminal/")) {
          terminalGateway.handleUpgrade(request, socket, head);
        } else {
          socket.destroy();
        }
      });

      await fastify.listen({ port: config.port, host: "0.0.0.0" });
      writePid(process.pid);
      console.log(`Dashboard server running at http://localhost:${config.port}`);
      console.log(`Pi gateway listening on port ${config.piPort}`);

      if (config.tunnel) {
        const hasZrok = detectZrokBinary();
        if (hasZrok) {
          cleanupStaleZrok();
          const tunnelUrl = await createTunnel(config.port, config.tunnelReservedToken);
          if (tunnelUrl) {
            console.log(`🌐 Tunnel: ${tunnelUrl}`);
          }
        }
      }

      // Discover sessions and start OpenSpec polling (async, non-blocking)
      discoverAndBroadcastSessions({ sessionManager, browserGateway, directoryService });

      idleTimer.start();
    },

    async stop() {
      removePid();
      idleTimer.cancel();
      directoryService.stopPolling();
      browserGateway.shutdownHeadlessProcesses();
      metaPersistence.flushAll();
      metaPersistence.dispose();
      pendingForkRegistry.dispose();
      preferencesStore.flush();
      preferencesStore.dispose();

      await deleteTunnel();
      piGateway.stop();
      for (const client of browserGateway.wss.clients) {
        client.terminate();
      }
      browserGateway.wss.close();
      terminalGateway.close();
      // Kill all active terminal PTY processes
      for (const t of terminalManager.list()) {
        try { terminalManager.kill(t.id); } catch {}
      }
      await fastify.close();
    },
  };

  idleTimer.setStopFn(server.stop.bind(server));
  return server;
}
