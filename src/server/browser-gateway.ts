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
// PendingLoadManager removed — server loads sessions directly via DirectoryService
import { spawnPiSession, type SpawnResult } from "./process-manager.js";
import { loadConfig } from "../shared/config.js";
import { safeRealpathSync } from "./resolve-path.js";
import { createHeadlessPidRegistry, type HeadlessPidRegistry } from "./headless-pid-registry.js";
import type { PendingForkRegistry } from "./pending-fork-registry.js";
import type { SessionOrderManager } from "./session-order-manager.js";
import type { StateStore } from "./state-store.js";
import type { DirectoryService } from "./directory-service.js";
import { createPendingResumeRegistry, type PendingResumeRegistry } from "./pending-resume-registry.js";
import type { TerminalManager } from "./terminal-manager.js";
import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

const REPLAY_BATCH_SIZE = 200;

/**
 * Fallback: find and kill a headless pi process by matching the session ID
 * in the process command line. This handles the case where the PID registry
 * is empty (e.g., after server restart).
 */
function killHeadlessBySessionId(sessionId: string): boolean {
  if (process.platform === "win32") return false;
  try {
    // Find the wrapper shell process: sh -c sleep ... | pi --mode rpc --session .../<sessionId>.jsonl
    const output = execSync(
      `ps -eo pid,command | grep "${sessionId}" | grep "sleep 2147483647" | grep -v grep`,
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    if (!output) return false;
    for (const line of output.split("\n")) {
      const pid = parseInt(line.trim(), 10);
      if (pid > 0) {
        try {
          // Kill the entire process group (wrapper shell + sleep + pi)
          process.kill(-pid, "SIGTERM");
        } catch {
          // Try direct kill if process group fails
          try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

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
  /** Shut down all tracked headless child processes */
  shutdownHeadlessProcesses(): void;
  /** Registry for linking headless PIDs to session IDs */
  headlessPidRegistry: HeadlessPidRegistry;
  /** Registry for pending auto-resume prompts */
  pendingResumeRegistry: PendingResumeRegistry;
}

export function createBrowserGateway(
  sessionManager: SessionManager,
  eventStore: EventStore,
  piGateway: PiGateway,
  _pendingLoadManager?: unknown,
  pendingForkRegistry?: PendingForkRegistry,
  sessionOrderManager?: SessionOrderManager,
  stateStore?: StateStore,
  directoryService?: DirectoryService,
  terminalManager?: TerminalManager,
): BrowserGateway {
  const wss = new WebSocketServer({ noServer: true });

  // Track subscriptions: ws → Set<sessionId>
  const subscriptions = new Map<WebSocket, Set<string>>();

  // Track headless child processes with sessionId linkage
  const headlessPidRegistry = createHeadlessPidRegistry();

  // Track pending auto-resume prompts for ended sessions
  const pendingResumeRegistry = createPendingResumeRegistry({
    onTimeout(oldSessionId) {
      // Clear resuming flag when resume times out
      sessionManager.update(oldSessionId, { resuming: false });
      broadcast({ type: "session_updated", sessionId: oldSessionId, updates: { resuming: false } });
    },
  });

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

    // Send pinned directories on connect
    if (stateStore) {
      sendTo(ws, { type: "pinned_dirs_updated", paths: stateStore.getPinnedDirectories() });
    }

    // Send session orders for all cwds
    if (sessionOrderManager) {
      const allOrders = sessionOrderManager.getAllOrders();
      for (const [cwd, sessionIds] of Object.entries(allOrders)) {
        if (sessionIds.length > 0) {
          sendTo(ws, { type: "sessions_reordered", cwd, sessionIds });
        }
      }
    }

    // Send cached OpenSpec data for all known directories
    if (directoryService) {
      for (const cwd of directoryService.knownDirectories()) {
        const data = directoryService.getOpenSpecData(cwd);
        if (data && data.initialized) {
          sendTo(ws, { type: "openspec_update", cwd, data });
        }
      }
    }

    // Send active terminals on connect
    if (terminalManager) {
      for (const terminal of terminalManager.list()) {
        sendTo(ws, { type: "terminal_added", terminal });
      }
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as BrowserToServerMessage;

        switch (msg.type) {
          case "subscribe": {
            subs.add(msg.sessionId);

            // Check if events are in memory
            if (eventStore.hasEvents(msg.sessionId)) {
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
            } else if (directoryService) {
              // Load session events directly from disk via DirectoryService
              const session = sessionManager.get(msg.sessionId);
              if (session?.sessionFile) {
                // Send placeholder while loading
                sendTo(ws, {
                  type: "event_replay",
                  sessionId: msg.sessionId,
                  events: [],
                  isLast: false,
                });
                directoryService.loadSessionEvents(msg.sessionId, session.sessionFile).then((result) => {
                  if (result.success) {
                    // Insert events into memory buffer
                    for (const evt of result.events) {
                      eventStore.insertEvent(msg.sessionId, evt);
                    }
                    sessionManager.update(msg.sessionId, { dataUnavailable: false });
                    broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: false } });
                    // Send loaded events to all subscribers
                    const stored = eventStore.getEvents(msg.sessionId, 1);
                    const replayMsg: ServerToBrowserMessage = {
                      type: "event_replay",
                      sessionId: msg.sessionId,
                      events: stored.map((e) => ({ seq: e.seq, event: e.event })),
                      isLast: true,
                    };
                    for (const sub of getSubscribers(msg.sessionId)) {
                      sendTo(sub, replayMsg);
                    }
                  } else {
                    sendTo(ws, {
                      type: "event_replay",
                      sessionId: msg.sessionId,
                      events: [],
                      isLast: true,
                    });
                    sessionManager.update(msg.sessionId, { dataUnavailable: true });
                    broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: true } });
                  }
                }).catch(() => {
                  sendTo(ws, {
                    type: "event_replay",
                    sessionId: msg.sessionId,
                    events: [],
                    isLast: true,
                  });
                  sessionManager.update(msg.sessionId, { dataUnavailable: true });
                  broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: true } });
                });
              } else {
                // No session file — data unavailable
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
            } else {
              // No directoryService — send empty
              sendTo(ws, {
                type: "event_replay",
                sessionId: msg.sessionId,
                events: [],
                isLast: true,
              });
            }

            // OpenSpec data is now sent per-directory on connect, not per-session on subscribe
            break;
          }

          case "unsubscribe":
            subs.delete(msg.sessionId);
            break;

          case "send_prompt": {
            const promptSession = sessionManager.get(msg.sessionId);
            if (promptSession?.status === "ended") {
              // Auto-resume: queue prompt and spawn pi to continue
              if (!promptSession.sessionFile) {
                console.error(`[dashboard] auto-resume failed: no session file for session ${msg.sessionId}`);
                break;
              }
              // If already resuming, just update the queued prompt (don't spawn again)
              const alreadyResuming = promptSession.resuming;
              pendingResumeRegistry.record(promptSession.cwd, {
                text: msg.text,
                images: msg.images,
                oldSessionId: msg.sessionId,
                sessionFile: promptSession.sessionFile,
              });
              if (alreadyResuming) break;
              // Show resuming state on the session card
              sessionManager.update(msg.sessionId, { resuming: true });
              broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { resuming: true } });
              // Spawn pi to continue the session
              const autoResumeConfig = loadConfig();
              const spawnResult = await spawnPiSession(promptSession.cwd, {
                sessionFile: promptSession.sessionFile,
                mode: "continue",
                strategy: autoResumeConfig.spawnStrategy,
              });
              if (!spawnResult.success) {
                console.error(`[dashboard] auto-resume spawn failed: ${spawnResult.message}`);
                pendingResumeRegistry.consume(promptSession.cwd);
                sessionManager.update(msg.sessionId, { resuming: false });
                broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { resuming: false } });
              }
              if (spawnResult.process && spawnResult.pid) {
                headlessPidRegistry.register(spawnResult.pid, promptSession.cwd, spawnResult.process);
              }
            } else {
              const sent = piGateway.sendToSession(msg.sessionId, {
                type: "send_prompt",
                sessionId: msg.sessionId,
                text: msg.text,
                images: msg.images,
              });
              if (!sent) {
                console.error(`[dashboard] send_prompt failed: no bridge connection for session ${msg.sessionId}`);
              }
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

          case "openspec_refresh": {
            if (directoryService) {
              directoryService.refreshOpenSpec(msg.cwd).then((data) => {
                broadcast({ type: "openspec_update", cwd: msg.cwd, data });
              });
            }
            break;
          }

          case "openspec_bulk_archive": {
            if (directoryService) {
              // Run archive async to avoid blocking the event loop
              execFileAsync("openspec", ["archive", "--completed"], { cwd: msg.cwd, timeout: 30000 })
                .catch(() => { /* Ignore errors (e.g. no completed changes) */ })
                .then(() => directoryService.refreshOpenSpec(msg.cwd))
                .then((data) => {
                  if (data) broadcast({ type: "openspec_update", cwd: msg.cwd, data });
                });
            }
            break;
          }

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

          case "set_model":
            piGateway.sendToSession(msg.sessionId, {
              type: "set_model",
              sessionId: msg.sessionId,
              provider: msg.provider,
              modelId: msg.modelId,
            });
            break;

          case "shutdown": {
            // Send shutdown to bridge (graceful shutdown via pi API)
            piGateway.sendToSession(msg.sessionId, {
              type: "shutdown",
              sessionId: msg.sessionId,
            });
            // Kill headless process group to ensure the wrapper shell is terminated
            headlessPidRegistry.killBySessionId(msg.sessionId);
            // Fallback: find and kill by session ID in process list
            killHeadlessBySessionId(msg.sessionId);
            // Immediately mark as ended so the UI updates without waiting
            // for heartbeat timeout
            sessionManager.unregister(msg.sessionId);
            broadcast({ type: "session_removed", sessionId: msg.sessionId });
            break;
          }

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
            if (session.resuming) {
              sendTo(ws, {
                type: "resume_result",
                sessionId: msg.sessionId,
                success: false,
                message: "Session is already being resumed",
              });
              break;
            }
            // Record pending fork for session ordering
            if (msg.mode === "fork" && pendingForkRegistry) {
              pendingForkRegistry.recordFork(session.cwd, msg.sessionId);
            }
            const resumeConfig = loadConfig();
            const result = await spawnPiSession(session.cwd, {
              sessionFile: session.sessionFile,
              mode: msg.mode,
              strategy: resumeConfig.spawnStrategy,
            });
            sendTo(ws, {
              type: "resume_result",
              sessionId: msg.sessionId,
              success: result.success,
              message: result.message,
            });
            break;
          }

          case "spawn_session": {
            const config = loadConfig();
            const spawnResult = await spawnPiSession(msg.cwd, {
              strategy: config.spawnStrategy,
            });
            if (spawnResult.process && spawnResult.pid) {
              headlessPidRegistry.register(spawnResult.pid, msg.cwd, spawnResult.process);
            }
            sendTo(ws, {
              type: "spawn_result",
              cwd: msg.cwd,
              success: spawnResult.success,
              message: spawnResult.message,
            });
            break;
          }

          case "attach_proposal": {
            const updates: Record<string, unknown> = { attachedProposal: msg.changeName };
            const session = sessionManager.get(msg.sessionId);
            // Auto-name: set session name to proposal name if name is empty
            if (session && !session.name?.trim()) {
              updates.name = msg.changeName;
              // Forward rename to extension so pi's internal name is updated
              piGateway.sendToSession(msg.sessionId, {
                type: "rename_session",
                sessionId: msg.sessionId,
                name: msg.changeName,
              });
            }
            sessionManager.update(msg.sessionId, updates);
            broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
            break;
          }

          case "detach_proposal": {
            const updates = { attachedProposal: null, openspecPhase: null, openspecChange: null };
            sessionManager.update(msg.sessionId, updates);
            broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
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

          case "reorder_sessions": {
            if (sessionOrderManager) {
              sessionOrderManager.reorder(msg.cwd, msg.sessionIds);
              broadcast({ type: "sessions_reordered", cwd: msg.cwd, sessionIds: msg.sessionIds });
            }
            break;
          }

          case "pin_directory": {
            if (stateStore) {
              const resolved = safeRealpathSync(msg.path);
              stateStore.pinDirectory(resolved);
              broadcast({ type: "pinned_dirs_updated", paths: stateStore.getPinnedDirectories() });
              // Trigger directory discovery for newly pinned directory
              if (directoryService) {
                directoryService.onDirectoryAdded(resolved).then(({ sessions, openspecData }) => {
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
                      if (s) broadcast({ type: "session_added", session: s });
                    }
                  }
                  broadcast({
                    type: "openspec_update",
                    cwd: resolved,
                    data: openspecData,
                  } as any);
                }).catch(() => {});
              }
            }
            break;
          }

          case "unpin_directory": {
            if (stateStore) {
              stateStore.unpinDirectory(safeRealpathSync(msg.path));
              broadcast({ type: "pinned_dirs_updated", paths: stateStore.getPinnedDirectories() });
            }
            break;
          }

          case "reorder_pinned_dirs": {
            if (stateStore) {
              stateStore.reorderPinnedDirs(msg.paths.map(safeRealpathSync));
              broadcast({ type: "pinned_dirs_updated", paths: stateStore.getPinnedDirectories() });
            }
            break;
          }

          case "extension_ui_response": {
            piGateway.sendToSession(msg.sessionId, {
              type: "extension_ui_response",
              sessionId: msg.sessionId,
              requestId: msg.requestId,
              result: msg.result,
              cancelled: msg.cancelled,
            });
            break;
          }

          case "create_terminal": {
            if (terminalManager && sessionOrderManager) {
              const terminal = terminalManager.spawn(msg.cwd);
              sessionOrderManager.insert(msg.cwd, terminal.id);
              broadcast({ type: "terminal_added", terminal });
              broadcast({ type: "sessions_reordered", cwd: msg.cwd, sessionIds: sessionOrderManager.getOrder(msg.cwd) });
            }
            break;
          }

          case "kill_terminal": {
            if (terminalManager) {
              try { terminalManager.kill(msg.terminalId); } catch { /* ignore */ }
            }
            break;
          }

          case "rename_terminal": {
            if (terminalManager) {
              terminalManager.updateTitle(msg.terminalId, msg.title);
              broadcast({ type: "terminal_updated", terminalId: msg.terminalId, updates: { title: msg.title } });
            }
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

    shutdownHeadlessProcesses() {
      headlessPidRegistry.killAll();
    },

    headlessPidRegistry,

    pendingResumeRegistry,
  };
}
