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
import { createStateStore, type StateStore } from "./state-store.js";
import { createSessionPersistence, type SessionPersistence } from "./session-persistence.js";
import { createSessionOrderManager, type SessionOrderManager } from "./session-order-manager.js";
import { createPendingForkRegistry, type PendingForkRegistry } from "./pending-fork-registry.js";

// pending-load-manager removed — server loads sessions directly via DirectoryService
import { createDirectoryService, type DirectoryService } from "./directory-service.js";
import { createTerminalManager, type TerminalManager } from "./terminal-manager.js";
import { createTerminalGateway, type TerminalGateway } from "./terminal-gateway.js";
import { writePid, removePid } from "./server-pid.js";
import type { ApiResponse } from "../shared/types.js";
import { extractSessionStats } from "./session-stats-reader.js";
import { extractSessionUpdates } from "./event-status-extraction.js";
import { createTunnel, deleteTunnel, getTunnelStatus, detectZrokBinary, cleanupStaleZrok } from "./tunnel.js";
import { detectEditors, EDITORS } from "./editor-registry.js";
import { localhostGuard } from "./localhost-guard.js";
import { listDirectories } from "./browse.js";
import { readConfigRedacted, writeConfigPartial } from "./config-api.js";
import { spawn } from "node:child_process";
import { isGitRepo, listBranches, checkoutBranch, gitInit, stashPop } from "./git-operations.js";
import fs from "node:fs/promises";
import { registerAuthPlugin, validateWsUpgrade, isBypassedHost } from "./auth-plugin.js";
import type { AuthConfig } from "../shared/config.js";

export interface ServerConfig {
  port: number;
  piPort: number;
  dev: boolean;
  autoShutdown: boolean;
  shutdownIdleSeconds: number;
  tunnel: boolean;
  tunnelReservedToken?: string;
  authConfig?: AuthConfig;
}

export interface DashboardServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sessionManager: SessionManager;
  eventStore: EventStore;
  browserGateway: BrowserGateway;
}

export async function createServer(config: ServerConfig): Promise<DashboardServer> {
  const stateStore = createStateStore();
  const sessionManager = createMemorySessionManager(stateStore);
  const sessionPersistence = createSessionPersistence();
  const sessionOrderManager = createSessionOrderManager(stateStore);
  const pendingForkRegistry = createPendingForkRegistry();

  // Restore persisted sessions from previous server run
  // Mark non-ended sessions as disconnected — no bridge is connected after restart.
  // When a bridge reconnects, register() will merge and set status back to "active".
  // Enrich with stats from session files if persisted stats are missing.
  for (const session of sessionPersistence.load()) {
    const restored = { ...session, dataUnavailable: true };
    if (restored.status !== "ended") {
      restored.status = "ended";
      restored.endedAt = restored.endedAt ?? Date.now();
    }
    // Enrich with stats from session file if cost or context data is missing
    const needsEnrichment = !(restored.cost && restored.cost > 0) || restored.contextTokens === undefined;
    if (restored.sessionFile && needsEnrichment) {
      try {
        const stats = extractSessionStats(restored.sessionFile);
        if (stats) {
          restored.tokensIn = stats.tokensIn;
          restored.tokensOut = stats.tokensOut;
          restored.cacheRead = stats.cacheRead;
          restored.cacheWrite = stats.cacheWrite;
          restored.cost = stats.cost;
          if (!restored.model && stats.model) restored.model = stats.model;
          if (!restored.thinkingLevel && stats.thinkingLevel) restored.thinkingLevel = stats.thinkingLevel;
          if (stats.lastTotalTokens) restored.contextTokens = stats.lastTotalTokens;
          if (stats.contextWindow) restored.contextWindow = stats.contextWindow;
        }
      } catch { /* ignore — stats are nice-to-have */ }
    }
    sessionManager.restore(restored);
  }

  // Save sessions to disk on any change
  sessionManager.onChange = () => {
    sessionPersistence.save(sessionManager.listAll());
  };

  const directoryService = createDirectoryService(stateStore, sessionManager);

  const piGateway = createPiGateway(sessionManager);

  // Create event store with pinning callback
  const eventStore = createMemoryEventStore(
    (sessionId) =>
      piGateway.isSessionConnected(sessionId) ||
      browserGateway.getSubscriberCount(sessionId) > 0,
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

  const browserGateway = createBrowserGateway(sessionManager, eventStore, piGateway, undefined, pendingForkRegistry, sessionOrderManager, stateStore, directoryService, terminalManager);

  // Broadcast placeholder session to browsers when auto-created from early events
  piGateway.onSessionCreated = (sessionId) => {
    const session = sessionManager.get(sessionId);
    if (session) {
      browserGateway.broadcastSessionAdded(session);
    }
  };

  // Broadcast session ended to browsers when sessions are unregistered
  // (heartbeat timeout in pi-gateway, ~45s after disconnect)
  sessionManager.onUnregister = (sessionId) => {
    const session = sessionManager.get(sessionId);
    if (session) {
      browserGateway.broadcastSessionUpdated(sessionId, {
        status: "ended",
        endedAt: session.endedAt,
        currentTool: null,
      });
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
        // Handle flow_agent_complete increment: sentinel -1 means "increment by 1"
        if (updates.flowAgentsDone === -1) {
          const session = sessionManager.get(sessionId);
          updates.flowAgentsDone = (session?.flowAgentsDone ?? 0) + 1;
        }
        sessionManager.update(sessionId, updates);
        browserGateway.broadcastSessionUpdated(sessionId, updates);
      }
    }
    if (msg.type === "session_register") {
      // Always clear events — bridge replays full session history after registering
      eventStore.deleteEventsForSession(sessionId);
      // Force visible + clear dataUnavailable — active sessions must always be visible
      sessionManager.update(sessionId, { hidden: false, dataUnavailable: false });

      // When pi continues a session via --session, it reuses the same JSONL file
      // but creates a new session ID. Clear sessionFile from any other session
      // that points to the same file so stale sessions can't resume the wrong content.
      if (msg.sessionFile) {
        for (const other of sessionManager.listAll()) {
          if (other.id !== sessionId && other.sessionFile === msg.sessionFile) {
            sessionManager.update(other.id, { sessionFile: undefined });
            browserGateway.broadcastSessionUpdated(other.id, { sessionFile: null });
          }
        }
      }
      // Link headless PID to session ID (if spawned from dashboard)
      browserGateway.headlessPidRegistry.linkSession(sessionId, msg.cwd);

      // Insert into session order — check for pending fork to place after parent
      const forkParent = pendingForkRegistry.consumeFork(msg.cwd);
      sessionOrderManager.insert(msg.cwd, sessionId, forkParent ?? undefined);

      // Carry over attachedProposal only for forked/resumed sessions (not brand new spawns)
      if (forkParent) {
        const session = sessionManager.get(sessionId);
        if (session && !session.attachedProposal) {
          const donor = sessionManager.listAll().find(
            (s) => s.id !== sessionId && s.cwd === msg.cwd && s.status === "ended" && s.attachedProposal,
          );
          if (donor?.attachedProposal) {
            sessionManager.update(sessionId, { attachedProposal: donor.attachedProposal });
          }
        }
      }

      // Broadcast order update
      const validIds = new Set(sessionManager.listAll().filter((s) => s.cwd === msg.cwd).map((s) => s.id));
      const order = sessionOrderManager.getOrder(msg.cwd, validIds);
      browserGateway.broadcastToAll({ type: "sessions_reordered", cwd: msg.cwd, sessionIds: order });

      const updatedSession = sessionManager.get(sessionId);
      if (updatedSession) {
        browserGateway.broadcastSessionAdded(updatedSession);
      }

      // Trigger directory discovery for new cwd (async, non-blocking)
      const isNewCwd = !sessionManager.listAll().some(
        (s) => s.id !== sessionId && s.cwd === msg.cwd,
      );
      if (isNewCwd) {
        directoryService.onDirectoryAdded(msg.cwd).then(({ sessions, openspecData }) => {
          for (const hist of sessions) {
            if (!sessionManager.get(hist.id)) {
              sessionManager.register({
                id: hist.id,
                cwd: hist.cwd,
                name: hist.name,
                source: "tui",
                sessionFile: hist.sessionFile,
                sessionDir: hist.sessionDir,
                firstMessage: hist.firstMessage,
                startedAt: hist.startedAt,
              });
              sessionManager.unregister(hist.id);
              sessionManager.update(hist.id, { hidden: true });
              const s = sessionManager.get(hist.id);
              if (s) browserGateway.broadcastSessionAdded(s);
            }
          }
          browserGateway.broadcastToAll({
            type: "openspec_update",
            cwd: msg.cwd,
            data: openspecData,
          } as any);
        }).catch(() => {});
      }

      // Flush pending auto-resume prompt if one exists for this cwd
      const pendingResume = browserGateway.pendingResumeRegistry.consume(msg.cwd);
      if (pendingResume) {
        // Forward the queued prompt to the resumed session
        piGateway.sendToSession(sessionId, {
          type: "send_prompt",
          sessionId,
          text: pendingResume.text,
          images: pendingResume.images,
        });
        // Clear resuming flag — register() already set status="active" and hidden=false
        // No navigation needed: pi --session reuses the same session ID
        sessionManager.update(sessionId, { resuming: false });
        browserGateway.broadcastSessionUpdated(sessionId, { resuming: false });
      }
    }
    // session_history_sync removed — server discovers sessions directly via DirectoryService
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
    if (msg.type === "flows_list") {
      console.log(`[dashboard] flows_list received for ${sessionId}, ${msg.flows?.length} flows`);
      browserGateway.sendToSubscribers(sessionId, {
        type: "flows_list",
        sessionId,
        flows: msg.flows,
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
    // openspec_update from bridge is ignored — server handles polling directly via DirectoryService
    if (msg.type === "openspec_activity_update") {
      const activityUpdates: Partial<import("../shared/types.js").DashboardSession> = {};
      if (msg.phase !== undefined) activityUpdates.openspecPhase = msg.phase;
      if (msg.changeName !== undefined) activityUpdates.openspecChange = msg.changeName;

      // Apply updates first so we can check accumulated state
      sessionManager.update(sessionId, activityUpdates);

      // Auto-attach: when both phase and changeName are accumulated and no proposal is attached
      const session = sessionManager.get(sessionId);
      const attachUpdates: Partial<import("../shared/types.js").DashboardSession> = {};
      if (session?.openspecPhase && session?.openspecChange && !session.attachedProposal) {
        attachUpdates.attachedProposal = session.openspecChange;
        // Auto-name if session name is empty
        if (!session.name?.trim()) {
          attachUpdates.name = session.openspecChange;
          piGateway.sendToSession(sessionId, {
            type: "rename_session",
            sessionId,
            name: session.openspecChange,
          });
        }
        sessionManager.update(sessionId, attachUpdates);
      }

      browserGateway.broadcastSessionUpdated(sessionId, {
        openspecPhase: msg.phase ?? null,
        openspecChange: msg.changeName ?? null,
        ...(attachUpdates.attachedProposal !== undefined ? { attachedProposal: attachUpdates.attachedProposal } : {}),
        ...(attachUpdates.name !== undefined ? { name: attachUpdates.name } : {}),
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
    if (msg.type === "extension_ui_request") {
      const tracked = browserGateway.trackUiRequest(sessionId, msg.requestId, msg.method, msg.params);
      if (tracked !== false) {
        browserGateway.sendToSubscribers(sessionId, {
          type: "extension_ui_request",
          sessionId,
          requestId: msg.requestId,
          method: msg.method,
          params: msg.params,
        });
      }
    }
    if (msg.type === "extension_ui_dismiss") {
      browserGateway.sendToSubscribers(sessionId, {
        type: "ui_dismiss",
        sessionId,
        requestId: msg.requestId,
      });
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
        const updates: Record<string, unknown> = {
          tokensIn: session.tokensIn,
          tokensOut: session.tokensOut,
          cacheRead: session.cacheRead,
          cacheWrite: session.cacheWrite,
          cost: session.cost,
        };
        if (session.contextTokens !== undefined) updates.contextTokens = session.contextTokens;
        if (session.contextWindow !== undefined) updates.contextWindow = session.contextWindow;
        browserGateway.broadcastSessionUpdated(sessionId, updates);
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

    // load_session_events_result and load_session_events_error removed — server loads directly
  };

  // Auto-shutdown idle timer with sleep-wake resilience
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let stopServer: (() => Promise<void>) | null = null;
  let lastConnectionTimestamp = 0;

  function startIdleTimer() {
    if (!config.autoShutdown) return;
    cancelIdleTimer();
    idleTimer = setTimeout(async () => {
      // Double-check: verify truly idle before exiting (prevents false shutdown after sleep/wake)
      const realIdleMs = Date.now() - lastConnectionTimestamp;
      if (piGateway.connectionCount() > 0 || realIdleMs < config.shutdownIdleSeconds * 1000) {
        // Sessions reconnected or not truly idle — restart timer
        startIdleTimer();
        return;
      }
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
    lastConnectionTimestamp = Date.now();
    cancelIdleTimer();
  };

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

  fastify.get("/api/pinned-dirs", async () => {
    return { success: true, data: stateStore.getPinnedDirectories() } satisfies ApiResponse;
  });

  // Directory browse endpoint (localhost-only)
  fastify.get<{ Querystring: { path?: string } }>(
    "/api/browse",
    { preHandler: localhostGuard },
    async (request) => {
      try {
        const result = await listDirectories(request.query.path || undefined);
        return { success: true, data: result } satisfies ApiResponse;
      } catch {
        return { success: false, error: "directory not found" } satisfies ApiResponse;
      }
    }
  );

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

  // File read endpoint (localhost-only) — read file content or list directory
  fastify.get<{ Querystring: { cwd?: string; path?: string } }>(
    "/api/file",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      const relPath = request.query.path;
      if (!cwd || !relPath) {
        reply.code(400);
        return { success: false, error: "cwd and path parameters required" } satisfies ApiResponse;
      }

      const allSessions = sessionManager.listAll();
      if (!allSessions.some((s) => s.cwd === cwd)) {
        reply.code(403);
        return { success: false, error: "unknown session path" } satisfies ApiResponse;
      }

      const resolved = path.resolve(cwd, relPath);
      if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
        reply.code(403);
        return { success: false, error: "path outside working directory" } satisfies ApiResponse;
      }

      try {
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          const entries = await fs.readdir(resolved);
          entries.sort();
          return { success: true, data: { type: "directory", entries } } satisfies ApiResponse;
        }
        const content = await fs.readFile(resolved, "utf-8");
        return { success: true, data: { type: "file", content } } satisfies ApiResponse;
      } catch {
        reply.code(404);
        return { success: false, error: "not found" } satisfies ApiResponse;
      }
    }
  );

  // Pi Resources endpoint (localhost-only) — returns discovered extensions, skills, prompts
  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/pi-resources",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd parameter required" } satisfies ApiResponse;
      }
      // Return cached result or scan on-demand
      let data = directoryService.getPiResources(cwd);
      if (!data) {
        data = await directoryService.refreshPiResources(cwd);
      }
      return { success: true, data } satisfies ApiResponse;
    },
  );

  // Pi Resource file endpoint (localhost-only) — reads files from allowed pi resource locations
  fastify.get<{ Querystring: { path?: string } }>(
    "/api/pi-resource-file",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const filePath = request.query.path;
      if (!filePath) {
        reply.code(400);
        return { success: false, error: "path parameter required" } satisfies ApiResponse;
      }

      // Validate path is within allowed pi resource locations
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const globalPiDir = path.join(homeDir, ".pi", "agent");
      const allSessions = sessionManager.listAll();
      const knownCwds = new Set(allSessions.map((s) => s.cwd));
      for (const dir of stateStore.getPinnedDirectories()) knownCwds.add(dir);

      const normalizedPath = path.resolve(filePath);
      const isAllowed =
        normalizedPath.startsWith(globalPiDir + path.sep) ||
        [...knownCwds].some(
          (cwd) =>
            normalizedPath.startsWith(path.join(cwd, ".pi") + path.sep),
        ) ||
        // Allow reading from resolved package locations (npm global, git clones)
        normalizedPath.includes(path.join(".pi", "git") + path.sep) ||
        normalizedPath.includes("node_modules" + path.sep);

      if (!isAllowed) {
        reply.code(403);
        return { success: false, error: "path not in allowed resource location" } satisfies ApiResponse;
      }

      try {
        const content = await fs.readFile(normalizedPath, "utf-8");
        return { success: true, data: { type: "file", content } } satisfies ApiResponse;
      } catch {
        reply.code(404);
        return { success: false, error: "not found" } satisfies ApiResponse;
      }
    },
  );

  // Config endpoints (localhost-only)
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
      const reloaded = (await import("../shared/config.js")).loadConfig();
      if (partial.autoShutdown !== undefined || partial.shutdownIdleSeconds !== undefined) {
        config.autoShutdown = reloaded.autoShutdown;
        config.shutdownIdleSeconds = reloaded.shutdownIdleSeconds;
      }
      if (partial.auth !== undefined) {
        config.authConfig = reloaded.auth;
        // Rebuild auth provider registry if plugin is registered
        if (reloaded.auth && (fastify as any)._reloadAuth) {
          await (fastify as any)._reloadAuth(reloaded.auth);
        }
      }

      return { success: true, restartRequired: result.restartRequired };
    },
  );

  // Tunnel status endpoint
  fastify.get("/api/tunnel-status", async () => {
    return getTunnelStatus();
  });

  // Tunnel connect endpoint
  fastify.post("/api/tunnel-connect", async () => {
    const status = getTunnelStatus();
    if (status.status === "active") return { ok: true, url: status.url };
    if (status.status === "unavailable") return { ok: false, error: "zrok not installed" };
    const url = await createTunnel(config.port, config.tunnelReservedToken);
    if (url) return { ok: true, url };
    return { ok: false, error: "Failed to create tunnel" };
  });

  // Tunnel disconnect endpoint
  fastify.post("/api/tunnel-disconnect", async () => {
    await deleteTunnel();
    return { ok: true };
  });

  // Health endpoint — liveness check for CLI status and probing
  const serverStartTime = Date.now();
  // ── Git Operations (localhost-only) ──────────────────────────────────

  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/git/branches",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd parameter required" } satisfies ApiResponse;
      }
      if (!isGitRepo(cwd)) {
        return { success: false, error: "not a git repository" } satisfies ApiResponse;
      }
      try {
        const data = listBranches(cwd);
        return { success: true, data } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "failed to list branches" } satisfies ApiResponse;
      }
    }
  );

  fastify.post<{ Body: { cwd?: string; branch?: string; stash?: boolean } }>(
    "/api/git/checkout",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const { cwd, branch, stash } = request.body ?? {};
      if (!cwd || !branch) {
        reply.code(400);
        return { success: false, error: "cwd and branch required" } satisfies ApiResponse;
      }
      try {
        const result = checkoutBranch(cwd, branch, stash ?? false);
        if (!result.success) {
          reply.code(409);
          return result;
        }
        return { success: true, data: { stashed: result.stashed } } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "checkout failed" } satisfies ApiResponse;
      }
    }
  );

  fastify.post<{ Body: { cwd?: string } }>(
    "/api/git/init",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const { cwd } = request.body ?? {};
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd required" } satisfies ApiResponse;
      }
      try {
        gitInit(cwd);
        return { success: true } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "init failed" } satisfies ApiResponse;
      }
    }
  );

  fastify.post<{ Body: { cwd?: string } }>(
    "/api/git/stash-pop",
    { preHandler: localhostGuard },
    async (request, reply) => {
      const { cwd } = request.body ?? {};
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd required" } satisfies ApiResponse;
      }
      try {
        const result = stashPop(cwd);
        return { success: true, data: result } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "stash pop failed" } satisfies ApiResponse;
      }
    }
  );

  fastify.get("/api/health", async () => {
    return {
      ok: true,
      pid: process.pid,
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    };
  });

  // Shutdown endpoint (localhost-only) — used by devBuildOnReload
  // Skips server.stop() to avoid killing headless/spawned sessions.
  // Just exits the process; the OS cleans up sockets.
  fastify.post(
    "/api/shutdown",
    { preHandler: localhostGuard },
    async () => {
      // Flush persistence before exit to avoid losing recent changes
      sessionPersistence.flush();
      stateStore.flush();
      setTimeout(() => process.exit(0), 100);
      return { ok: true };
    }
  );

  // Serve static files (built web client) in production
  if (!config.dev) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDir = path.join(__dirname, "../../dist/client");
    await fastify.register(fastifyStatic, {
      root: clientDir,
      prefix: "/",
      setHeaders: (res, filePath) => {
        // No-cache for HTML (so browser always gets latest asset references)
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    });

    // SPA fallback: serve index.html for client-side routes
    fastify.setNotFoundHandler(async (_request, reply) => {
      reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
      return reply.sendFile("index.html");
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

      // Start directory service: discover sessions and begin OpenSpec polling (async, non-blocking)
      (async () => {
        try {
          const dirs = directoryService.knownDirectories();
          for (const cwd of dirs) {
            const discovered = directoryService.discoverSessions(cwd);
            for (const hist of discovered) {
              if (!sessionManager.get(hist.id)) {
                // Restore discovered sessions directly as ended+hidden
                // (no register/unregister dance that triggers spurious broadcasts)
                const needsStats = true;
                let contextTokens: number | undefined;
                let contextWindow: number | undefined;
                let model: string | undefined;
                if (needsStats && hist.sessionFile) {
                  try {
                    const stats = extractSessionStats(hist.sessionFile);
                    if (stats) {
                      contextTokens = stats.lastTotalTokens;
                      contextWindow = stats.contextWindow;
                      model = stats.model;
                    }
                  } catch { /* ignore */ }
                }
                sessionManager.restore({
                  id: hist.id,
                  cwd: hist.cwd,
                  name: hist.name,
                  source: "tui",
                  status: "ended",
                  startedAt: hist.startedAt,
                  sessionFile: hist.sessionFile,
                  sessionDir: hist.sessionDir,
                  firstMessage: hist.firstMessage,
                  hidden: true,
                  dataUnavailable: true,
                  model,
                  contextTokens,
                  contextWindow,
                });
                const session = sessionManager.get(hist.id);
                if (session) browserGateway.broadcastSessionAdded(session);
              }
            }
          }
        } catch (err) {
          console.error("[dashboard] Session discovery failed:", err);
        }

        // Start OpenSpec polling, broadcast changes to browsers
        directoryService.startPolling((cwd, data) => {
          browserGateway.broadcastToAll({
            type: "openspec_update",
            cwd,
            data,
          } as any);
        });

        // Initial OpenSpec poll for all known directories (non-blocking)
        await Promise.all(
          directoryService.knownDirectories().map((cwd) => directoryService.refreshOpenSpec(cwd)),
        );
      })();

      startIdleTimer();
    },

    async stop() {
      removePid();
      cancelIdleTimer();
      directoryService.stopPolling();
      browserGateway.shutdownHeadlessProcesses();
      sessionPersistence.flush();
      sessionPersistence.dispose();
      pendingForkRegistry.dispose();
      stateStore.flush();
      stateStore.dispose();

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

  stopServer = server.stop.bind(server);
  return server;
}
