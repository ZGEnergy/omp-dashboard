/**
 * Pi Gateway - WebSocket server for bridge extension connections.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { ExtensionToServerMessage, ServerToExtensionMessage } from "../shared/protocol.js";
import type { DashboardSession } from "../shared/types.js";
import type { SessionManager } from "./memory-session-manager.js";

export const HEARTBEAT_TIMEOUT = 45_000;

export interface PiGatewayOptions {
  heartbeatTimeout?: number;
}

export interface PiGateway {
  start(port: number): void;
  stop(): void;
  sendToSession(sessionId: string, msg: ServerToExtensionMessage): boolean;
  connectionCount(): number;
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
  options?: PiGatewayOptions,
): PiGateway {
  const hbTimeout = options?.heartbeatTimeout ?? HEARTBEAT_TIMEOUT;
  let wss: WebSocketServer | null = null;

  // Map sessionId → WebSocket
  const connections = new Map<string, WebSocket>();
  // Map sessionId → heartbeat timeout
  const heartbeatTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Map sessionId → { setAt: timestamp, sleepRetried: boolean } for sleep detection
  const heartbeatMeta = new Map<string, { setAt: number; sleepRetried: boolean }>();

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

    const now = Date.now();
    heartbeatMeta.set(sessionId, { setAt: now, sleepRetried: false });

    heartbeatTimers.set(
      sessionId,
      setTimeout(() => {
        const meta = heartbeatMeta.get(sessionId);
        const elapsed = Date.now() - (meta?.setAt ?? now);

        // Detect sleep: elapsed >> expected means system was suspended
        if (meta && !meta.sleepRetried && elapsed > hbTimeout * 2) {
          // Give one more cycle for the extension to reconnect
          meta.sleepRetried = true;
          meta.setAt = Date.now();
          heartbeatTimers.set(
            sessionId,
            setTimeout(() => {
              sessionManager.unregister(sessionId);
              connections.delete(sessionId);
              heartbeatTimers.delete(sessionId);
              heartbeatMeta.delete(sessionId);
              checkEmpty();
            }, hbTimeout),
          );
          return;
        }

        sessionManager.unregister(sessionId);
        connections.delete(sessionId);
        heartbeatTimers.delete(sessionId);
        heartbeatMeta.delete(sessionId);
        checkEmpty();
      }, hbTimeout)
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
              const sid: string = (msg as any).sessionId;
              currentSessionId = sid;
              connections.set(sid, ws);
              // Auto-create a placeholder session so events aren't lost
              if (!sessionManager.get(sid)) {
                sessionManager.register({
                  id: sid,
                  cwd: "",
                  source: "unknown",
                });
                onSessionCreated?.(sid);
              }
              resetHeartbeat(sid);
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
              heartbeatMeta.delete(msg.sessionId);
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

            // session_history_sync removed — server discovers sessions via DirectoryService

            if (msg.type === "stats_update") {
              const session = sessionManager.get(msg.sessionId);
              if (session) {
                const updates: Partial<DashboardSession> = {
                  tokensIn: (session.tokensIn ?? 0) + (msg.stats.tokensIn ?? 0),
                  tokensOut: (session.tokensOut ?? 0) + (msg.stats.tokensOut ?? 0),
                  cacheRead: (session.cacheRead ?? 0) + (msg.stats.turnUsage?.cacheRead ?? 0),
                  cacheWrite: (session.cacheWrite ?? 0) + (msg.stats.turnUsage?.cacheWrite ?? 0),
                  cost: (session.cost ?? 0) + (msg.stats.cost ?? 0),
                };
                // Store context usage on the session for persistence
                if (msg.stats.contextUsage) {
                  updates.contextTokens = msg.stats.contextUsage.tokens;
                  updates.contextWindow = msg.stats.contextUsage.contextWindow;
                }
                sessionManager.update(msg.sessionId, updates);
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
      heartbeatMeta.clear();
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

    connectionCount(): number {
      return connections.size;
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
