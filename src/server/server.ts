/**
 * Dashboard HTTP + WebSocket server.
 */
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryEventStore, type EventStore } from "./memory-event-store.js";
import { createMemorySessionManager, type SessionManager } from "./memory-session-manager.js";
import { createPiGateway, type PiGateway } from "./pi-gateway.js";
import { createBrowserGateway, type BrowserGateway } from "./browser-gateway.js";
import { createWorkspaceStore, type WorkspaceStore } from "./workspace-store.js";
import { createStateStore, type StateStore } from "./state-store.js";

import { createPendingLoadManager, type PendingLoadManager } from "./pending-load-manager.js";
import type { ApiResponse } from "../shared/types.js";
import { extractSessionUpdates } from "./event-status-extraction.js";
import { createTunnel, deleteTunnel } from "./tunnel.js";
import { detectEditors, EDITORS } from "./editor-registry.js";
import { localhostGuard } from "./localhost-guard.js";
import { spawn } from "node:child_process";

export interface ServerConfig {
  port: number;
  piPort: number;
  dev: boolean;
  autoShutdown: boolean;
  shutdownIdleSeconds: number;
  tunnel: boolean;
}

export interface DashboardServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sessionManager: SessionManager;
  eventStore: EventStore;
}

export async function createServer(config: ServerConfig): Promise<DashboardServer> {
  const stateStore = createStateStore();
  const workspaceStore = createWorkspaceStore();
  const sessionManager = createMemorySessionManager(stateStore, workspaceStore);
  const piGateway = createPiGateway(sessionManager);

  // Create event store with pinning callback
  const eventStore = createMemoryEventStore(
    (sessionId) =>
      piGateway.isSessionConnected(sessionId) ||
      browserGateway.getSubscriberCount(sessionId) > 0,
  );

  // Create pending load manager with timeout handler
  const pendingLoadManager = createPendingLoadManager((sessionId, browsers) => {
    // Timeout: send dataUnavailable to all waiting browsers
    sessionManager.update(sessionId, { dataUnavailable: true });
    browserGateway.broadcastSessionUpdated(sessionId, { dataUnavailable: true });
  });

  const browserGateway = createBrowserGateway(sessionManager, eventStore, piGateway, pendingLoadManager);

  // Handle bridge disconnect — cancel pending loads
  piGateway.onDisconnect = (bridgeSessionId) => {
    const cancelled = pendingLoadManager.cancelForBridge(bridgeSessionId);
    for (const [sessionId, browsers] of cancelled) {
      // Try another bridge
      const session = sessionManager.get(sessionId);
      const altBridge = session?.cwd ? piGateway.findSessionByCwd(session.cwd) : undefined;
      if (altBridge && session?.sessionFile) {
        // Retry with another bridge
        for (const ws of browsers) {
          pendingLoadManager.start(sessionId, ws, altBridge);
        }
        piGateway.sendToSession(altBridge, {
          type: "load_session_events",
          sessionId,
          sessionFile: session.sessionFile,
        });
      } else {
        // No alternative bridge — data unavailable
        sessionManager.update(sessionId, { dataUnavailable: true });
        browserGateway.broadcastSessionUpdated(sessionId, { dataUnavailable: true });
      }
    }
  };

  // Broadcast placeholder session to browsers when auto-created from early events
  piGateway.onSessionCreated = (sessionId) => {
    const session = sessionManager.get(sessionId);
    if (session) {
      browserGateway.broadcastSessionAdded(session);
    }
  };

  // Wire up event forwarding from pi gateway to browser gateway
  piGateway.onEvent = (sessionId, msg) => {
    if (msg.type === "event_forward") {
      const seq = eventStore.insertEvent(sessionId, msg.event);
      browserGateway.broadcastEvent(sessionId, seq, msg.event);

      // Extract status/tool updates from the event and broadcast
      const updates = extractSessionUpdates(msg.event);
      if (updates) {
        sessionManager.update(sessionId, updates);
        browserGateway.broadcastSessionUpdated(sessionId, updates);
      }
    }
    if (msg.type === "session_register") {
      // Always clear events — bridge replays full session history after registering
      eventStore.deleteEventsForSession(sessionId);
      // Force visible + clear dataUnavailable — active sessions must always be visible
      sessionManager.update(sessionId, { hidden: false, dataUnavailable: false });
      const session = sessionManager.get(sessionId);
      if (session) {
        browserGateway.broadcastSessionAdded(session);
      }
    }
    if (msg.type === "session_history_sync") {
      // Broadcast newly inserted historical sessions to browsers
      for (const hist of msg.sessions) {
        const session = sessionManager.get(hist.id);
        if (session && session.status === "ended") {
          browserGateway.broadcastSessionAdded(session);
        }
      }
    }
    if (msg.type === "session_unregister") {
      browserGateway.broadcastSessionRemoved(sessionId);
    }
    if (msg.type === "commands_list") {
      browserGateway.sendToSubscribers(sessionId, {
        type: "commands_list",
        sessionId,
        commands: msg.commands,
      });
    }
    if (msg.type === "git_info_update") {
      const gitUpdates = {
        gitBranch: msg.gitBranch,
        gitBranchUrl: msg.gitBranchUrl,
        gitPrNumber: msg.gitPrNumber,
        gitPrUrl: msg.gitPrUrl,
      };
      sessionManager.update(sessionId, gitUpdates);
      browserGateway.broadcastSessionUpdated(sessionId, gitUpdates);
    }
    if (msg.type === "files_list") {
      browserGateway.sendToSubscribers(sessionId, {
        type: "files_list",
        sessionId,
        query: msg.query,
        files: msg.files,
      });
    }
    if (msg.type === "openspec_update") {
      sessionManager.update(sessionId, { openspecData: JSON.stringify(msg.data) });
      browserGateway.sendToSubscribers(sessionId, {
        type: "openspec_update",
        sessionId,
        data: msg.data,
      });
    }
    if (msg.type === "openspec_activity_update") {
      const activityUpdates: Partial<import("../shared/types.js").DashboardSession> = {
        openspecPhase: msg.phase ?? undefined,
        openspecChange: msg.changeName ?? undefined,
      };
      sessionManager.update(sessionId, activityUpdates);
      browserGateway.broadcastSessionUpdated(sessionId, {
        openspecPhase: msg.phase ?? null,
        openspecChange: msg.changeName ?? null,
      });
    }
    if (msg.type === "models_list") {
      browserGateway.sendToSubscribers(sessionId, {
        type: "models_list",
        sessionId,
        models: msg.models,
      });
    }
    if (msg.type === "model_update") {
      const modelUpdates: Partial<import("../shared/types.js").DashboardSession> = {
        model: msg.model,
      };
      if (msg.thinkingLevel !== undefined) {
        modelUpdates.thinkingLevel = msg.thinkingLevel;
      }
      sessionManager.update(sessionId, modelUpdates);
      browserGateway.broadcastSessionUpdated(sessionId, modelUpdates);
    }
    if (msg.type === "session_name_update") {
      const nameUpdates = { name: msg.name || undefined };
      sessionManager.update(sessionId, nameUpdates);
      browserGateway.broadcastSessionUpdated(sessionId, nameUpdates);
    }
    if (msg.type === "sessions_list") {
      // Create in-memory records for sessions not already known
      for (const piSession of msg.sessions) {
        const existing = sessionManager.get(piSession.id);
        if (!existing) {
          sessionManager.register({
            id: piSession.id,
            cwd: piSession.cwd,
            name: piSession.name,
            source: "unknown",
            sessionFile: piSession.path,
            sessionDir: piSession.cwd,
            firstMessage: piSession.firstMessage,
          });
          sessionManager.unregister(piSession.id);
        } else if (existing.sessionFile !== piSession.path) {
          sessionManager.update(piSession.id, {
            sessionFile: piSession.path,
            sessionDir: piSession.cwd,
          });
        }
      }
      browserGateway.broadcastToAll({
        type: "sessions_list",
        sessionId,
        cwd: msg.cwd,
        sessions: msg.sessions,
      });
    }
    if (msg.type === "stats_update") {
      const session = sessionManager.get(sessionId);
      if (session) {
        browserGateway.broadcastSessionUpdated(sessionId, {
          tokensIn: session.tokensIn,
          tokensOut: session.tokensOut,
          cacheRead: session.cacheRead,
          cacheWrite: session.cacheWrite,
          cost: session.cost,
        });

      }

      const statsEvent = {
        eventType: "stats_update",
        timestamp: Date.now(),
        data: {
          tokensIn: msg.stats.tokensIn,
          tokensOut: msg.stats.tokensOut,
          cost: msg.stats.cost,
          turnUsage: msg.stats.turnUsage,
          contextUsage: msg.stats.contextUsage,
        },
      };
      const seq = eventStore.insertEvent(sessionId, statsEvent);
      browserGateway.broadcastEvent(sessionId, seq, statsEvent);
    }

    // Handle on-demand session load results from bridge
    if (msg.type === "load_session_events_result") {
      const loadSessionId = msg.sessionId;
      const browsers = pendingLoadManager.complete(loadSessionId);
      if (browsers) {
        // Insert events into memory buffer
        for (const evt of msg.events) {
          eventStore.insertEvent(loadSessionId, evt);
        }
        // Clear dataUnavailable
        sessionManager.update(loadSessionId, { dataUnavailable: false });
        browserGateway.broadcastSessionUpdated(loadSessionId, { dataUnavailable: false });
        // Send batch replay to all waiting browsers
        const stored = eventStore.getEvents(loadSessionId, 1);
        const replayMsg = {
          type: "event_replay" as const,
          sessionId: loadSessionId,
          events: stored.map((e) => ({ seq: e.seq, event: e.event })),
          isLast: true,
        };
        for (const ws of browsers) {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(JSON.stringify(replayMsg));
          }
        }
      }
    }
    if (msg.type === "load_session_events_error") {
      const loadSessionId = msg.sessionId;
      const browsers = pendingLoadManager.complete(loadSessionId);
      if (browsers) {
        sessionManager.update(loadSessionId, { dataUnavailable: true });
        browserGateway.broadcastSessionUpdated(loadSessionId, { dataUnavailable: true });
      }
    }
  };

  // Auto-shutdown idle timer
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let stopServer: (() => Promise<void>) | null = null;

  function startIdleTimer() {
    if (!config.autoShutdown) return;
    cancelIdleTimer();
    idleTimer = setTimeout(async () => {
      console.log(`No pi sessions for ${config.shutdownIdleSeconds}s, shutting down...`);
      await stopServer?.();
      process.exit(0);
    }, config.shutdownIdleSeconds * 1000);
  }

  function cancelIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  piGateway.onEmpty = () => {
    startIdleTimer();
  };

  piGateway.onConnection = () => {
    cancelIdleTimer();
  };

  const fastify = Fastify({ logger: false });

  // REST API routes
  fastify.get("/api/sessions", async () => {
    const sessions = sessionManager.listAll();
    return { success: true, data: sessions } satisfies ApiResponse;
  });

  fastify.get<{ Params: { sessionId: string; seq: string } }>(
    "/api/events/:sessionId/:seq",
    async (request) => {
      const { sessionId, seq } = request.params;
      const event = eventStore.getEvent(sessionId, parseInt(seq, 10));
      if (!event) {
        return { success: false, error: "Event not found" } satisfies ApiResponse;
      }
      return { success: true, data: event } satisfies ApiResponse;
    }
  );

  fastify.get("/api/workspaces", async () => {
    return { success: true, data: workspaceStore.list() } satisfies ApiResponse;
  });

  fastify.post<{ Body: { path: string; name?: string } }>("/api/workspaces", async (request) => {
    try {
      const ws = workspaceStore.create(request.body);
      return { success: true, data: ws } satisfies ApiResponse;
    } catch (err: any) {
      return { success: false, error: err.message } satisfies ApiResponse;
    }
  });

  fastify.put<{ Params: { id: string }; Body: { name?: string; sortOrder?: number } }>(
    "/api/workspaces/:id",
    async (request) => {
      try {
        const ws = workspaceStore.update(request.params.id, request.body);
        return { success: true, data: ws } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>("/api/workspaces/:id", async (request) => {
    workspaceStore.delete(request.params.id);
    return { success: true } satisfies ApiResponse;
  });

  // Editor detection endpoint (localhost-only)
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
    }
  );

  // Open editor endpoint (localhost-only)
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
    }
  );

  // Serve static files (built web client) in production
  if (!config.dev) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDir = path.join(__dirname, "../../dist/client");
    await fastify.register(fastifyStatic, {
      root: clientDir,
      prefix: "/",
    });
  }

  const server: DashboardServer = {
    sessionManager,
    eventStore,

    async start() {
      piGateway.start(config.piPort);

      fastify.server.on("upgrade", (request, socket, head) => {
        if (request.url === "/ws") {
          browserGateway.wss.handleUpgrade(request, socket, head, (ws) => {
            browserGateway.wss.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      });

      await fastify.listen({ port: config.port, host: "0.0.0.0" });
      console.log(`Dashboard server running at http://localhost:${config.port}`);
      console.log(`Pi gateway listening on port ${config.piPort}`);

      if (config.tunnel) {
        const tunnelUrl = await createTunnel(config.port);
        if (tunnelUrl) {
          console.log(`🌐 Tunnel: ${tunnelUrl}`);
        }
      }

      startIdleTimer();
    },

    async stop() {
      cancelIdleTimer();
      pendingLoadManager.dispose();
      stateStore.flush();
      stateStore.dispose();

      await deleteTunnel();
      piGateway.stop();
      for (const client of browserGateway.wss.clients) {
        client.terminate();
      }
      browserGateway.wss.close();
      await fastify.close();
    },
  };

  stopServer = server.stop.bind(server);
  return server;
}
