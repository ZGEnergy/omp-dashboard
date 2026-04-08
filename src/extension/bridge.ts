/**
 * PI Dashboard Bridge Extension
 *
 * Global extension that connects to the dashboard server,
 * forwards all pi events, and relays commands back.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ConnectionManager } from "./connection.js";
import { detectSessionSource } from "./source-detector.js";
import { mapEventToProtocol } from "./event-forwarder.js";
import { createCommandHandler } from "./command-handler.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureConfig } from "../shared/config.js";
import { runDevBuild } from "./dev-build.js";
import { isPortOpen } from "./server-probe.js";
import { launchServer } from "./server-launcher.js";
import { autoStartServer } from "./server-auto-start.js";
import type { ServerToExtensionMessage } from "../shared/protocol.js";
import { expandPromptTemplateFromDisk } from "./prompt-expander.js";

import { createUiProxy } from "./ui-proxy.js";
import { registerAskUserTool } from "./ask-user-tool.js";
import { activate as activateProviderRegister, onProviderChanged } from "./provider-register.js";
import type { FlowInfo } from "../shared/types.js";
import { startMetricsMonitor, stopMetricsMonitor, collectMetrics } from "./process-metrics.js";
import type { BridgeContext } from "./bridge-context.js";
import { filterHiddenCommands, extractFirstMessage, getCurrentModelString } from "./bridge-context.js";
import { sendStateSync as _sendStateSync, replaySessionEntries as _replaySessionEntries, handleSessionChange as _handleSessionChange } from "./session-sync.js";
import { sendModelUpdateIfChanged as _sendModelUpdateIfChanged, sendSessionNameIfChanged as _sendSessionNameIfChanged, sendGitInfoIfChanged as _sendGitInfoIfChanged } from "./model-tracker.js";
import { registerFlowEventListeners, FLOW_EVENT_MAP, SUBAGENT_EVENT_MAP } from "./flow-event-wiring.js";

const HEARTBEAT_INTERVAL = 15_000;
const GIT_POLL_INTERVAL = 30_000;



// Use `process` (not `globalThis`) to survive jiti module cache invalidation
// AND to share state across isolated extension contexts (vm sandboxes).
const BRIDGE_KEY = "__pi_dashboard_bridge__";
interface BridgeState {
  cleanup?: () => void;
  sessionId?: string;
  ctx?: any;
  modelRegistry?: any;
  hasUI?: boolean;
  /** Monotonic generation counter — stale listeners bail out when mismatched */
  generation?: number;
  /** The pi instance that owns the bridge (used to detect subagent re-entry) */
  pi?: ExtensionAPI;
  /** All connection instances from any bridge incarnation (for cleanup) */
  connections?: ConnectionManager[];
  /** All interval timers from any bridge incarnation (for cleanup) */
  timers?: ReturnType<typeof setInterval>[];
}
function getBridgeState(): BridgeState {
  if (!(process as any)[BRIDGE_KEY]) {
    (process as any)[BRIDGE_KEY] = {};
  }
  return (process as any)[BRIDGE_KEY];
}

export default function (pi: ExtensionAPI) {
  try {
    // Activate provider management before bridge init so providers are
    // registered before session_start fires and models_list is sent.
    activateProviderRegister(pi);

    initBridge(pi);
  } catch (err) {
    // Never crash the host pi agent — dashboard is non-essential
    console.error("[dashboard] Bridge init failed:", err);
  }
}





function initBridge(pi: ExtensionAPI) {
  const prev = getBridgeState();

  // If bridge is already active for a different pi instance (e.g. a subagent
  // loading extensions in the same process), skip initialization to avoid
  // invalidating the parent session's bridge connection and event forwarding.
  if (prev.generation && prev.generation > 0 && prev.pi && prev.pi !== pi) {
    return;
  }

  prev.cleanup?.();
  prev.cleanup = undefined;

  // Disconnect ALL orphaned connections from previous bridge incarnations
  if (prev.connections) {
    for (const conn of prev.connections) {
      conn.disconnect();
    }
  }
  prev.connections = [];
  // Clear ALL orphaned timers
  if (prev.timers) {
    for (const t of prev.timers) {
      clearInterval(t);
    }
  }
  prev.timers = [];

  // Bump generation so stale listeners from previous initBridge calls bail out
  const generation = (prev.generation ?? 0) + 1;
  prev.generation = generation;
  prev.pi = pi;
  /** Return true if this bridge instance is still the active one */
  function isActive(): boolean {
    return getBridgeState().generation === generation;
  }

  let sessionId: string = prev.sessionId ?? crypto.randomUUID();
  let sessionReady = false; // true after session_start has run
  let lastSessionFile: string | undefined;
  let lastSessionDir: string | undefined;
  let lastFirstMessage: string | undefined;



  /** Query pi-flows for available flows via synchronous event RPC */
  function getFlowsList(): FlowInfo[] {
    const probe: any = {};
    try {
      pi.events?.emit("flow:list-flows", probe);
    } catch { /* ignore */ }
    return (probe.flows as FlowInfo[] | undefined) ?? [];
  }

  /** Send flows_list message to the dashboard server */
  function sendFlowsList() {
    const flows = getFlowsList();
    console.error(`[dashboard] sendFlowsList: ${flows.length} flows, sessionId=${sessionId.slice(0,8)}`);
    connection.send({ type: "flows_list", sessionId, flows });
  }


  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let gitPollTimer: ReturnType<typeof setInterval> | null = null;
  let lastGitBranch: string | undefined;
  let lastGitPrNumber: number | undefined;
  let lastSessionName: string | undefined;
  let cachedHasUI: boolean | undefined = prev.hasUI;
  let cachedModelRegistry: any | undefined = prev.modelRegistry;
  let cachedCtx: any | undefined = prev.ctx;
  let lastModel: string | undefined;
  let lastThinkingLevel: string | undefined;
  let uiProxy: ReturnType<typeof createUiProxy> | undefined;

  /** Wrap a callback so errors log instead of crashing the host pi agent. */
  function safe<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      try {
        const result = fn(...args);
        if (result && typeof result.catch === "function") {
          return result.catch((err: unknown) => {
            console.error("[dashboard]", err);
          });
        }
        return result;
      } catch (err) {
        console.error("[dashboard]", err);
      }
    }) as T;
  }

  // Load config to determine WebSocket URL
  ensureConfig();
  const config = loadConfig();
  const dashboardUrl = process.env.PI_DASHBOARD_URL ?? `ws://localhost:${config.piPort}`;

  const connection = new ConnectionManager({
    url: dashboardUrl,
    onMessage: safe(async (data: unknown) => {
      if (!isActive()) return; // Stale listener guard
      const msg = data as ServerToExtensionMessage;
      // Route UI responses to the proxy
      if (msg.type === "extension_ui_response" && uiProxy) {
        uiProxy.handleResponse(msg);
        return;
      }
      // Reload auth credentials when dashboard notifies of changes
      if (msg.type === "credentials_updated") {
        try { cachedModelRegistry?.authStorage?.reload?.(); } catch { /* ignore */ }
        return;
      }
      // Route flow control messages to pi-flows via pi.events
      if (msg.type === "flow_control" && pi.events) {
        if (msg.action === "abort") {
          pi.events.emit("flow:abort", {});
        } else if (msg.action === "toggle_autonomous") {
          pi.events.emit("flow:toggle-autonomous", {});
        }
        return;
      }
      const response = await commandHandler.handle(msg);
      if (response) connection.send(response);
      // Immediately send model/thinking update after handling set_thinking_level
      if (msg.type === "set_thinking_level") {
        // Small delay to let pi process the level change
        setTimeout(() => sendModelUpdateIfChanged(), 50);
      }
    }),
    onReconnect: safe(() => {
      if (!isActive()) return; // Stale listener guard
      sendStateSync();
      replaySessionEntries();
      connection.send({ type: "replay_complete", sessionId });
      // Re-send pending interactive UI requests so the new server can track them
      uiProxy?.resendPending();
    }),
  });

  // Track connection so future bridge incarnations can disconnect it
  getBridgeState().connections!.push(connection);

  const commandHandler = createCommandHandler(pi, () => sessionId, {
    getModelRegistry: () => cachedModelRegistry,
    setThinkingLevel: (level: string) => (pi as any).setThinkingLevel?.(level),
    getThinkingLevel: () => (pi as any).getThinkingLevel?.(),
    setModel: async (provider: string, modelId: string) => {
      const registry = cachedModelRegistry;
      if (!registry) return;
      const model = registry.find(provider, modelId);
      if (!model) return;
      try {
        await (pi as any).setModel(model);
      } catch {
        return;
      }
      // model_select event updates cachedCtx; small delay lets it propagate
      setTimeout(() => sendModelUpdateIfChanged(), 50);
    },
    shutdown: () => {
      if (cachedCtx?.shutdown) {
        cachedCtx.shutdown();
      }
      // Safety net: force exit after a short delay in case ctx.shutdown()
      // doesn't terminate (e.g. in RPC mode headless sessions)
      setTimeout(() => process.exit(0), 500);
    },
    abort: () => {
      if (cachedCtx?.abort) {
        cachedCtx.abort();
      }
    },
    eventSink: (msg) => connection.send(msg),
    compact: (opts) => {
      if (cachedCtx?.compact) {
        cachedCtx.compact(opts);
      }
    },
    reload: () => {
      const reloadFn = (globalThis as any)[RELOAD_KEY] as (() => Promise<void>) | undefined;
      if (reloadFn) {
        reloadFn().catch((err: any) => {
          console.error("[dashboard] reload failed:", err);
        });
      } else {
        console.error("[dashboard] reload not available — type /__dashboard_reload in pi TUI once to bootstrap");
      }
    },
    sessionPrompt: (text) => {
      // Route slash commands: management events, flow:run, then fallback
      if (text.startsWith("/") && pi.events) {
        const cmdText = text.slice(1);
        const spaceIdx = cmdText.indexOf(" ");
        const cmdName = spaceIdx === -1 ? cmdText : cmdText.slice(0, spaceIdx);
        const cmdArgs = spaceIdx === -1 ? "" : cmdText.slice(spaceIdx + 1);

        // Route flow management commands via direct event emission.
        // Pass cachedCtx as fallback context for pi-flows handlers
        // where lastCtx may not yet be set.
        if (cmdName === "flows:new") {
          pi.events.emit("flows:new-request", { description: cmdArgs.trim(), ctx: cachedCtx });
          return;
        }
        if (cmdName === "flows:edit") {
          pi.events.emit("flows:edit-request", { flowName: cmdArgs.trim(), ctx: cachedCtx });
          return;
        }
        if (cmdName === "flows:delete") {
          pi.events.emit("flow:delete-request", { flowName: cmdArgs.trim(), ctx: cachedCtx });
          return;
        }

        // Check if it's a user-defined flow via flow:list-flows
        const flowsList = getFlowsList();
        if (flowsList.some(f => f.name === cmdName)) {
          pi.events.emit("flow:run", { flowName: cmdName, task: cmdArgs.trim() || undefined });
          return;
        }
      }
      // Fallback: send as user message (template-expanded).
      // Uses deliverAs:followUp so it queues properly when agent is streaming.
      const expanded = expandPromptTemplateFromDisk(text, process.cwd());
      (pi.sendUserMessage as any)(expanded, { deliverAs: "followUp" });
    },
  });

  // Reload support: extension events only provide ExtensionContext (no reload).
  // ExtensionCommandContext (with reload()) is only available in command handlers.
  // We register __dashboard_reload command; invoking /__dashboard_reload from pi TUI
  // captures ctx.reload(). After first capture, dashboard-triggered reloads work.
  // The captured fn is stored in globalThis to survive module reloads.
  const RELOAD_KEY = "__pi_dashboard_reload_fn__";

  pi.registerCommand("__dashboard_reload", {
    handler: async (_args: string, ctx: any) => {
      if (ctx?.reload) {
        (globalThis as any)[RELOAD_KEY] = () => ctx.reload();
        await ctx.reload();
      }
    },
  });

  /** Sync local variables into BridgeContext for extracted module calls */
  function syncBc(): BridgeContext {
    return {
      pi, connection, sessionId,
      cachedCtx, cachedModelRegistry, cachedHasUI,
      lastModel, lastThinkingLevel,
      lastSessionFile, lastSessionDir, lastFirstMessage,
      lastGitBranch, lastGitPrNumber, lastSessionName,
    };
  }
  /** Sync BridgeContext mutations back to local variables */
  function applyBc(bc: BridgeContext): void {
    sessionId = bc.sessionId;
    cachedCtx = bc.cachedCtx;
    cachedModelRegistry = bc.cachedModelRegistry;
    cachedHasUI = bc.cachedHasUI;
    lastModel = bc.lastModel;
    lastThinkingLevel = bc.lastThinkingLevel;
    lastSessionFile = bc.lastSessionFile;
    lastSessionDir = bc.lastSessionDir;
    lastFirstMessage = bc.lastFirstMessage;
    lastGitBranch = bc.lastGitBranch;
    lastGitPrNumber = bc.lastGitPrNumber;
    lastSessionName = bc.lastSessionName;
  }

  // Local wrappers that sync bc around extracted module calls
  function sendStateSync() { const bc = syncBc(); _sendStateSync(bc, getFlowsList); applyBc(bc); }
  function replaySessionEntries() { _replaySessionEntries(syncBc()); }
  function sendModelUpdateIfChanged() { const bc = syncBc(); _sendModelUpdateIfChanged(bc); applyBc(bc); }
  function sendSessionNameIfChanged() { const bc = syncBc(); _sendSessionNameIfChanged(bc); applyBc(bc); }
  function sendGitInfoIfChanged(cwd: string) { const bc = syncBc(); _sendGitInfoIfChanged(bc, cwd); applyBc(bc); }

  // Forward all pi core events to the dashboard.
  // Events with special enrichment logic:
  const enrichedEventTypes = [
    "agent_start",
    "agent_end",
    "turn_start",
    "turn_end",
    "message_start",
    "message_update",
    "message_end",
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
    "session_compact",
    "model_select",
  ] as const;
  // Pass-through events: forwarded as-is with no special handling.
  // Unrecognized types render as expandable JSON cards in the dashboard.
  const passThroughEventTypes = [
    "tool_call",
    "tool_result",
    "user_bash",
    "input",
    "before_agent_start",
    "resources_discover",
    "session_before_switch",
    "session_before_fork",
    "session_before_compact",
    "session_before_tree",
    "session_tree",
  ] as const;
  // Excluded from subscription (not forwarded):
  // - `context`: carries full message arrays (very large)
  // - `before_provider_request`: carries raw API payloads (very large)
  // - `session_start`: dedicated handler → session_register protocol message
  // - `session_switch`: dedicated handler → session_register protocol message
  // - `session_fork`: dedicated handler → session_register protocol message
  // - `session_shutdown`: dedicated handler → disconnect/cleanup

  // Unified EventBus rename map for the emit intercept (flow + subagent events)
  const EVENT_BUS_MAP: Record<string, string> = { ...FLOW_EVENT_MAP, ...SUBAGENT_EVENT_MAP };

  for (const eventType of enrichedEventTypes) {
    pi.on(eventType as any, safe(async (event: any, ctx: any) => {
      // Bail out if a newer bridge instance has taken over
      if (!isActive()) return;
      // Always keep latest context for abort/shutdown
      cachedCtx = ctx;
      // Don't send events before session_start has established the correct session ID
      if (!sessionReady) return;
      // For model_select, enrich the event data with thinkingLevel
      if (eventType === "model_select") {
        const enriched = { ...event, thinkingLevel: (pi as any).getThinkingLevel?.() };
        const msg = mapEventToProtocol(sessionId, enriched);
        connection.send(msg);
        return;
      }

      // For turn_end, enrich with contextUsage (pi-only API) so server can extract stats
      if (eventType === "turn_end") {
        const contextUsage = ctx.getContextUsage?.();
        if (contextUsage) {
          const enriched = { ...event, contextUsage };
          const msg = mapEventToProtocol(sessionId, enriched);
          connection.send(msg);
          return;
        }
      }

      const msg = mapEventToProtocol(sessionId, event);
      connection.send(msg);
    }));
  }

  // Pass-through events: forward with no enrichment
  for (const eventType of passThroughEventTypes) {
    pi.on(eventType as any, safe(async (event: any, ctx: any) => {
      if (!isActive()) return;
      cachedCtx = ctx;
      if (!sessionReady) return;
      const msg = mapEventToProtocol(sessionId, event);
      connection.send(msg);
    }));
  }

  // EventBus catch-all: intercept pi.events.emit to forward all EventBus
  // traffic (flow events, subagent events, custom extension events).
  // Known channels get renamed via EVENT_BUS_MAP; unknown channels use the
  // channel name directly as the eventType.
  let origEventsEmit: ((channel: string, data: unknown) => void) | undefined;
  if (pi.events) {
    origEventsEmit = pi.events.emit.bind(pi.events);
    pi.events.emit = (channel: string, data: unknown) => {
      if (sessionReady && isActive()) {
        try {
          const eventType = EVENT_BUS_MAP[channel] ?? channel;
          const eventData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
          connection.send({
            type: "event_forward",
            sessionId,
            event: { eventType, timestamp: Date.now(), data: eventData },
          });
        } catch { /* forwarding failure must never break the original emit */ }
      }
      origEventsEmit!(channel, data);
    };
  }

  pi.on("session_start", safe(async (_event: any, ctx: any) => {
    // Bail out if a newer bridge instance has taken over
    if (!isActive()) return;
    const newSessionId = ctx.sessionManager.getSessionId();

    cachedHasUI = ctx.hasUI;
    cachedCtx = ctx;
    sessionId = newSessionId;

    // Register ask_user at runtime (not at load time) to avoid static
    // tool-name conflicts with other extensions like pi-flows.
    registerAskUserTool(pi);

    // Extract session file/dir early — needed for source detection and UI proxy
    const sessionFile = ctx.sessionManager.getSessionFile?.() ?? undefined;
    const sessionDir = ctx.sessionManager.getSessionDir?.() ?? undefined;
    lastSessionFile = sessionFile;
    lastSessionDir = sessionDir;

    // Set up UI proxy to forward dialogs to dashboard.
    // For dashboard-spawned sessions (tmux or headless), skip the TUI race —
    // the dashboard is the primary UI, and the TUI dialog in an unattended
    // tmux window would auto-resolve/flood.
    const dashboardSpawned = detectSessionSource(cachedHasUI, sessionFile) === "dashboard";
    uiProxy = createUiProxy({
      ui: ctx.ui as any,
      hasUI: ctx.hasUI && !dashboardSpawned,
      getSessionId: () => sessionId,
      send: (msg: any) => connection.send(msg),
    });
    // Replace ctx.ui methods with proxied versions.
    // The ui-proxy has a recursion guard (inProxy flag) so even if ctx.ui
    // is already patched from a previous /reload, the TUI race path won't
    // recurse — it falls back to dashboard-only on re-entry.
    // Replace ctx.ui methods with proxied versions.
    // The ui-proxy has a recursion guard (inProxy flag) so even if ctx.ui
    // is already patched from a previous /reload, the TUI race path won't
    // recurse — it falls back to dashboard-only on re-entry.
    (ctx.ui as any).confirm = uiProxy.wrappedUi.confirm;
    (ctx.ui as any).select = uiProxy.wrappedUi.select;
    (ctx.ui as any).input = uiProxy.wrappedUi.input;
    (ctx.ui as any).editor = uiProxy.wrappedUi.editor;
    (ctx.ui as any).notify = uiProxy.wrappedUi.notify;

    // Connect first, then auto-start if needed.
    // session_register must be buffered before any event_forward messages.
    connection.connect();

    // Extract first message (sessionFile/sessionDir already extracted above)
    const firstMessage = extractFirstMessage(ctx);
    lastFirstMessage = firstMessage;

    // Register session with initial model/thinkingLevel
    lastSessionName = pi.getSessionName() ?? "";
    const initialModel = getCurrentModelString(syncBc());
    const initialThinkingLevel = (pi as any).getThinkingLevel?.() ?? undefined;
    lastModel = initialModel;
    lastThinkingLevel = initialThinkingLevel;

    // Include eventCount so server can skip event wipe on reconnect
    let eventCount: number | undefined;
    try {
      const entries = ctx.sessionManager?.getBranch?.();
      if (entries) eventCount = entries.length;
    } catch { /* ignore */ }

    connection.send({
      type: "session_register",
      sessionId,
      cwd: ctx.cwd,
      name: lastSessionName || undefined,
      source: detectSessionSource(cachedHasUI, sessionFile),
      model: initialModel,
      thinkingLevel: initialThinkingLevel,
      sessionFile,
      sessionDir,
      firstMessage,
      eventCount,
    });

    // Allow event forwarding now that session_register is buffered
    sessionReady = true;

    // Replay full session history so the dashboard has all messages
    replaySessionEntries();
    connection.send({ type: "replay_complete", sessionId });

    // Send initial commands list
    const commands = filterHiddenCommands(pi.getCommands());
    connection.send({
      type: "commands_list",
      sessionId,
      commands,
    });

    // Send initial flows list
    sendFlowsList();

    // Send available models
    cachedModelRegistry = (ctx as any).modelRegistry;
    if (cachedModelRegistry) {
      try {
        const models = cachedModelRegistry.getAvailable().map((m: any) => ({
          provider: m.provider,
          id: m.id,
        }));
        connection.send({ type: "models_list", sessionId, models });
      } catch { /* modelRegistry not available */ }
    }

    // Auto-start server if not running (non-blocking — connection will reconnect)
    autoStartServer(config, {
      isPortOpen,
      launchServer,
      notify: (msg, level) => ctx.ui.notify(msg, level),
    }).catch(() => {});

    // Send initial git info
    sendGitInfoIfChanged(ctx.cwd);

    // Start metrics monitor and heartbeat
    startMetricsMonitor();
    heartbeatTimer = setInterval(() => {
      if (!isActive()) return;
      connection.send({
        type: "session_heartbeat",
        sessionId,
        metrics: collectMetrics(),
      });
    }, HEARTBEAT_INTERVAL);
    getBridgeState().timers!.push(heartbeatTimer);

    // Start git info + name/model polling
    gitPollTimer = setInterval(() => {
      if (!isActive()) return;
      sendGitInfoIfChanged(ctx.cwd);
      sendSessionNameIfChanged();
      sendModelUpdateIfChanged();
    }, GIT_POLL_INTERVAL);
    getBridgeState().timers!.push(gitPollTimer);

    // Register flow event listeners (pi-flows emits these via pi.events)
    registerFlowEventListeners(syncBc(), () => sessionReady, getFlowsList);
  }));

  // Shared handler for session_switch and session_fork
  function handleSessionChange(ctx: any) {
    const bc = syncBc();
    _handleSessionChange(bc, ctx, getFlowsList);
    applyBc(bc);

    // Restart polling timers
    if (gitPollTimer) clearInterval(gitPollTimer);
    gitPollTimer = setInterval(() => {
      sendGitInfoIfChanged(ctx.cwd);
    }, GIT_POLL_INTERVAL);
  }

  pi.on("session_switch" as any, safe(async (_event: any, ctx: any) => {
    if (!isActive()) return;
    cachedCtx = ctx;
    handleSessionChange(ctx);
  }));

  pi.on("session_fork" as any, safe(async (_event: any, ctx: any) => {
    if (!isActive()) return;
    cachedCtx = ctx;
    handleSessionChange(ctx);
  }));

  pi.on("turn_end", safe(async (event: any, ctx: any) => {
    if (!isActive()) return;
    cachedCtx = ctx;
    if (!sessionReady) return;

    // Send firstMessage update after first turn if not previously sent
    if (!lastFirstMessage) {
      const firstMsg = extractFirstMessage(ctx);
      if (firstMsg) {
        lastFirstMessage = firstMsg;
        connection.send({
          type: "first_message_update",
          sessionId,
          firstMessage: firstMsg,
        });
      }
    }

  }));

  pi.on("session_shutdown", safe(async () => {
    if (!isActive()) return;
    stopMetricsMonitor();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (gitPollTimer) {
      clearInterval(gitPollTimer);
      gitPollTimer = null;
    }
    connection.send({
      type: "session_unregister",
      sessionId,
    });

    // Give time for the unregister to send
    await new Promise((resolve) => setTimeout(resolve, 100));
    connection.disconnect();
  }));

  // Re-send models list when custom providers finish async discovery
  onProviderChanged(() => {
    if (!isActive()) return;
    if (cachedModelRegistry && sessionReady) {
      try {
        const models = cachedModelRegistry.getAvailable().map((m: any) => ({
          provider: m.provider,
          id: m.id,
        }));
        connection.send({ type: "models_list", sessionId, models });
      } catch { /* ignore */ }
    }
  });

  // Register cleanup for /reload — saves state to globalThis and tears down resources
  const state = getBridgeState();
  state.cleanup = () => {
    const s = getBridgeState();
    s.sessionId = sessionId;
    s.ctx = cachedCtx;
    s.modelRegistry = cachedModelRegistry;
    s.hasUI = cachedHasUI;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (gitPollTimer) { clearInterval(gitPollTimer); gitPollTimer = null; }

    // Dev build & restart: rebuild client and stop server before reload
    if (config.devBuildOnReload) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const packageRoot = path.resolve(__dirname, "..", "..");
      runDevBuild({ packageRoot, serverPort: config.port });
    }

    // Restore original pi.events.emit (EventBus catch-all cleanup)
    if (origEventsEmit && pi.events) {
      pi.events.emit = origEventsEmit;
    }
    connection.disconnect();
  };

  // Reload is handled by session_start which fires on /reload too
}
