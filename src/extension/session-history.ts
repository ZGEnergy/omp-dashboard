/**
 * Session history sync — sends local pi session history to the dashboard server.
 */
import type { SessionHistorySyncMessage } from "../shared/protocol.js";

export interface SessionHistoryDeps {
  send: (msg: SessionHistorySyncMessage) => void;
  cwd: string;
}

export async function sendSessionHistory(deps: SessionHistoryDeps): Promise<void> {
  try {
    const mod = await import("@mariozechner/pi-coding-agent") as any;
    const SM = mod.SessionManager;
    const sessions = await SM.list(deps.cwd);
    if (sessions.length === 0) return;
    deps.send({
      type: "session_history_sync",
      sessions: sessions.map((s: any) => ({
        id: s.id,
        cwd: s.cwd,
        name: s.name,
        startedAt: s.created.getTime(),
        firstMessage: s.firstMessage || undefined,
        sessionFile: s.path,
        sessionDir: undefined,
      })),
    });
  } catch {
    // Silent failure — history sync is best-effort
  }
}
