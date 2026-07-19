/**
 * Browser Gateway - WebSocket handler for browser client connections.
 * Runs on the HTTP server port via upgrade handling.
 */

import type {
  BrowserOpenSpecUpdateMessage,
  BrowserToServerMessage,
  ServerToBrowserMessage,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { WebSocket, WebSocketServer } from "ws";
import { type DirectoryService, hasOpenSpecDir, hasOpenSpecRoot } from "./directory-service.js";
// PendingLoadManager removed — server loads sessions directly via DirectoryService
import { createHeadlessPidRegistry, type HeadlessPidRegistry } from "./headless-pid-registry.js";
import type { EventStore } from "./memory-event-store.js";
import type { SessionManager } from "./memory-session-manager.js";
import type { PendingForkRegistry } from "./pending-fork-registry.js";
import type { PiGateway } from "./pi-gateway.js";
import type { PreferencesStore } from "./preferences-store.js";
import type { SessionOrderManager } from "./session-order-manager.js";

/**
 * Pure helper: build the per-cwd `openspec_update` messages a freshly
 * connecting browser should receive. One message per known cwd.
 * Disambiguates three states:
 *   - cache populated         → cached payload
 *   - openspec dir but cold   → { initialized: false, pending: true }
 *   - no openspec dir         → { initialized: false, pending: false }
 *
 * Exported so cold-boot snapshot semantics can be unit-tested without
 * spinning up a WS server. See change: fix-cold-boot-openspec-protocol.
 */
export function buildOpenSpecConnectSnapshot(
  directoryService: Pick<DirectoryService, "knownDirectories" | "getOpenSpecData">,
  hasDir: (cwd: string) => boolean,
  hasRoot: (cwd: string) => boolean = hasDir,
): Array<BrowserOpenSpecUpdateMessage> {
  const out: Array<BrowserOpenSpecUpdateMessage> = [];
  for (const cwd of directoryService.knownDirectories()) {
    const cached = directoryService.getOpenSpecData(cwd);
    const root = hasRoot(cwd);
    if (cached && cached.initialized) {
      // Cached payload already carries `hasOpenspecDir` set by `pollOne`; if
      // an old cache entry predates that field, fill it from the live probe.
      const data = cached.hasOpenspecDir === undefined
        ? { ...cached, hasOpenspecDir: root }
        : cached;
      out.push({ type: "openspec_update", cwd, data });
    } else if (hasDir(cwd)) {
      out.push({
        type: "openspec_update",
        cwd,
        data: { initialized: false, pending: true, changes: [], hasOpenspecDir: root },
      });
    } else {
      out.push({
        type: "openspec_update",
        cwd,
        data: { initialized: false, pending: false, changes: [], hasOpenspecDir: root },
      });
    }
  }
  return out;
}

import { handleAddFolderToWorkspace, handleCreateWorkspace, handleDeleteWorkspace, handleExtensionUiResponse, handleFavoriteModel, handleOpenSpecBulkArchive, handleOpenSpecRefresh, handlePiGatewayForward, handlePinDirectory, handleRemoveFolderFromWorkspace, handleRenameWorkspace, handleReorderPinnedDirs, handleReorderSessions, handleReorderWorkspaceFolders, handleReorderWorkspaces, handleSetWorkspaceCollapsed, handleUnfavoriteModel, handleUnpinDirectory } from "./browser-handlers/directory-handler.js";
import type { BrowserHandlerContext } from "./browser-handlers/handler-context.js";
import { handleAbort, handleClearFollowupEntries, handleEditFollowupEntry, handleFlowControl, handleForceKill, handleKillProcess, handlePromoteFollowupEntry, handleRemoveFollowupEntry, handleResumeSession, handleSendPrompt, handleShutdown, handleSpawnSession, handleStopAfterTurn, handleSubagentResyncRequest } from "./browser-handlers/session-action-handler.js";
import { handleAcceptReplaceProposal, handleAttachProposal, handleDetachProposal, handleDismissReplaceProposal, handleFetchContent, handleHideSession, handleListSessions, handleRenameSession, handleSetSessionDisplayPrefs, handleSetSessionProcessDrawer, handleSetSessionTags, handleUnhideSession } from "./browser-handlers/session-meta-handler.js";
import { handleSubscribe, replayUiState } from "./browser-handlers/subscription-handler.js";
import { createReplayCoordinator, REPLAY_SEND_BACKPRESSURE, type ReplayCoordinator } from "./replay-coordinator.js";
import { handleCloseInlineTerminal, handleCreateTerminal, handleKillTerminal, handleOpenInlineTerminal, handleRenameTerminal } from "./browser-handlers/terminal-handler.js";
import { createPendingResumeRegistry, type PendingResumeRegistry } from "./pending-resume-registry.js";
import type { TerminalManager } from "./terminal-manager.js";
import { ViewMessageStore } from "./view-message-store.js";
import { createViewedSessionTracker, type ViewedSessionTracker } from "./viewed-session-tracker.js";

export const PROMPT_RESPONSE_RETRY_MAX_AGE_MS = 60_000;
export const PROMPT_RESPONSE_MAX_RETRIES = 10;



export interface BrowserGateway {
  wss: WebSocketServer;
  broadcastEvent(sessionId: string, seq: number, event: any): void;
  broadcastSessionAdded(session: any, opts?: { spawnRequestId?: string }): void;
  broadcastSessionUpdated(sessionId: string, updates: any): void;
  broadcastSessionRemoved(sessionId: string): void;
  sendToSubscribers(sessionId: string, msg: ServerToBrowserMessage): void;
  broadcastToAll(msg: ServerToBrowserMessage): void;
  /**
   * Broadcast an `openspec_update` envelope using a pre-stringified `data`
   * payload (from the OpenSpec poll worker). The envelope JSON is built by
   * string concatenation so the large `data` is NOT re-serialized on the
   * main thread — it flows from worker → ws.send in exactly one form.
   * Mirrors `broadcast()`'s back-pressure + readyState guards.
   * See change: offload-openspec-poll-to-worker.
   */
  broadcastOpenSpecUpdate(cwd: string, dataSerialized: string): void;
  /** Get number of browser subscribers for a session */
  getSubscriberCount(sessionId: string): number;
  /**
   * Per-hop dropped-frame counters for the diagnostics/health surface. A
   * server→browser frame is dropped when a browser socket's send buffer
   * crosses MAX_WS_BUFFER under back-pressure. See change:
   * fix-stuck-tool-card-on-dropped-event.
   */
  getDroppedFrameStats(): { total: number; bySession: Record<string, number> };
  /** Bounded, metadata-only client replay diagnostics accepted by this server. */
  getReplayDiagnosticStats(): { total: number; byCode: Record<string, number>; bySession: Record<string, number> };
  /** Track a pending interactive UI request for replay on reconnect */
  trackUiRequest(sessionId: string, requestId: string, method: string, params: Record<string, unknown>): boolean | void;
  /** Clear a pending interactive UI request (resolved or cancelled) */
  clearUiRequest(sessionId: string, requestId: string): void;
  /** Track a pending PromptBus request for replay on browser refresh. Returns false when answered. */
  trackPromptRequest(sessionId: string, msg: Record<string, unknown>): boolean;
  /** Clear a pending PromptBus request (dismissed or cancelled) */
  clearPromptRequest(sessionId: string, promptId: string): void;
  /**
   * Drop pending PromptBus requests for an input-needed tool that already
   * finished. Backstops a lost/late `prompt_dismiss` after a TUI answer so a
   * late browser subscribe does not re-surface a dead ask as the latest card.
   * Selective only: with `toolCallId`, only exact metadata matches; without,
   * only tool-originated prompts (metadata.toolCallId present). Never wipes
   * free-floating PromptBus cards. Returns cleared promptIds for `prompt_dismiss`.
   */
  clearPromptRequestsForTool(sessionId: string, toolCallId?: string): string[];
  /** Clear all queued PromptBus responses for a session (session unregister). */
  clearPendingPromptResponses(sessionId: string): void;

  /** Tell browser subscribers to reset accumulated state for a session (bridge reconnected) */
  broadcastSessionStateReset(sessionId: string, reason?: import("@blackbelt-technology/pi-dashboard-shared/browser-protocol.js").SessionStateResetReason): void;
  completeBridgeReplay?(sessionId: string): void;
  /** Shut down all tracked headless child processes */
  shutdownHeadlessProcesses(): void;
  /** Registry for linking headless PIDs to session IDs */
  headlessPidRegistry: HeadlessPidRegistry;
  /** Registry for pending auto-resume prompts */
  pendingResumeRegistry: PendingResumeRegistry;
  /**
   * Tracker for which browser is currently viewing which session. Used by
   * the unread-trigger evaluation in event-wiring.ts.
   * See change: session-card-unread-stripes.
   */
  viewedSessionTracker: ViewedSessionTracker;
  /** Send a message to a specific WebSocket client */
  sendToClient(ws: WebSocket, msg: ServerToBrowserMessage): boolean;
  /** Callback invoked when a new browser client connects */
  onConnect?: (ws: WebSocket) => void;
  /**
   * Callback invoked when a browser dismisses a cold-start recovery offer
   * (`recovery_dismiss`). The gateway already consumes the on-disk liveness
   * markers; the server assigns this to null its held `pendingRecoveryOffer`
   * so `onConnect` replay stops after the resolving action.
   * See change: fix-recovery-offer-dismiss-and-phantom-reopen.
   */
  onRecoveryDismiss?: (sessionIds: string[]) => void;
  /**
   * Callback invoked when a session is resumed via `resume_session` (the
   * Reopen path). The server assigns this to null its held
   * `pendingRecoveryOffer` so `onConnect` replay stops after the first
   * resolving action, matching "shown once per dirty boot".
   * See change: fix-recovery-offer-dismiss-and-phantom-reopen.
   */
  onRecoveryResolve?: () => void;
  /** Broadcast a message to all connected clients */
  broadcast(msg: ServerToBrowserMessage): void;
  /**
   * Register a handler for a Browser→Server message type the gateway does
   * not natively handle. Used by plugins to receive `plugin_action`
   * messages without modifying the gateway's switch statement.
   * See change: adopt-server-driven-intent-rendering.
   */
  registerHandler(
    type: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (msg: any, ws: WebSocket) => void,
  ): void;
  /**
   * Register a `plugin_action` handler keyed by pluginId, so multiple plugins
   * service `plugin_action` concurrently without one shadowing another. The
   * host supplies the pluginId from the plugin manifest (not self-declared).
   * See change: fix-plugin-action-fanout-and-handlers.
   */
  registerPluginActionHandler(
    pluginId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (msg: any, ws: WebSocket) => void,
  ): void;
  /**
   * Register a callback invoked when any browser connection closes, so
   * per-connection resources (e.g. the open-files watch) are torn down.
   * See change: split-editor-workspace.
   */
  registerDisconnectHandler(handler: (ws: WebSocket) => void): void;
}

export function createBrowserGateway(
  sessionManager: SessionManager,
  eventStore: EventStore,
  piGateway: PiGateway,
  _pendingLoadManager?: unknown,
  pendingForkRegistry?: PendingForkRegistry,
  sessionOrderManager?: SessionOrderManager,
  preferencesStore?: PreferencesStore,
  directoryService?: DirectoryService,
  terminalManager?: TerminalManager,
  pendingDashboardSpawns?: Map<string, number>,
  maxWsBufferBytes?: number,
  pendingAttachRegistry?: import("./pending-attach-registry.js").PendingAttachRegistry,
  pendingInitialPromptRegistry?: import("./pending-initial-prompt-registry.js").PendingInitialPromptRegistry,
  pendingResumeIntents?: import("./pending-resume-intent-registry.js").PendingResumeIntentRegistry,
  pendingClientCorrelations?: import("./pending-client-correlations.js").PendingClientCorrelations,
  pendingWorktreeBaseRegistry?: import("./pending-worktree-base-registry.js").PendingWorktreeBaseRegistry,
  metaPersistence?: import("./meta-persistence.js").MetaPersistence,
  viewMessageStore: ViewMessageStore = new ViewMessageStore(),
  promptResponseMaxAgeMs = PROMPT_RESPONSE_RETRY_MAX_AGE_MS,
  serverEpoch?: string,
): BrowserGateway {
  const wss = new WebSocketServer({ noServer: true });

  /**
   * Plugin-registered handlers for custom Browser→Server message types.
   * Lives outside subscriptions because handlers are global, not per-WS.
   * See change: adopt-server-driven-intent-rendering.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customHandlers = new Map<string, (msg: any, ws: WebSocket) => void>();

  /**
   * `plugin_action` handlers keyed by pluginId (fan-out registry). Distinct
   * from `customHandlers` (single-owner types like `watch_files`): a
   * `plugin_action` is routed to the handler whose pluginId matches
   * `message.pluginId`, so N plugins coexist regardless of load order.
   * See change: fix-plugin-action-fanout-and-handlers.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pluginActionHandlers = new Map<string, (msg: any, ws: WebSocket) => void>();

  // Callbacks invoked on browser disconnect (per-connection resource cleanup).
  // See change: split-editor-workspace.
  const disconnectHandlers: Array<(ws: WebSocket) => void> = [];

  // Track subscriptions: ws → Set<sessionId>
  const subscriptions = new Map<WebSocket, Set<string>>();
  let replayCoordinator: ReplayCoordinator;
  // Track which sessions are mid-replay per WebSocket (suppress live events)
  const replayingSessions = new Map<WebSocket, Set<string>>();

  // Track headless child processes with sessionId linkage
  const headlessPidRegistry = createHeadlessPidRegistry();

  // Track which browser is viewing which session (for unread state machine).
  // See change: session-card-unread-stripes.
  const viewedSessionTracker = createViewedSessionTracker();

  // Track pending interactive UI requests per session for replay on reconnect
  const pendingUiRequests = new Map<string, Map<string, { requestId: string; method: string; params: Record<string, unknown> }>>();

  // Track pending PromptBus requests per session for replay on browser refresh
  const pendingPromptRequests = new Map<string, Map<string, Record<string, unknown>>>();
  // Browser answers remain queued until the bridge acknowledges receipt. This
  // makes retries idempotent across a bridge reconnect without re-showing the
  // answered card after a browser refresh.
  const pendingPromptResponses = new Map<string, Map<string, {
    message: Record<string, unknown>;
    createdAt: number;
    retryDelayMs: number;
    retryCount: number;
    timer?: ReturnType<typeof setTimeout>;
  }>>();

  function clearQueuedPromptResponse(sessionId: string, promptId: string): void {
    const sessionMap = pendingPromptResponses.get(sessionId);
    const queued = sessionMap?.get(promptId);
    if (!queued) return;
    if (queued.timer) clearTimeout(queued.timer);
    sessionMap!.delete(promptId);
    if (sessionMap!.size === 0) pendingPromptResponses.delete(sessionId);
  }

  function clearPendingPromptResponses(sessionId: string): void {
    const sessionMap = pendingPromptResponses.get(sessionId);
    if (!sessionMap) return;
    for (const queued of sessionMap.values()) {
      if (queued.timer) clearTimeout(queued.timer);
    }
    pendingPromptResponses.delete(sessionId);
  }

  function queuePromptResponse(sessionId: string, promptId: string, message: Record<string, unknown>): void {
    let sessionMap = pendingPromptResponses.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      pendingPromptResponses.set(sessionId, sessionMap);
    }
    if (sessionMap.has(promptId)) return;

    const queued: {
      message: Record<string, unknown>;
      createdAt: number;
      retryDelayMs: number;
      retryCount: number;
      timer?: ReturnType<typeof setTimeout>;
    } = {
      message,
      createdAt: Date.now(),
      retryDelayMs: 250,
      retryCount: 0,
    };
    sessionMap.set(promptId, queued);
    const forward = (): void => {
      if (pendingPromptResponses.get(sessionId)?.get(promptId) !== queued) return;
      const ageMs = Date.now() - queued.createdAt;
      if (ageMs >= promptResponseMaxAgeMs || queued.retryCount > PROMPT_RESPONSE_MAX_RETRIES) {
        clearQueuedPromptResponse(sessionId, promptId);
        return;
      }
      piGateway.sendToSession(sessionId, queued.message as any);
      const delay = queued.retryDelayMs;
      queued.retryDelayMs = Math.min(delay * 2, 30_000);
      queued.retryCount += 1;
      if (queued.retryCount > PROMPT_RESPONSE_MAX_RETRIES) {
        clearQueuedPromptResponse(sessionId, promptId);
        return;
      }
      const remainingMs = promptResponseMaxAgeMs - (Date.now() - queued.createdAt);
      if (remainingMs <= 0) {
        clearQueuedPromptResponse(sessionId, promptId);
        return;
      }
      queued.timer = setTimeout(forward, Math.min(delay, remainingMs));
      queued.timer.unref?.();
    };
    forward();
  }

  // Track pending auto-resume prompts for ended sessions
  const pendingResumeRegistry = createPendingResumeRegistry({
    onTimeout(oldSessionId) {
      // Clear resuming flag when resume times out
      sessionManager.update(oldSessionId, { resuming: false });
      broadcast({ type: "session_updated", sessionId: oldSessionId, updates: { resuming: false } });
    },
  });

  /** Send any pending interactive UI requests to a specific browser socket */
  function replayPendingUiRequests(ws: WebSocket, sessionId: string) {
    const sessionPending = pendingUiRequests.get(sessionId);
    if (sessionPending) {
      for (const req of sessionPending.values()) {
        sendTo(ws, {
          type: "extension_ui_request",
          sessionId,
          requestId: req.requestId,
          method: req.method,
          params: req.params,
        });
      }
    }
    // Also replay pending PromptBus requests
    const sessionPrompts = pendingPromptRequests.get(sessionId);
    if (sessionPrompts) {
      for (const msg of sessionPrompts.values()) {
        if (pendingPromptResponses.get(sessionId)?.has(msg.promptId as string)) continue;
        sendTo(ws, msg as any);
      }
    }
  }

  function trackUiRequest(sessionId: string, requestId: string, method: string, params: Record<string, unknown>): boolean | void {
    let sessionMap = pendingUiRequests.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      pendingUiRequests.set(sessionId, sessionMap);
    }
    const title = params.title;
    if (title !== undefined) {
      for (const existing of sessionMap.values()) {
        if (existing.method === method && existing.params.title === title) {
          return false;
        }
      }
    }
    sessionMap.set(requestId, { requestId, method, params });
    return true;
  }

  function trackPromptRequest(sessionId: string, msg: Record<string, unknown>): boolean {
    const promptId = msg.promptId as string;
    if (!promptId || pendingPromptResponses.get(sessionId)?.has(promptId)) return false;
    let sessionMap = pendingPromptRequests.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      pendingPromptRequests.set(sessionId, sessionMap);
    }
    sessionMap.set(promptId, msg);
    return true;
  }

  function clearPromptRequest(sessionId: string, promptId: string): void {
    clearQueuedPromptResponse(sessionId, promptId);
    const sessionMap = pendingPromptRequests.get(sessionId);
    if (sessionMap) {
      sessionMap.delete(promptId);
      if (sessionMap.size === 0) pendingPromptRequests.delete(sessionId);
    }
  }

  function clearPromptRequestsForTool(sessionId: string, toolCallId?: string): string[] {
    const sessionMap = pendingPromptRequests.get(sessionId);
    if (!sessionMap || sessionMap.size === 0) return [];

    // Selective only: never wipe free-floating PromptBus cards (architect/slash
    // with no toolCallId metadata) just because an ask tool ended after its own
    // prompt was already cleared by prompt_dismiss.
    // - toolCallId set → only exact metadata matches
    // - toolCallId absent → only tool-originated prompts (metadata.toolCallId present)
    // See change: fix-stale-answered-ask-replay.
    const cleared: string[] = [];
    for (const [promptId, msg] of sessionMap) {
      const metaToolId = (msg as { prompt?: { metadata?: { toolCallId?: unknown } } }).prompt?.metadata?.toolCallId;
      if (toolCallId) {
        if (metaToolId === toolCallId) cleared.push(promptId);
      } else if (typeof metaToolId === "string" && metaToolId.length > 0) {
        cleared.push(promptId);
      }
    }
    for (const promptId of cleared) {
      clearPromptRequest(sessionId, promptId);
    }
    return cleared;
  }

  function getSubscribers(sessionId: string): WebSocket[] {
    const result: WebSocket[] = [];
    for (const [ws, subs] of subscriptions) {
      if (subs.has(sessionId) && ws.readyState === WebSocket.OPEN) {
        result.push(ws);
      }
    }
    return result;
  }

  /** Max buffered bytes per browser WebSocket before dropping messages (0 = no limit) */
  const MAX_WS_BUFFER = maxWsBufferBytes ?? 4 * 1024 * 1024; // 4MB default

  // ── Drop-site instrumentation (change: fix-stuck-tool-card-on-dropped-event) ──
  // The server→browser hop silently drops a frame when the send buffer crosses
  // MAX_WS_BUFFER (browser not draining under back-pressure / a stall). Count
  // every drop and emit a rate-limited warning so the next stuck-card incident
  // is attributable. Logging is rate-limited because drops cluster during a
  // stall (a log-storm would itself add load).
  let droppedFramesTotal = 0;
  const droppedFramesBySession = new Map<string, number>();
  const REPLAY_DIAGNOSTIC_WINDOW_MS = 60_000;
  const REPLAY_DIAGNOSTIC_SESSION_CAP = 128;
  const REPLAY_DIAGNOSTIC_CODES = new Set([
    "cache_timeout", "cache_poison", "reset_domination", "sequence_gap", "sequence_conflict", "gap_overflow",
    "terminal_timeout", "wrong_generation", "reducer_failure", "preparation_failure", "sender_rejected",
    "socket_closed", "anchor_timeout", "stale_callback",
  ]);
  let replayDiagnosticsTotal = 0;
  const replayDiagnosticsByCode = new Map<string, number>();
  const replayDiagnosticsBySession = new Map<string, number>();
  const replayDiagnosticLastAccepted = new Map<string, number>();
  const REPLAY_DIAGNOSTIC_KEY_CAP = 4096;

  function isBoundedReplayDiagnostic(msg: unknown): msg is { code: string; sessionId: string } {
    if (!msg || typeof msg !== "object") return false;
    const value = msg as Record<string, unknown>;
    const allowed = new Set(["type", "code", "sessionId", "requestId", "sourceGeneration", "connectionEpoch", "replayGeneration", "contiguousMinSeq", "contiguousMaxSeq", "eventCount", "byteCount", "durationMs", "scrollOwner"]);
    if (Object.keys(value).some((key) => !allowed.has(key))) return false;
    const boundedString = (candidate: unknown, max: number) => candidate === undefined || (typeof candidate === "string" && candidate.length <= max);
    const boundedCount = (candidate: unknown, max: number) => candidate === undefined || (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 && candidate <= max);
    const boundedSeq = (candidate: unknown) => candidate === undefined || candidate === null || boundedCount(candidate, Number.MAX_SAFE_INTEGER);
    return value.type === "replay_diagnostic" && REPLAY_DIAGNOSTIC_CODES.has(value.code as string) && typeof value.sessionId === "string" && value.sessionId.length > 0 && value.sessionId.length <= 256 &&
      boundedString(value.requestId, 256) && boundedString(value.sourceGeneration, 256) && boundedString(value.scrollOwner, 64) &&
      boundedCount(value.connectionEpoch, 1_000_000_000) && boundedCount(value.replayGeneration, 1_000_000_000) &&
      boundedSeq(value.contiguousMinSeq) && boundedSeq(value.contiguousMaxSeq) && boundedCount(value.eventCount, 1_000_000) &&
      boundedCount(value.byteCount, 64 * 1024 * 1024) && boundedCount(value.durationMs, 86_400_000);
  }
  function recordReplayDiagnostic(msg: unknown): void {
    if (!isBoundedReplayDiagnostic(msg)) return;
    const value = msg as { code: string; sessionId: string };
    const key = JSON.stringify([value.code, value.sessionId]);
    const now = Date.now();
    if (now - (replayDiagnosticLastAccepted.get(key) ?? -Infinity) < REPLAY_DIAGNOSTIC_WINDOW_MS) return;
    replayDiagnosticLastAccepted.delete(key);
    replayDiagnosticLastAccepted.set(key, now);
    while (replayDiagnosticLastAccepted.size > REPLAY_DIAGNOSTIC_KEY_CAP) {
      const oldest = replayDiagnosticLastAccepted.keys().next().value;
      if (oldest === undefined) break;
      replayDiagnosticLastAccepted.delete(oldest);
    }
    replayDiagnosticsTotal++;
    replayDiagnosticsByCode.set(value.code, (replayDiagnosticsByCode.get(value.code) ?? 0) + 1);
    replayDiagnosticsBySession.delete(value.sessionId);
    replayDiagnosticsBySession.set(value.sessionId, (replayDiagnosticsBySession.get(value.sessionId) ?? 0) + 1);
    while (replayDiagnosticsBySession.size > REPLAY_DIAGNOSTIC_SESSION_CAP) {
      const oldest = replayDiagnosticsBySession.keys().next().value;
      if (oldest === undefined) break;
      replayDiagnosticsBySession.delete(oldest);
    }
  }
  const DROP_WARN_WINDOW_MS = 5_000;
  let lastDropWarnAt = 0;

  function recordDroppedFrame(sessionId: string | undefined, seq: number | undefined, bufferedAmount: number) {
    droppedFramesTotal++;
    if (sessionId) droppedFramesBySession.set(sessionId, (droppedFramesBySession.get(sessionId) ?? 0) + 1);
    const now = Date.now();
    if (now - lastDropWarnAt >= DROP_WARN_WINDOW_MS) {
      lastDropWarnAt = now;
      console.warn(
        `[browser-gw] dropped frame (back-pressure) hop=server→browser sessionId=${sessionId ?? "n/a"} seq=${seq ?? "n/a"} bufferedAmount=${bufferedAmount} > MAX_WS_BUFFER=${MAX_WS_BUFFER} (total dropped=${droppedFramesTotal})`,
      );
    }
  }

  function sendTo(ws: WebSocket, msg: ServerToBrowserMessage, ctx?: { sessionId?: string; seq?: number }): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (MAX_WS_BUFFER > 0 && ws.bufferedAmount > MAX_WS_BUFFER) {
      recordDroppedFrame(ctx?.sessionId, ctx?.seq, ws.bufferedAmount);
      return false;
    }
    try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  function sendToReplay(ws: WebSocket, msg: ServerToBrowserMessage) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (MAX_WS_BUFFER > 0 && ws.bufferedAmount > MAX_WS_BUFFER) return REPLAY_SEND_BACKPRESSURE;
    try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  function broadcast(msg: ServerToBrowserMessage) {
    // Serialize once per fan-out: O(payload) instead of O(payload ×
    // subscribers). Matters for large recurring frames such as
    // `openspec_update` on repos with many changes. Back-pressure and
    // liveness guards are preserved (mirrors `sendTo`).
    // See change: scope-openspec-poll-to-active-cwds.
    const serialized = JSON.stringify(msg);
    fanout(serialized);
  }

  function fanout(serialized: string) {
    for (const [ws] of subscriptions) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (MAX_WS_BUFFER > 0 && ws.bufferedAmount > MAX_WS_BUFFER) {
        recordDroppedFrame(undefined, undefined, ws.bufferedAmount);
        continue;
      }
      ws.send(serialized);
    }
  }

  /**
   * Build the `openspec_update` envelope by concatenating the (small) header
   * with the (large) pre-stringified `data` from the worker. Equivalent to
   * `JSON.stringify({ type:"openspec_update", cwd, data })` but skips the
   * `data` re-stringify entirely. See change: offload-openspec-poll-to-worker.
   */
  function broadcastOpenSpecUpdateImpl(cwd: string, dataSerialized: string) {
    const header = `{"type":"openspec_update","cwd":${JSON.stringify(cwd)},"data":`;
    const serialized = header + dataSerialized + "}";
    fanout(serialized);
  }

  replayCoordinator = createReplayCoordinator({
    store: eventStore,
    directoryService,
    sessionManager,
    send: (target, msg) => sendToReplay(target, msg),
    close: (target, code, reason) => target.close(code, reason),
  });

  wss.on("connection", (ws, req) => {
    const remoteAddr = req?.socket?.remoteAddress ?? 'unknown';
    const origin = req?.headers?.origin ?? 'no-origin';
    const ua = req?.headers?.['user-agent'] ?? 'no-ua';
    console.error(`[browser-gw] browser client connected from ${remoteAddr} origin=${origin} ua=${ua.slice(0, 80)} (total: ${subscriptions.size + 1})`);
    const subs = new Set<string>();
    subscriptions.set(ws, subs);

    // Atomic snapshot of the full session registry + per-cwd orders.
    // Replaces the legacy per-session `session_added` loop and per-cwd
    // `sessions_reordered` loop. Client REPLACES (not merges) its
    // `sessions` Map and `sessionOrderMap` on receipt so stale ids from a
    // previous server lifetime are dropped atomically.
    // See change: fix-stale-sessions-on-reconnect.
    {
      const sessionsSnapshot = sessionManager.listAll();
      const orders: Record<string, string[]> = {};
      if (sessionOrderManager) {
        for (const [cwd, sessionIds] of Object.entries(sessionOrderManager.getAllOrders())) {
          if (sessionIds.length > 0) orders[cwd] = sessionIds;
        }
      }
      sendTo(ws, { type: "sessions_snapshot", serverEpoch: serverEpoch ?? eventStore.getSourceGeneration("").split(":")[0], sessions: sessionsSnapshot, orders } as any);
    }

    // Send pinned directories on connect
    if (preferencesStore) {
      sendTo(ws, { type: "pinned_dirs_updated", paths: preferencesStore.getPinnedDirectories() });
      // Send favorite models snapshot on connect. Guarded with `typeof` so
      // old PreferencesStore stubs in tests don't crash.
      // See change: enrich-model-selector-capabilities-favorites.
      if (typeof preferencesStore.getFavoriteModels === "function") {
        sendTo(ws, { type: "favorite_models_updated", labels: preferencesStore.getFavoriteModels() });
      }
      // Send current workspaces snapshot. See change: folder-workspaces.
      // Guarded with `typeof` so old PreferencesStore stubs in tests that
      // predate workspaces still work — they simply get no workspace snapshot.
      if (typeof preferencesStore.getWorkspaces === "function") {
        sendTo(ws, { type: "workspaces_updated", workspaces: preferencesStore.getWorkspaces() });
      }
      // Send display-prefs snapshot on connect so a client that missed a live
      // `display_prefs_updated` broadcast (socket not OPEN at broadcast time)
      // recovers on reconnect without a page reload — parity with the sibling
      // prefs above. Guarded with `typeof` for old stubs; sent ONLY when prefs
      // are defined so a genuinely seedless install still opens the first-launch
      // modal exactly once. See change: fix-first-launch-display-modal-stuck-on-mobile.
      if (typeof preferencesStore.getDisplayPrefs === "function") {
        const displayPrefs = preferencesStore.getDisplayPrefs();
        if (displayPrefs !== undefined) {
          sendTo(ws, { type: "display_prefs_updated", prefs: displayPrefs });
        }
      }
    }

    // Send OpenSpec data for every known directory — exactly one
    // `openspec_update` per cwd, never silently omit.
    // See change: fix-cold-boot-openspec-protocol.
    if (directoryService) {
      for (const msg of buildOpenSpecConnectSnapshot(directoryService, hasOpenSpecDir, hasOpenSpecRoot)) {
        sendTo(ws, msg);
      }
    }

    // Send active terminals on connect
    if (terminalManager) {
      for (const terminal of terminalManager.list()) {
        sendTo(ws, { type: "terminal_added", terminal });
      }
    }

    // Notify server of new connection (for mDNS peer list etc.)
    if (gateway.onConnect) {
      gateway.onConnect(ws);
    }


    ws.on("message", async (raw) => {
      // Malformed (non-JSON) frames are silently dropped. Only frame-parse
      // errors are swallowed here — handler exceptions are logged below so
      // real bugs (e.g. node-pty spawn failures) are not silently hidden.
      let msg: BrowserToServerMessage;
      try {
        msg = JSON.parse(raw.toString()) as BrowserToServerMessage;
      } catch {
        return;
      }
      try {
        const ctx: BrowserHandlerContext = {
          ws, sessionManager, eventStore, piGateway,
          pendingForkRegistry, sessionOrderManager, preferencesStore,
          metaPersistence,
          directoryService, terminalManager,
          headlessPidRegistry, pendingResumeRegistry, pendingDashboardSpawns,
          pendingAttachRegistry,
          pendingInitialPromptRegistry,
          pendingResumeIntents,
          pendingClientCorrelations,
          pendingWorktreeBaseRegistry,
          sendTo, broadcast, getSubscribers, replayPendingUiRequests,
          replayUiState(targetWs, sessionId) { replayUiState(targetWs, sessionId, { sessionManager, sendTo }); },
          broadcastEvent: gateway.broadcastEvent,
          viewMessageStore,
          replayCoordinator,
          trackUiRequest: trackUiRequest,
          markReplaying(targetWs, sessionId) {
            let set = replayingSessions.get(targetWs);
            if (!set) { set = new Set(); replayingSessions.set(targetWs, set); }
            set.add(sessionId);
          },
          clearReplaying(targetWs, sessionId, _lastReplayedSeq) {
            const set = replayingSessions.get(targetWs);
            if (set) {
              set.delete(sessionId);
              if (set.size === 0) replayingSessions.delete(targetWs);
            }
          },        };

        switch (msg.type) {
          case "replay_diagnostic":
            recordReplayDiagnostic(msg);
            break;
          case "subscribe":
            handleSubscribe(msg, subs, ctx);
            break;
          case "unsubscribe":
            subs.delete(msg.sessionId);
            replayCoordinator.unsubscribe(ws, msg.sessionId);
            // Cancel an in-flight hydration once the last subscriber leaves,
            // so clicking session A then B doesn't waste A's parse+replay and
            // deliver an event_replay to a now-unsubscribed ws. Guarded by the
            // subscriber count so co-subscribers' loads aren't dropped.
            // See change: offload-session-events-load-to-worker.
            if (directoryService && getSubscribers(msg.sessionId).length === 0) {
              directoryService.cancelLoad(msg.sessionId);
            }
            break;
          case "send_prompt":
            await handleSendPrompt(msg, ctx);
            break;
          case "abort":
            handleAbort(msg, ctx);
            break;
          case "stop_after_turn":
            if (typeof msg.sessionId === "string" && msg.sessionId.length > 0) {
              handleStopAfterTurn(msg, ctx);
            }
            break;
          // ── Follow-up queue mutation (bridge-owned buffer) ─────────────────
          //
          // The bridge mutates `bridgeFollowUp` locally; nothing touches
          // pi. The OLD pi-mutation message types (clear_steering_queue,
          // clear_followup_slot, edit_followup_slot) STAY DELETED.
          // See change: rework-mid-turn-prompt-queue.
          case "clear_followup_entries":
            handleClearFollowupEntries(msg, ctx);
            break;
          case "edit_followup_entry":
            handleEditFollowupEntry(msg, ctx);
            break;
          case "remove_followup_entry":
            handleRemoveFollowupEntry(msg, ctx);
            break;
          case "promote_followup_entry":
            handlePromoteFollowupEntry(msg, ctx);
            break;
          case "force_kill":
            await handleForceKill(msg, ctx);
            break;
          case "flow_control":
            handleFlowControl(msg, ctx);
            break;
          case "kill_process":
            handleKillProcess(msg, ctx);
            break;
          case "subagent_resync_request":
            handleSubagentResyncRequest(msg, ctx);
            break;
          case "shutdown":
            handleShutdown(msg, ctx);
            break;
          case "rename_session":
            handleRenameSession(msg, ctx);
            break;
          case "hide_session":
            handleHideSession(msg, ctx);
            break;
          case "unhide_session":
            handleUnhideSession(msg, ctx);
            break;
          case "attach_proposal":
            handleAttachProposal(msg, ctx);
            break;
          case "detach_proposal":
            handleDetachProposal(msg, ctx);
            break;
          case "accept_replace_proposal":
            handleAcceptReplaceProposal(msg, ctx);
            break;
          case "dismiss_replace_proposal":
            handleDismissReplaceProposal(msg, ctx);
            break;
          case "setSessionDisplayPrefs":
            handleSetSessionDisplayPrefs(msg, ctx);
            break;
          case "set_session_process_drawer":
            handleSetSessionProcessDrawer(msg, ctx);
            break;
          case "set_session_tags":
            handleSetSessionTags(msg, ctx);
            break;
          case "fetch_content":
            handleFetchContent(msg, ctx);
            break;
          case "list_sessions":
            handleListSessions(msg, ctx);
            break;
          case "resume_session":
            // Reopen is a resolving action for any pending recovery offer:
            // null the server-held offer so onConnect stops replaying it.
            // See change: fix-recovery-offer-dismiss-and-phantom-reopen.
            gateway.onRecoveryResolve?.();
            await handleResumeSession(msg, ctx);
            break;
          case "spawn_session":
            await handleSpawnSession(msg, ctx);
            break;
          case "reorder_sessions":
            handleReorderSessions(msg, ctx);
            break;
          case "pin_directory":
            handlePinDirectory(msg, ctx);
            break;
          case "unpin_directory":
            handleUnpinDirectory(msg, ctx);
            break;
          case "reorder_pinned_dirs":
            handleReorderPinnedDirs(msg, ctx);
            break;
          case "favorite_model":
            handleFavoriteModel(msg, ctx);
            break;
          case "unfavorite_model":
            handleUnfavoriteModel(msg, ctx);
            break;
          case "create_workspace":
            handleCreateWorkspace(msg, ctx);
            break;
          case "rename_workspace":
            handleRenameWorkspace(msg, ctx);
            break;
          case "delete_workspace":
            handleDeleteWorkspace(msg, ctx);
            break;
          case "set_workspace_collapsed":
            handleSetWorkspaceCollapsed(msg, ctx);
            break;
          case "add_folder_to_workspace":
            handleAddFolderToWorkspace(msg, ctx);
            break;
          case "remove_folder_from_workspace":
            handleRemoveFolderFromWorkspace(msg, ctx);
            break;
          case "reorder_workspace_folders":
            handleReorderWorkspaceFolders(msg, ctx);
            break;
          case "reorder_workspaces":
            handleReorderWorkspaces(msg, ctx);
            break;
          case "openspec_refresh":
            handleOpenSpecRefresh(msg, ctx);
            break;
          case "openspec_bulk_archive":
            handleOpenSpecBulkArchive(msg, ctx);
            break;
          case "inject_view_message": {
            // Append a new `/view` row and broadcast the full snapshot to
            // every subscriber of this session. The bridge never sees this
            // message — view rows live in a separate store, not pi's
            // events.jsonl. See change: render-file-previews.
            viewMessageStore.append(msg.sessionId, msg.target);
            const snapshot = viewMessageStore.get(msg.sessionId);
            for (const sub of getSubscribers(msg.sessionId)) {
              sendTo(sub, {
                type: "view_messages_update",
                sessionId: msg.sessionId,
                viewMessages: snapshot,
              });
            }
            break;
          }
          case "recovery_dismiss": {
            // Durable dismissal of a cold-start recovery offer. Consume the
            // on-disk liveness marker for each offered session so it is never
            // re-classified as a recovery candidate (mirrors Chrome consuming
            // its crash sentinel), then flush so the change hits disk before
            // any restart. The server's onRecoveryDismiss callback nulls its
            // held pendingRecoveryOffer so onConnect replay stops.
            // See change: fix-recovery-offer-dismiss-and-phantom-reopen.
            for (const id of msg.sessionIds) {
              const session = sessionManager.get(id);
              if (session?.sessionFile) {
                metaPersistence?.setLiveness(session.sessionFile, { live: false });
              }
            }
            metaPersistence?.flushAll();
            gateway.onRecoveryDismiss?.(msg.sessionIds);
            break;
          }
          case "extension_ui_response": {
            // Clear pending UI request tracking
            const sessionMap = pendingUiRequests.get(msg.sessionId);
            if (sessionMap) {
              sessionMap.delete(msg.requestId);
              if (sessionMap.size === 0) pendingUiRequests.delete(msg.sessionId);
            }
            handleExtensionUiResponse(msg, ctx);
            break;
          }

          case "prompt_response": {
            const sessionId = (msg as any).sessionId;
            const promptId = (msg as any).promptId;
            if (typeof sessionId === "string" && sessionId && typeof promptId === "string" && promptId) {
              queuePromptResponse(sessionId, promptId, msg as any);
            }
            break;
          }

          case "flow_management": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "flow_management",
              sessionId: msg.sessionId,
              action: msg.action,
              flowName: msg.flowName,
              task: msg.task,
              description: msg.description,
              enabled: msg.enabled,
            });
            break;
          }
          case "architect_prompt_response": {
            // Legacy: now handled by prompt_response via PromptBus.
            // Keep case to avoid "unhandled message" warnings from old clients.
            break;
          }
          case "role_set": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "role_set",
              sessionId: msg.sessionId,
              role: (msg as any).role,
              modelId: (msg as any).modelId,
            });
            break;
          }
          case "role_preset_load": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "role_preset_load",
              sessionId: msg.sessionId,
              presetName: (msg as any).presetName,
            });
            break;
          }
          case "role_preset_save": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "role_preset_save",
              sessionId: msg.sessionId,
              presetName: (msg as any).presetName,
            });
            break;
          }
          case "role_preset_delete": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "role_preset_delete",
              sessionId: msg.sessionId,
              presetName: (msg as any).presetName,
            });
            break;
          }
          case "role_remove": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "role_remove",
              sessionId: msg.sessionId,
              role: (msg as any).role,
            });
            break;
          }
          case "request_roles": {
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "request_roles",
              sessionId: msg.sessionId,
            });
            break;
          }
          case "ui_management": {
            // Extension UI System (Phase 1): forward browser action / data
            // request to the bridge unchanged. The bridge re-emits on
            // pi.events; the extension replies via ui_data_list (round-trip
            // handled in event-wiring).
            // See change: add-extension-ui-modal.
            ctx.piGateway.sendToSession(msg.sessionId, {
              type: "ui_management",
              sessionId: msg.sessionId,
              action: msg.action,
              event: msg.event,
              params: msg.params,
            });
            break;
          }
          case "create_terminal":
            handleCreateTerminal(msg, ctx);
            break;
          case "open_inline_terminal":
            handleOpenInlineTerminal(msg, ctx);
            break;
          case "close_inline_terminal":
            handleCloseInlineTerminal(msg, ctx);
            break;
          case "kill_terminal":
            handleKillTerminal(msg, ctx);
            break;
          case "rename_terminal":
            handleRenameTerminal(msg, ctx);
            break;
          case "session_view": {
            // Browser declares it is currently displaying this session.
            // Track the (sessionId, ws) pair AND clear `unread` if set.
            // See change: session-card-unread-stripes.
            viewedSessionTracker.view(msg.sessionId, ws);
            const session = sessionManager.get(msg.sessionId);
            if (session?.unread) {
              sessionManager.update(msg.sessionId, { unread: false });
              broadcast({
                type: "session_updated",
                sessionId: msg.sessionId,
                updates: { unread: false },
              });
            }
            break;
          }
          case "session_unview": {
            viewedSessionTracker.unview(msg.sessionId, ws);
            break;
          }
          default: {
            const type = (msg as { type?: string } | undefined)?.type;
            // plugin_action fans out by pluginId to the owning plugin's handler.
            // Unknown pluginId → structured error to the sender, never a silent
            // drop. See change: fix-plugin-action-fanout-and-handlers.
            if (type === "plugin_action") {
              const pa = msg as { pluginId?: string; action?: string };
              const handler = pa.pluginId ? pluginActionHandlers.get(pa.pluginId) : undefined;
              if (handler) {
                handler(msg, ws);
              } else {
                sendTo(ws, {
                  type: "plugin_action_error",
                  pluginId: pa.pluginId ?? "",
                  ...(pa.action ? { action: pa.action } : {}),
                  error: `no plugin_action handler for pluginId "${pa.pluginId ?? ""}"`,
                });
                console.error(
                  `[browser-gw] plugin_action dropped: no handler for pluginId=${pa.pluginId ?? "(none)"} action=${pa.action ?? "(none)"}`,
                );
              }
            } else if (type && customHandlers.has(type)) {
              // Plugin-registered custom handler takes precedence over pi-gateway forward.
              customHandlers.get(type)!(msg, ws);
            } else {
              // Forward simple pi-gateway commands
              handlePiGatewayForward(msg, ctx);
            }
            break;
          }
        }
      } catch (err) {
        const type = (msg as { type?: string } | undefined)?.type ?? "unknown";
        console.error(
          `[browser-gw] handler error type=${type}:`,
          err,
        );
        // Connection intentionally remains open so subsequent messages are still processed.
      }
    });

    ws.on("close", () => {
      console.error(`[browser-gw] browser client disconnected (remaining: ${subscriptions.size - 1})`);
      subscriptions.delete(ws);
      replayingSessions.delete(ws);
      replayCoordinator.disconnect(ws);
      // Drop this ws from every viewed-session entry so disconnected browsers
      // don't hold sessions in the viewed state. See change: session-card-unread-stripes.
      viewedSessionTracker.unviewAll(ws);
      // Tear down per-connection resources (open-files watch, …).
      // See change: split-editor-workspace.
      for (const fn of disconnectHandlers) {
        try {
          fn(ws);
        } catch (err) {
          console.error("[browser-gw] disconnect handler error:", err);
        }
      }
    });
  });

  const gateway: BrowserGateway = {
    wss,

    sendToClient(ws: WebSocket, msg: ServerToBrowserMessage) {
      return sendTo(ws, msg);
    },

    getReplayDiagnosticStats() {
      return {
        total: replayDiagnosticsTotal,
        byCode: Object.fromEntries(replayDiagnosticsByCode),
        bySession: Object.fromEntries(replayDiagnosticsBySession),
      };
    },

    broadcast(msg: ServerToBrowserMessage) {
      broadcast(msg);
    },

    registerHandler(type, handler) {
      customHandlers.set(type, handler);
    },

    registerPluginActionHandler(pluginId, handler) {
      if (pluginActionHandlers.has(pluginId)) {
        console.warn(
          `[browser-gw] duplicate plugin_action handler for pluginId=${pluginId}; replacing (manifest ids should be unique)`,
        );
      }
      pluginActionHandlers.set(pluginId, handler);
    },

    registerDisconnectHandler(handler) {
      disconnectHandlers.push(handler);
    },

    broadcastEvent(sessionId: string, seq: number, event: any) {
      // Event wiring inserts authoritative events before fan-out. Preserve the
      // gateway's documented direct-send behavior for diagnostics/tests that
      // publish synthetic, unretained frames; those cannot participate in a
      // replay snapshot or its barrier.
      if (!eventStore.getEvent(sessionId, seq)) {
        for (const ws of getSubscribers(sessionId)) sendTo(ws, { type: "event", sessionId, seq, event }, { sessionId, seq });
        return;
      }
      replayCoordinator.publishLive(sessionId, { seq, event });
    },

    broadcastSessionAdded(session: any, opts?: { spawnRequestId?: string }) {
      // Carry the originating client `requestId` (when known) so the
      // browser can auto-select / dismiss its placeholder by exact
      // correlation. See change: spawn-correlation-token.
      broadcast({
        type: "session_added",
        session,
        ...(opts?.spawnRequestId ? { spawnRequestId: opts.spawnRequestId } : {}),
      });
    },

    broadcastSessionUpdated(sessionId: string, updates: any) {
      broadcast({ type: "session_updated", sessionId, updates });
    },

    broadcastSessionRemoved(sessionId: string) {
      broadcast({ type: "session_removed", sessionId });
    },

    broadcastSessionStateReset(sessionId: string, reason = "source_replaced") {
      replayCoordinator.broadcastReset(sessionId, getSubscribers, reason);
    },

    completeBridgeReplay(sessionId: string) {
      void replayCoordinator.completeBridgeReplay(sessionId, getSubscribers, (targetWs, targetSessionId) => replayUiState(targetWs, targetSessionId, { sessionManager, sendTo }));
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

    broadcastOpenSpecUpdate(cwd: string, dataSerialized: string) {
      broadcastOpenSpecUpdateImpl(cwd, dataSerialized);
    },

    getSubscriberCount(sessionId: string): number {
      return getSubscribers(sessionId).length;
    },

    getDroppedFrameStats() {
      return {
        total: droppedFramesTotal,
        bySession: Object.fromEntries(droppedFramesBySession),
      };
    },

    trackUiRequest,

    clearUiRequest(sessionId: string, requestId: string) {
      const sessionMap = pendingUiRequests.get(sessionId);
      if (sessionMap) {
        sessionMap.delete(requestId);
        if (sessionMap.size === 0) {
          pendingUiRequests.delete(sessionId);
        }
      }
    },

    trackPromptRequest,
    clearPromptRequest,
    clearPromptRequestsForTool,
    clearPendingPromptResponses,

    shutdownHeadlessProcesses() {
      headlessPidRegistry.killAll();
    },

    headlessPidRegistry,

    pendingResumeRegistry,

    viewedSessionTracker,
  };

  return gateway;
}
