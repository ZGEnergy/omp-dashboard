/**
 * Pure in-memory session registry.
 * Replaces SQLite-backed session-manager.ts.
 */
import type { DashboardSession, SessionSource, SessionStatus } from "../shared/types.js";
import type { StateStore } from "./state-store.js";

export interface RegisterSessionParams {
  id: string;
  cwd: string;
  name?: string;
  source: SessionSource;
  model?: string;
  thinkingLevel?: string;
  sessionFile?: string;
  sessionDir?: string;
  firstMessage?: string;
  startedAt?: number;
}

export interface SessionManager {
  register(params: RegisterSessionParams): DashboardSession;
  /** Restore a previously persisted session (e.g. on startup). Does not trigger onChange. */
  restore(session: DashboardSession): void;
  unregister(sessionId: string): void;
  update(sessionId: string, updates: Partial<DashboardSession>): void;
  get(sessionId: string): DashboardSession | undefined;
  listActive(): DashboardSession[];
  listAll(): DashboardSession[];
  /** Called after any mutation (register, unregister, update). */
  onChange?: () => void;
}

export function createMemorySessionManager(
  stateStore: StateStore,
): SessionManager {
  const sessions = new Map<string, DashboardSession>();

  const mgr: SessionManager = {
    register(params: RegisterSessionParams): DashboardSession {
      // Preserve accumulated data (tokens, cost) from a prior session with the
      // same ID (e.g. restored after server restart). Git and openspec data are
      // polled by the bridge extension shortly after reconnect, so they don't
      // need to be carried over.
      const existing = sessions.get(params.id);

      const session: DashboardSession = {
        // Carry over accumulated data from the existing session (e.g. restored after restart)
        ...(existing ? {
          tokensIn: existing.tokensIn,
          tokensOut: existing.tokensOut,
          cacheRead: existing.cacheRead,
          cacheWrite: existing.cacheWrite,
          cost: existing.cost,
          // Preserve user-set openspec assignment (not polled, set via dashboard UI)
          attachedProposal: existing.attachedProposal,
          // Preserve context usage until bridge sends fresh data
          contextTokens: existing.contextTokens,
          contextWindow: existing.contextWindow,
        } : {
          tokensIn: 0,
          tokensOut: 0,
          cost: 0,
        }),
        // Apply registration params (always override)
        id: params.id,
        cwd: params.cwd,
        name: params.name ?? existing?.name,
        source: params.source,
        status: "active",
        model: params.model,
        thinkingLevel: params.thinkingLevel,
        startedAt: params.startedAt ?? existing?.startedAt ?? Date.now(),
        endedAt: undefined,
        sessionFile: params.sessionFile,
        sessionDir: params.sessionDir,
        hidden: false,
        firstMessage: params.firstMessage ?? existing?.firstMessage,
        dataUnavailable: false,
      };
      // Clear hidden state on register — active sessions should always be visible
      stateStore.setHidden(params.id, false);
      sessions.set(params.id, session);
      mgr.onChange?.();
      return session;
    },

    restore(session: DashboardSession): void {
      sessions.set(session.id, session);
    },

    unregister(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (session) {
        session.status = "ended";
        session.endedAt = Date.now();
        mgr.onChange?.();
      }
    },

    update(sessionId: string, updates: Partial<DashboardSession>): void {
      const session = sessions.get(sessionId);
      if (session) {
        Object.assign(session, updates);
        // Persist hidden state changes
        if (updates.hidden !== undefined) {
          stateStore.setHidden(sessionId, updates.hidden);
        }
        mgr.onChange?.();
      }
    },

    get(sessionId: string): DashboardSession | undefined {
      return sessions.get(sessionId);
    },

    listActive(): DashboardSession[] {
      return Array.from(sessions.values()).filter((s) => s.status !== "ended");
    },

    listAll(): DashboardSession[] {
      return Array.from(sessions.values());
    },
  };

  return mgr;
}
