/**
 * Browser Gateway - WebSocket handler for browser client connections.
 * Runs on the HTTP server port via upgrade handling.
 */
import { WebSocketServer, WebSocket } from "ws";
import type {
  ServerToBrowserMessage,
  BrowserToServerMessage,
} from "../shared/browser-protocol.js";
import type { SessionManager } from "./memory-session-manager.js";
import type { EventStore } from "./memory-event-store.js";
import type { PiGateway } from "./pi-gateway.js";
import type { PendingLoadManager } from "./pending-load-manager.js";
import { spawnPiSession } from "./process-manager.js";

const REPLAY_BATCH_SIZE = 200;

export interface BrowserGateway {
  wss: WebSocketServer;
  broadcastEvent(sessionId: string, seq: number, event: any): void;
  broadcastSessionAdded(session: any): void;
  broadcastSessionUpdated(sessionId: string, updates: any): void;
  broadcastSessionRemoved(sessionId: string): void;
  sendToSubscribers(sessionId: string, msg: ServerToBrowserMessage): void;
  broadcastToAll(msg: ServerToBrowserMessage): void;
  /** Get number of browser subscribers for a session */
  getSubscriberCount(sessionId: string): number;
}

export function createBrowserGateway(
  sessionManager: SessionManager,
  eventStore: EventStore,
  piGateway: PiGateway,
  pendingLoadManager?: PendingLoadManager,
): BrowserGateway {
  const wss = new WebSocketServer({ noServer: true });

  // Track subscriptions: ws → Set<sessionId>
  const subscriptions = new Map<WebSocket, Set<string>>();

  function getSubscribers(sessionId: string): WebSocket[] {
    const result: WebSocket[] = [];
    for (const [ws, subs] of subscriptions) {
      if (subs.has(sessionId) && ws.readyState === WebSocket.OPEN) {
        result.push(ws);
      }
    }
    return result;
  }

  function sendTo(ws: WebSocket, msg: ServerToBrowserMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcast(msg: ServerToBrowserMessage) {
    for (const [ws] of subscriptions) {
      sendTo(ws, msg);
    }
  }

  wss.on("connection", (ws) => {
    const subs = new Set<string>();
    subscriptions.set(ws, subs);

    // Send all sessions on connect (client filters by hidden flag)
    const allSessions = sessionManager.listAll();
    for (const session of allSessions) {
      sendTo(ws, { type: "session_added", session });
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as BrowserToServerMessage;

        switch (msg.type) {
          case "subscribe": {
            subs.add(msg.sessionId);

            // Check if events are in memory
            if (eventStore.hasEvents(msg.sessionId) || !pendingLoadManager) {
              // Replay events from lastSeq
              const events = eventStore.getEvents(msg.sessionId, (msg.lastSeq ?? 0) + 1);
              for (let i = 0; i < events.length; i += REPLAY_BATCH_SIZE) {
                const batch = events.slice(i, i + REPLAY_BATCH_SIZE);
                sendTo(ws, {
                  type: "event_replay",
                  sessionId: msg.sessionId,
                  events: batch.map((e) => ({ seq: e.seq, event: e.event })),
                  isLast: i + REPLAY_BATCH_SIZE >= events.length,
                });
              }
            } else if (pendingLoadManager.isPending(msg.sessionId)) {
              // Already loading — add browser to waiting set
              pendingLoadManager.addBrowser(msg.sessionId, ws);
              sendTo(ws, {
                type: "event_replay",
                sessionId: msg.sessionId,
                events: [],
                isLast: false,
              });
            } else {
              // Try on-demand loading via bridge
              const session = sessionManager.get(msg.sessionId);
              const bridgeSessionId = session?.cwd
                ? piGateway.findSessionByCwd(session.cwd)
                : undefined;

              if (bridgeSessionId && session?.sessionFile) {
                pendingLoadManager.start(msg.sessionId, ws, bridgeSessionId);
                sendTo(ws, {
                  type: "event_replay",
                  sessionId: msg.sessionId,
                  events: [],
                  isLast: false,
                });
                piGateway.sendToSession(bridgeSessionId, {
                  type: "load_session_events",
                  sessionId: msg.sessionId,
                  sessionFile: session.sessionFile,
                });
              } else {
                // No bridge available — data unavailable
                sendTo(ws, {
                  type: "event_replay",
                  sessionId: msg.sessionId,
                  events: [],
                  isLast: true,
                });
                if (session) {
                  sessionManager.update(msg.sessionId, { dataUnavailable: true });
                  broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: true } });
                }
              }
            }

            // Hydrate stored OpenSpec data or force refresh from extension
            const session = sessionManager.get(msg.sessionId);
            if (session?.openspecData) {
              try {
                sendTo(ws, {
                  type: "openspec_update",
                  sessionId: msg.sessionId,
                  data: JSON.parse(session.openspecData),
                });
              } catch { /* malformed JSON, request fresh */ }
            }
            if (!session?.openspecData && session?.status !== "ended") {
              piGateway.sendToSession(msg.sessionId, {
                type: "openspec_refresh",
                sessionId: msg.sessionId,
              });
            }
            break;
          }

          case "unsubscribe":
            subs.delete(msg.sessionId);
            break;

          case "send_prompt": {
            const sent = piGateway.sendToSession(msg.sessionId, {
              type: "send_prompt",
              sessionId: msg.sessionId,
              text: msg.text,
              images: msg.images,
            });
            if (!sent) {
              console.error(`[dashboard] send_prompt failed: no bridge connection for session ${msg.sessionId}`);
            }
            break;
          }

          case "abort":
            piGateway.sendToSession(msg.sessionId, {
              type: "abort",
              sessionId: msg.sessionId,
            });
            break;

          case "request_commands":
            piGateway.sendToSession(msg.sessionId, {
              type: "request_commands",
              sessionId: msg.sessionId,
            });
            break;

          case "list_files":
            piGateway.sendToSession(msg.sessionId, {
              type: "list_files",
              sessionId: msg.sessionId,
              query: msg.query,
            });
            break;

          case "openspec_refresh":
            piGateway.sendToSession(msg.sessionId, {
              type: "openspec_refresh",
              sessionId: msg.sessionId,
            });
            break;

          case "request_models":
            piGateway.sendToSession(msg.sessionId, {
              type: "request_models",
              sessionId: msg.sessionId,
            });
            break;

          case "set_thinking_level":
            piGateway.sendToSession(msg.sessionId, {
              type: "set_thinking_level",
              sessionId: msg.sessionId,
              level: msg.level,
            });
            break;

          case "shutdown":
            piGateway.sendToSession(msg.sessionId, {
              type: "shutdown",
              sessionId: msg.sessionId,
            });
            break;

          case "rename_session": {
            // Optimistically update session name server-side
            const nameUpdates = { name: msg.name || undefined };
            sessionManager.update(msg.sessionId, nameUpdates);
            // Broadcast to all browsers immediately
            broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: nameUpdates });
            // Forward to extension to persist in pi
            piGateway.sendToSession(msg.sessionId, {
              type: "rename_session",
              sessionId: msg.sessionId,
              name: msg.name,
            });
            break;
          }

          case "fetch_content": {
            const event = eventStore.getEvent(msg.sessionId, msg.seq);
            if (event) {
              sendTo(ws, {
                type: "event",
                sessionId: msg.sessionId,
                seq: msg.seq,
                event,
              });
            }
            break;
          }

          case "list_sessions": {
            const cwd = msg.cwd;
            // Try to forward to a connected bridge for this cwd
            const bridgeSessionId = piGateway.findSessionByCwd(cwd);
            if (bridgeSessionId) {
              piGateway.sendToSession(bridgeSessionId, {
                type: "list_sessions",
                sessionId: bridgeSessionId,
                cwd,
              });
            } else {
              // Fallback: return sessions from in-memory registry filtered by cwd
              const allSessions = sessionManager.listAll();
              const filtered = allSessions
                .filter((s) => s.cwd === cwd || s.cwd.startsWith(cwd + "/") || cwd.startsWith(s.cwd + "/"))
                .map((s) => ({
                  id: s.id,
                  path: s.sessionFile || "",
                  cwd: s.cwd,
                  name: s.name,
                  created: new Date(s.startedAt).toISOString(),
                  modified: new Date(s.endedAt || s.startedAt).toISOString(),
                  messageCount: 0,
                  firstMessage: s.firstMessage,
                }));
              sendTo(ws, {
                type: "sessions_list",
                sessionId: "",
                cwd,
                sessions: filtered,
              });
            }
            break;
          }

          case "resume_session": {
            const session = sessionManager.get(msg.sessionId);
            if (!session) {
              sendTo(ws, {
                type: "resume_result",
                sessionId: msg.sessionId,
                success: false,
                message: "Session not found",
              });
              break;
            }
            if (!session.sessionFile) {
              sendTo(ws, {
                type: "resume_result",
                sessionId: msg.sessionId,
                success: false,
                message: "Session file is unknown (pre-migration session)",
              });
              break;
            }
            if (msg.mode === "continue" && session.status !== "ended") {
              sendTo(ws, {
                type: "resume_result",
                sessionId: msg.sessionId,
                success: false,
                message: "Session is already active",
              });
              break;
            }
            const result = await spawnPiSession(session.cwd, {
              sessionFile: session.sessionFile,
              mode: msg.mode,
            });
            sendTo(ws, {
              type: "resume_result",
              sessionId: msg.sessionId,
              success: result.success,
              message: result.message,
            });
            break;
          }

          case "hide_session": {
            const updates = { hidden: true };
            sessionManager.update(msg.sessionId, updates);
            broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
            break;
          }

          case "unhide_session": {
            const updates = { hidden: false };
            sessionManager.update(msg.sessionId, updates);
            broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      subscriptions.delete(ws);
    });
  });

  return {
    wss,

    broadcastEvent(sessionId: string, seq: number, event: any) {
      const subscribers = getSubscribers(sessionId);
      const msg: ServerToBrowserMessage = {
        type: "event",
        sessionId,
        seq,
        event,
      };
      for (const ws of subscribers) {
        sendTo(ws, msg);
      }
    },

    broadcastSessionAdded(session: any) {
      broadcast({ type: "session_added", session });
    },

    broadcastSessionUpdated(sessionId: string, updates: any) {
      broadcast({ type: "session_updated", sessionId, updates });
    },

    broadcastSessionRemoved(sessionId: string) {
      broadcast({ type: "session_removed", sessionId });
    },

    sendToSubscribers(sessionId: string, msg: ServerToBrowserMessage) {
      const subscribers = getSubscribers(sessionId);
      for (const ws of subscribers) {
        sendTo(ws, msg);
      }
    },

    broadcastToAll(msg: ServerToBrowserMessage) {
      broadcast(msg);
    },

    getSubscriberCount(sessionId: string): number {
      return getSubscribers(sessionId).length;
    },
  };
}
