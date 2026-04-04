/**
 * Event wiring: connects pi gateway events to browser gateway and session management.
 * Extracted from server.ts for clarity.
 */
import type { SessionManager } from "./memory-session-manager.js";
import type { EventStore } from "./memory-event-store.js";
import type { PiGateway } from "./pi-gateway.js";
import type { BrowserGateway } from "./browser-gateway.js";
import type { SessionOrderManager } from "./session-order-manager.js";
import type { PendingForkRegistry } from "./pending-fork-registry.js";
import type { DirectoryService } from "./directory-service.js";
import { extractSessionUpdates } from "./event-status-extraction.js";
import { writeSessionMeta } from "../shared/session-meta.js";
import type { DashboardSession } from "../shared/types.js";

export interface EventWiringDeps {
  sessionManager: SessionManager;
  eventStore: EventStore;
  piGateway: PiGateway;
  browserGateway: BrowserGateway;
  sessionOrderManager: SessionOrderManager;
  pendingForkRegistry: PendingForkRegistry;
  directoryService: DirectoryService;
  knownSessionIds: Set<string>;
  pendingDashboardSpawns: Map<string, number>;
}

/**
 * Wire up all event forwarding from pi gateway to browser gateway.
 * Sets piGateway.onEvent and sessionManager.onUnregister.
 */
export function wireEvents(deps: EventWiringDeps): void {
  const {
    sessionManager,
    eventStore,
    piGateway,
    browserGateway,
    sessionOrderManager,
    pendingForkRegistry,
    directoryService,
    knownSessionIds,
    pendingDashboardSpawns,
  } = deps;

  // Broadcast placeholder session to browsers when auto-created from early events
  piGateway.onSessionCreated = (sessionId) => {
    const session = sessionManager.get(sessionId);
    if (session) {
      browserGateway.broadcastSessionAdded(session);
    }
  };

  // Broadcast session ended to browsers when sessions are unregistered
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

  // Track sessions replaying history — suppress status broadcasts to avoid card flicker
  const replayingSessions = new Set<string>();
  // Debounce flows refresh to prevent infinite loop between sessions in same cwd
  const recentFlowsRefresh = new Set<string>();

  piGateway.onEvent = (sessionId, msg) => {
    if (msg.type === "event_forward") {
      const seq = eventStore.insertEvent(sessionId, msg.event);
      // Skip broadcasting during replay — browser gets events via subscribe replay
      if (!replayingSessions.has(sessionId)) {
        const storedEvent = eventStore.getEvent(sessionId, seq) ?? msg.event;
        browserGateway.broadcastEvent(sessionId, seq, storedEvent);
      }

      const updates = extractSessionUpdates(msg.event);
      if (updates) {
        if (updates.flowAgentsDone === -1) {
          const session = sessionManager.get(sessionId);
          updates.flowAgentsDone = (session?.flowAgentsDone ?? 0) + 1;
        }
        sessionManager.update(sessionId, updates);
        // During replay, accumulate in sessionManager but don't broadcast
        // to avoid rapid status flickers on the session card
        if (!replayingSessions.has(sessionId)) {
          browserGateway.broadcastSessionUpdated(sessionId, updates);
        }
      }
    }

    if (msg.type === "replay_complete") {
      replayingSessions.delete(sessionId);
      // Broadcast the final accumulated status after replay
      const session = sessionManager.get(sessionId);
      if (session) {
        browserGateway.broadcastSessionUpdated(sessionId, {
          status: session.status,
          currentTool: session.currentTool ?? null,
        });
      }
      // Send replayed events to browser subscribers (they were suppressed during replay)
      const storedEvents = eventStore.getEvents(sessionId, 1);
      if (storedEvents.length > 0) {
        browserGateway.sendToSubscribers(sessionId, {
          type: "event_replay",
          sessionId,
          events: storedEvents.map((e) => ({ seq: e.seq, event: e.event })),
          isLast: true,
        } as any);
      }
    }

    if (msg.type === "session_register") {
      replayingSessions.add(sessionId);
      // Safety timeout: clear replay flag after 5s if replay_complete never arrives
      setTimeout(() => {
        if (replayingSessions.delete(sessionId)) {
          const session = sessionManager.get(sessionId);
          if (session) {
            browserGateway.broadcastSessionUpdated(sessionId, {
              status: session.status,
              currentTool: session.currentTool ?? null,
            });
          }
          // Send any accumulated events to browser subscribers
          const fallbackEvents = eventStore.getEvents(sessionId, 1);
          if (fallbackEvents.length > 0) {
            browserGateway.sendToSubscribers(sessionId, {
              type: "event_replay",
              sessionId,
              events: fallbackEvents.map((e) => ({ seq: e.seq, event: e.event })),
              isLast: true,
            } as any);
          }
        }
      }, 5_000);
      eventStore.deleteEventsForSession(sessionId);
      browserGateway.broadcastSessionStateReset(sessionId);
      sessionManager.update(sessionId, { hidden: false, dataUnavailable: false });

      if (msg.sessionFile) {
        for (const other of sessionManager.listAll()) {
          if (other.id !== sessionId && other.sessionFile === msg.sessionFile) {
            sessionManager.update(other.id, { sessionFile: undefined });
            browserGateway.broadcastSessionUpdated(other.id, { sessionFile: null });
          }
        }
      }

      browserGateway.headlessPidRegistry.linkSession(sessionId, msg.cwd);

      const isNewSession = !knownSessionIds.has(sessionId);
      knownSessionIds.add(sessionId);
      const pendingCount = pendingDashboardSpawns.get(msg.cwd) ?? 0;
      if (pendingCount > 0 && isNewSession) {
        if (pendingCount <= 1) pendingDashboardSpawns.delete(msg.cwd);
        else pendingDashboardSpawns.set(msg.cwd, pendingCount - 1);
        sessionManager.update(sessionId, { source: "dashboard" });
        browserGateway.broadcastSessionUpdated(sessionId, { source: "dashboard" });
        if (msg.sessionFile) {
          try {
            writeSessionMeta(msg.sessionFile, { source: "dashboard" });
          } catch { /* best-effort */ }
        }
      }

      const forkParent = pendingForkRegistry.consumeFork(msg.cwd);
      sessionOrderManager.insert(msg.cwd, sessionId, forkParent ?? undefined);

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

      const validIds = new Set(sessionManager.listAll().filter((s) => s.cwd === msg.cwd).map((s) => s.id));
      const order = sessionOrderManager.getOrder(msg.cwd, validIds);
      browserGateway.broadcastToAll({ type: "sessions_reordered", cwd: msg.cwd, sessionIds: order });

      const updatedSession = sessionManager.get(sessionId);
      if (updatedSession) {
        browserGateway.broadcastSessionAdded(updatedSession);
      }

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

      const pendingResume = browserGateway.pendingResumeRegistry.consume(msg.cwd);
      if (pendingResume) {
        piGateway.sendToSession(sessionId, {
          type: "send_prompt",
          sessionId,
          text: pendingResume.text,
          images: pendingResume.images,
        });
        sessionManager.update(sessionId, { resuming: false });
        browserGateway.broadcastSessionUpdated(sessionId, { resuming: false });
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

    if (msg.type === "flows_list") {
      browserGateway.sendToSubscribers(sessionId, {
        type: "flows_list",
        sessionId,
        flows: msg.flows,
      });

      // Tell other connected sessions in the same cwd to rediscover flows
      // (debounced to avoid infinite loop: A→refresh B→B sends flows→refresh A→...)
      if (!recentFlowsRefresh.has(sessionId)) {
        recentFlowsRefresh.add(sessionId);
        setTimeout(() => recentFlowsRefresh.delete(sessionId), 5_000);
        const session = sessionManager.get(sessionId);
        if (session) {
          for (const sid of piGateway.getConnectedSessionIds()) {
            if (sid === sessionId || recentFlowsRefresh.has(sid)) continue;
            const other = sessionManager.get(sid);
            if (other && other.cwd === session.cwd) {
              piGateway.sendToSession(sid, { type: "request_flows_refresh", sessionId: sid });
            }
          }
        }
      }
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

    if (msg.type === "openspec_activity_update") {
      const activityUpdates: Partial<DashboardSession> = {};
      if (msg.phase !== undefined) activityUpdates.openspecPhase = msg.phase;
      if (msg.changeName !== undefined) activityUpdates.openspecChange = msg.changeName;

      sessionManager.update(sessionId, activityUpdates);

      const session = sessionManager.get(sessionId);
      const attachUpdates: Partial<DashboardSession> = {};
      if (session?.openspecPhase && session?.openspecChange && !session.attachedProposal) {
        attachUpdates.attachedProposal = session.openspecChange;
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
      // Broadcast to all browsers (not just subscribers) so model selector
      // is available even before the user opens the session
      browserGateway.broadcastToAll({
        type: "models_list",
        sessionId,
        models: msg.models,
      } as any);
    }

    if (msg.type === "model_update") {
      const modelUpdates: Partial<DashboardSession> = {
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
  };
}
