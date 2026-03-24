/**
 * Pure in-memory session registry.
 * Replaces SQLite-backed session-manager.ts.
 */
import type { DashboardSession, SessionSource, SessionStatus } from "../shared/types.js";
import type { StateStore } from "./state-store.js";
import type { WorkspaceStore } from "./workspace-store.js";

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
  unregister(sessionId: string): void;
  update(sessionId: string, updates: Partial<DashboardSession>): void;
  get(sessionId: string): DashboardSession | undefined;
  listActive(): DashboardSession[];
  listAll(): DashboardSession[];
}

export function createMemorySessionManager(
  stateStore: StateStore,
  workspaceStore: WorkspaceStore,
): SessionManager {
  const sessions = new Map<string, DashboardSession>();

  function matchWorkspace(cwd: string): string | undefined {
    const workspaces = workspaceStore.list();
    // Sort by path length descending for longest prefix match
    const sorted = [...workspaces].sort((a, b) => b.path.length - a.path.length);
    for (const ws of sorted) {
      if (cwd === ws.path || cwd.startsWith(ws.path + "/")) {
        return ws.id;
      }
    }
    return undefined;
  }

  return {
    register(params: RegisterSessionParams): DashboardSession {
      const workspaceId = matchWorkspace(params.cwd);
      const session: DashboardSession = {
        id: params.id,
        cwd: params.cwd,
        name: params.name,
        source: params.source,
        status: "active",
        model: params.model,
        thinkingLevel: params.thinkingLevel,
        workspaceId,
        startedAt: params.startedAt ?? Date.now(),
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        sessionFile: params.sessionFile,
        sessionDir: params.sessionDir,
        hidden: false,
        firstMessage: params.firstMessage,
      };
      // Clear hidden state on register — active sessions should always be visible
      stateStore.setHidden(params.id, false);
      sessions.set(params.id, session);
      return session;
    },

    unregister(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (session) {
        session.status = "ended";
        session.endedAt = Date.now();
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
}
