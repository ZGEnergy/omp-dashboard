/**
 * Pi Gateway - WebSocket server for bridge extension connections.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { ExtensionToServerMessage, ServerToExtensionMessage } from "../shared/protocol.js";
import type { DashboardSession } from "../shared/types.js";
import type { SessionManager } from "./memory-session-manager.js";

export const HEARTBEAT_TIMEOUT = 180_000;
export const WS_PING_INTERVAL = 60_000;

export interface PiGatewayOptions {
  heartbeatTimeout?: number;
  pingInterval?: number;
}

export interface PiGateway {
  start(port: number): void;
  stop(): void;
  sendToSession(sessionId: string, msg: ServerToExtensionMessage): boolean;
  broadcast(msg: ServerToExtensionMessage): void;
  connectionCount(): number;
  findSessionByCwd(cwd: string): string | undefined;
  getConnectedSessionIds(): string[];
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
  const pingMs = options?.pingInterval ?? WS_PING_INTERVAL;
  let wss: WebSocketServer | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  // Map sessionId → WebSocket
  const connections = new Map<string, WebSocket>();
  // Track connection liveness for WS ping/pong (miss counter: kill after 2 consecutive misses)
  const aliveMisses = new Map<WebSocket, number>();
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
        // If the WebSocket TCP connection is still open, don't kill the session.
        // The bridge is just busy (e.g. running a long tool execution) and can't
        // send heartbeats, but the connection itself is alive. Reschedule.
        const ws = connections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          resetHeartbeat(sessionId);
          return;
        }

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
              const ws2 = connections.get(sessionId);
              if (ws2 && ws2.readyState === WebSocket.OPEN) {
                resetHeartbeat(sessionId);
                return;
              }
              console.error(`[gateway] session timed out: ${sessionId} (sleep recovery failed)`);
              sessionManager.unregister(sessionId);
              connections.delete(sessionId);
              heartbeatTimers.delete(sessionId);
              heartbeatMeta.delete(sessionId);
              checkEmpty();
            }, hbTimeout),
          );
          return;
        }

        console.error(`[gateway] session timed out: ${sessionId} (no heartbeat for ${hbTimeout}ms)`);
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

      // WS-level ping/pong: detect truly dead connections.
      // Pong responses are processed in the event loop, so a busy bridge
      // won't respond to pings. We check the underlying TCP socket's
      // writable state as a fallback — if TCP is alive, the bridge is just
      // busy, not dead.
      const PING_MISS_THRESHOLD = 3;
      if (pingMs > 0) pingTimer = setInterval(() => {
        if (!wss) return;
        for (const client of wss.clients) {
          const misses = aliveMisses.get(client) ?? 0;
          if (misses >= PING_MISS_THRESHOLD) {
            // Check if the underlying TCP socket is still alive.
            // If the socket is writable, the connection is physically intact —
            // the bridge is just too busy to process pong frames.
            const socket = (client as any)._socket;
            if (socket && !socket.destroyed && socket.writable) {
              // TCP alive but no pong — bridge is busy. Reset counter, keep alive.
              aliveMisses.set(client, 0);
              client.ping();
              continue;
            }
            // TCP is dead — clean up
            for (const [sid, ws] of connections) {
              if (ws === client) {
                console.error(`[gateway] connection dead (ping timeout, ${misses} misses): ${sid}`);
                sessionManager.unregister(sid);
                connections.delete(sid);
                const timer = heartbeatTimers.get(sid);
                if (timer) clearTimeout(timer);
                heartbeatTimers.delete(sid);
                heartbeatMeta.delete(sid);
                break;
              }
            }
            client.terminate();
            aliveMisses.delete(client);
            checkEmpty();
            continue;
          }
          aliveMisses.set(client, misses + 1);
          client.ping();
        }
      }, pingMs);

      wss.on("connection", (ws) => {
        let currentSessionId: string | null = null;
        aliveMisses.set(ws, 0);
        ws.on("pong", () => { aliveMisses.set(ws, 0); });

        ws.on("message", (raw) => {
          // Any received message proves the connection is alive
          aliveMisses.set(ws, 0);
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
                // Clean up if it's an auto-created placeholder (source unknown)
                // or a ghost session (no sessionFile, created by duplicate bridge)
                if (oldSession && (oldSession.source === "unknown" || !oldSession.sessionFile)) {
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
              console.error(`[gateway] session registered: ${msg.sessionId} cwd=${msg.cwd}`);

              resetHeartbeat(msg.sessionId);
              onConnection?.();
            }

            if (msg.type === "session_heartbeat" && msg.sessionId) {
              resetHeartbeat(msg.sessionId);
              // Store process metrics on the session if provided
              if (msg.metrics) {
                sessionManager.update(msg.sessionId, {
                  processMetrics: { ...msg.metrics, updatedAt: Date.now() },
                });
              }
              // Respond with ack so the bridge can track server liveness
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "heartbeat_ack" }));
              }
            }

            if (msg.type === "session_unregister" && msg.sessionId) {
              console.error(`[gateway] session unregistered: ${msg.sessionId} (explicit)`);
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
            console.error(`[gateway] connection closed: ${currentSessionId}`);
            // Don't immediately unregister - wait for heartbeat timeout
            // This handles temporary disconnects
            onDisconnect?.(currentSessionId);
          }
          aliveMisses.delete(ws);
        });
      });
    },

    stop() {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      for (const timer of heartbeatTimers.values()) {
        clearTimeout(timer);
      }
      heartbeatTimers.clear();
      heartbeatMeta.clear();
      aliveMisses.clear();
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

    broadcast(msg: ServerToExtensionMessage): void {
      const payload = JSON.stringify(msg);
      for (const ws of connections.values()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
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

    getConnectedSessionIds(): string[] {
      return [...connections.keys()].filter(
        (sid) => connections.get(sid)?.readyState === WebSocket.OPEN,
      );
    },
  };
}
