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
import { extractTurnStats } from "./stats-extractor.js";
import { expandPromptTemplateFromDisk } from "./prompt-expander.js";
import { detectOpenSpecActivity } from "./openspec-activity-detector.js";
import type { OpenSpecPhase } from "../shared/types.js";
import { createUiProxy } from "./ui-proxy.js";
import { registerAskUserTool } from "./ask-user-tool.js";
import { activate as activateProviderRegister, onProviderChanged } from "./provider-register.js";
import type { FlowInfo } from "../shared/types.js";
import type { BridgeContext } from "./bridge-context.js";
import { filterHiddenCommands, extractFirstMessage, getCurrentModelString } from "./bridge-context.js";
import { sendStateSync as _sendStateSync, replaySessionEntries as _replaySessionEntries, handleSessionChange as _handleSessionChange } from "./session-sync.js";
import { sendModelUpdateIfChanged as _sendModelUpdateIfChanged, sendSessionNameIfChanged as _sendSessionNameIfChanged, sendGitInfoIfChanged as _sendGitInfoIfChanged } from "./model-tracker.js";
import { registerFlowEventListeners } from "./flow-event-wiring.js";

const HEARTBEAT_INTERVAL = 15_000;
const GIT_POLL_INTERVAL = 30_000;



// Use globalThis to survive jiti module cache invalidation on /reload
const BRIDGE_KEY = "__pi_dashboard_bridge__";
interface BridgeState {
  cleanup?: () => void;
  sessionId?: string;
  ctx?: any;
  modelRegistry?: any;
  hasUI?: boolean;
}
function getBridgeState(): BridgeState {
  if (!(globalThis as any)[BRIDGE_KEY]) {
    (globalThis as any)[BRIDGE_KEY] = {};
  }
  return (globalThis as any)[BRIDGE_KEY];
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
  prev.cleanup?.();
  prev.cleanup = undefined;
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
      const msg = data as ServerToExtensionMessage;
      // Route UI responses to the proxy
      if (msg.type === "extension_ui_response" && uiProxy) {
        uiProxy.handleResponse(msg);
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
      sendStateSync();
      replaySessionEntries();
      connection.send({ type: "replay_complete", sessionId });
      // Re-send pending interactive UI requests so the new server can track them
      uiProxy?.resendPending();
    }),
  });

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

        // Route flow management commands via direct event emission
        if (cmdName === "flows:new") {
          pi.events.emit("flows:new-request", { description: cmdArgs.trim() });
          return;
        }
        if (cmdName === "flows:edit") {
          pi.events.emit("flows:edit-request", { flowName: cmdArgs.trim() });
          return;
        }
        if (cmdName === "flows:delete") {
          pi.events.emit("flow:delete-request", { flowName: cmdArgs.trim() });
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

  // Forward all relevant pi events
  const eventTypes = [
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

  // OpenSpec activity tracking
  let currentOpenSpecPhase: OpenSpecPhase | undefined;
  let currentOpenSpecChange: string | undefined;

  function sendOpenSpecActivityUpdate(phase?: OpenSpecPhase, changeName?: string) {
    connection.send({
      type: "openspec_activity_update",
      sessionId,
      phase,
      changeName,
    });
  }

  for (const eventType of eventTypes) {
    pi.on(eventType as any, safe(async (event: any, ctx: any) => {
      // Always keep latest context for abort/shutdown
      cachedCtx = ctx;
      // Don't send events before session_start has established the correct session ID
      if (!sessionReady) return;
      // For model_select, enrich the event data with thinkingLevel
      if (eventType === "model_select") {
        const enriched = { ...event, thinkingLevel: (pi as any).getThinkingLevel?.() };
        const msg = mapEventToProtocol(sessionId, enriched);
        connection.send(msg);
        // Also send a model_update for session-level tracking
        sendModelUpdateIfChanged();
        return;
      }

      // Detect OpenSpec activity from tool calls
      if (eventType === "tool_execution_start") {
        const detected = detectOpenSpecActivity(
          event.toolName as string,
          event.args as Record<string, unknown> | undefined,
        );
        if (detected) {
          let changed = false;
          if (detected.phase && detected.phase !== currentOpenSpecPhase) {
            currentOpenSpecPhase = detected.phase;
            changed = true;
          }
          if (detected.changeName && detected.changeName !== currentOpenSpecChange) {
            currentOpenSpecChange = detected.changeName;
            changed = true;
          }
          if (changed) {
            sendOpenSpecActivityUpdate(currentOpenSpecPhase, currentOpenSpecChange);
          }
        }
      }

      // Clear OpenSpec activity when agent finishes
      if (eventType === "agent_end") {
        if (currentOpenSpecPhase || currentOpenSpecChange) {
          currentOpenSpecPhase = undefined;
          currentOpenSpecChange = undefined;
          connection.send({
            type: "openspec_activity_update",
            sessionId,
            phase: null,
            changeName: null,
          });
        }
      }

      const msg = mapEventToProtocol(sessionId, event);
      connection.send(msg);
    }));
  }

  pi.on("session_start", safe(async (_event: any, ctx: any) => {
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

    // Start heartbeat
    heartbeatTimer = setInterval(() => {
      connection.send({
        type: "session_heartbeat",
        sessionId,
      });
    }, HEARTBEAT_INTERVAL);

    // Start git info + name/model polling
    gitPollTimer = setInterval(() => {
      sendGitInfoIfChanged(ctx.cwd);
      sendSessionNameIfChanged();
      sendModelUpdateIfChanged();
    }, GIT_POLL_INTERVAL);

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
    cachedCtx = ctx;
    handleSessionChange(ctx);
  }));

  pi.on("session_fork" as any, safe(async (_event: any, ctx: any) => {
    cachedCtx = ctx;
    handleSessionChange(ctx);
  }));

  pi.on("turn_end", safe(async (event: any, ctx: any) => {
    cachedCtx = ctx;
    if (!sessionReady) return;

    // Send firstMessage update after first turn if not previously sent
    if (!lastFirstMessage) {
      const firstMsg = extractFirstMessage(ctx);
      if (firstMsg) {
        lastFirstMessage = firstMsg;
        connection.send({
          type: "session_register",
          sessionId,
          cwd: ctx.cwd,
          source: detectSessionSource(cachedHasUI, lastSessionFile),
          firstMessage: firstMsg,
        });
      }
    }

    const stats = extractTurnStats(
      event as Record<string, unknown>,
      ctx.getContextUsage(),
    );

    if (stats) {
      connection.send({
        type: "stats_update",
        sessionId,
        stats: stats as any,
      });
    }
  }));

  pi.on("session_shutdown", safe(async () => {
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

    connection.disconnect();
  };

  // Reload is handled by session_start which fires on /reload too
}
