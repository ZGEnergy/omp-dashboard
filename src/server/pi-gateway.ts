/**
 * Pi Gateway - WebSocket server for bridge extension connections.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { ExtensionToServerMessage, ServerToExtensionMessage } from "../shared/protocol.js";
import type { SessionManager } from "./memory-session-manager.js";

const HEARTBEAT_TIMEOUT = 45_000;

export interface PiGateway {
  start(port: number): void;
  stop(): void;
  sendToSession(sessionId: string, msg: ServerToExtensionMessage): boolean;
  findSessionByCwd(cwd: string): string | undefined;
  isSessionConnected(sessionId: string): boolean;
  onEvent?: (sessionId: string, msg: ExtensionToServerMessage) => void;
  onEmpty?: () => void;
  onConnection?: () => void;
  onDisconnect?: (sessionId: string) => void;
  onSessionCreated?: (sessionId: string) => void;
}

export function createPiGateway(
  sessionManager: SessionManager,
): PiGateway {
  let wss: WebSocketServer | null = null;

  // Map sessionId → WebSocket
  const connections = new Map<string, WebSocket>();
  // Map sessionId → heartbeat timeout
  const heartbeatTimers = new Map<string, ReturnType<typeof setTimeout>>();

  let onEvent: ((sessionId: string, msg: ExtensionToServerMessage) => void) | undefined;
  let onEmpty: (() => void) | undefined;
  let onConnection: (() => void) | undefined;
  let onDisconnect: ((sessionId: string) => void) | undefined;
  let onSessionCreated: ((sessionId: string) => void) | undefined;

  function checkEmpty() {
    if (connections.size === 0) {
      onEmpty?.();
    }
  }

  function resetHeartbeat(sessionId: string) {
    const existing = heartbeatTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    heartbeatTimers.set(
      sessionId,
      setTimeout(() => {
        sessionManager.unregister(sessionId);
        connections.delete(sessionId);
        heartbeatTimers.delete(sessionId);
        checkEmpty();
      }, HEARTBEAT_TIMEOUT)
    );
  }

  return {
    set onEvent(handler: ((sessionId: string, msg: ExtensionToServerMessage) => void) | undefined) {
      onEvent = handler;
    },

    set onEmpty(handler: (() => void) | undefined) {
      onEmpty = handler;
    },

    set onConnection(handler: (() => void) | undefined) {
      onConnection = handler;
    },

    set onDisconnect(handler: ((sessionId: string) => void) | undefined) {
      onDisconnect = handler;
    },

    set onSessionCreated(handler: ((sessionId: string) => void) | undefined) {
      onSessionCreated = handler;
    },

    start(port: number) {
      wss = new WebSocketServer({ port });

      wss.on("connection", (ws) => {
        let currentSessionId: string | null = null;

        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as ExtensionToServerMessage;

            // Track session identity from any message with a sessionId
            if (!currentSessionId && "sessionId" in msg && (msg as any).sessionId) {
              currentSessionId = (msg as any).sessionId;
              connections.set(currentSessionId, ws);
              // Auto-create a placeholder session so events aren't lost
              if (!sessionManager.get(currentSessionId)) {
                sessionManager.register({
                  id: currentSessionId,
                  cwd: "",
                  source: "unknown",
                });
                onSessionCreated?.(currentSessionId);
              }
              resetHeartbeat(currentSessionId);
              onConnection?.();
            }

            if (msg.type === "session_register") {
              // If session ID changed (e.g., after /reload), clean up the old placeholder
              if (currentSessionId && currentSessionId !== msg.sessionId) {
                const oldSession = sessionManager.get(currentSessionId);
                if (oldSession && oldSession.source === "unknown") {
                  sessionManager.unregister(currentSessionId);
                  connections.delete(currentSessionId);
                }
              }
              currentSessionId = msg.sessionId;
              connections.set(msg.sessionId, ws);

              sessionManager.register({
                id: msg.sessionId,
                cwd: msg.cwd,
                name: msg.name,
                source: msg.source,
                model: msg.model,
                thinkingLevel: msg.thinkingLevel,
                sessionFile: msg.sessionFile,
                sessionDir: msg.sessionDir,
                firstMessage: msg.firstMessage,
              });

              resetHeartbeat(msg.sessionId);
              onConnection?.();
            }

            if (msg.type === "session_heartbeat" && msg.sessionId) {
              resetHeartbeat(msg.sessionId);
            }

            if (msg.type === "session_unregister" && msg.sessionId) {
              sessionManager.unregister(msg.sessionId);
              connections.delete(msg.sessionId);
              const timer = heartbeatTimers.get(msg.sessionId);
              if (timer) {
                clearTimeout(timer);
                heartbeatTimers.delete(msg.sessionId);
              }
              checkEmpty();
            }

            if (msg.type === "model_update") {
              const session = sessionManager.get(msg.sessionId);
              if (session) {
                const updates: Partial<typeof session> = { model: msg.model };
                if (msg.thinkingLevel !== undefined) {
                  updates.thinkingLevel = msg.thinkingLevel;
                }
                sessionManager.update(msg.sessionId, updates);
              }
            }

            if (msg.type === "session_history_sync") {
              for (const hist of msg.sessions) {
                // Never hide the bridge's own active session
                if (hist.id === currentSessionId) continue;
                // Skip already known sessions
                if (sessionManager.get(hist.id)) continue;
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
                // Mark as ended + hidden immediately
                sessionManager.update(hist.id, {
                  status: "ended",
                  endedAt: hist.startedAt,
                  hidden: true,
                });
              }
            }

            if (msg.type === "stats_update") {
              const session = sessionManager.get(msg.sessionId);
              if (session) {
                sessionManager.update(msg.sessionId, {
                  tokensIn: (session.tokensIn ?? 0) + (msg.stats.tokensIn ?? 0),
                  tokensOut: (session.tokensOut ?? 0) + (msg.stats.tokensOut ?? 0),
                  cacheRead: (session.cacheRead ?? 0) + (msg.stats.turnUsage?.cacheRead ?? 0),
                  cacheWrite: (session.cacheWrite ?? 0) + (msg.stats.turnUsage?.cacheWrite ?? 0),
                  cost: (session.cost ?? 0) + (msg.stats.cost ?? 0),
                });
              }
            }

            // Notify listeners
            const eventSessionId = "sessionId" in msg ? (msg as any).sessionId : undefined;
            onEvent?.(eventSessionId ?? currentSessionId ?? "", msg);
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on("close", () => {
          if (currentSessionId) {
            // Don't immediately unregister - wait for heartbeat timeout
            // This handles temporary disconnects
            onDisconnect?.(currentSessionId);
          }
        });
      });
    },

    stop() {
      for (const timer of heartbeatTimers.values()) {
        clearTimeout(timer);
      }
      heartbeatTimers.clear();
      // Forcibly terminate all extension connections
      for (const ws of connections.values()) {
        ws.terminate();
      }
      connections.clear();
      wss?.close();
      wss = null;
    },

    sendToSession(sessionId: string, msg: ServerToExtensionMessage): boolean {
      const ws = connections.get(sessionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    },

    isSessionConnected(sessionId: string): boolean {
      const ws = connections.get(sessionId);
      return ws !== undefined && ws.readyState === WebSocket.OPEN;
    },

    findSessionByCwd(cwd: string): string | undefined {
      // Find a connected session whose cwd matches or is a prefix
      for (const sid of connections.keys()) {
        const session = sessionManager.get(sid);
        if (session && (session.cwd === cwd || session.cwd.startsWith(cwd + "/") || cwd.startsWith(session.cwd + "/"))) {
          return sid;
        }
      }
      return undefined;
    },
  };
}
