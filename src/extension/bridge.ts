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
import { gatherGitInfo, type GitInfo } from "./git-info.js";
import { extractTurnStats } from "./stats-extractor.js";
import { replayEntriesAsEvents } from "../shared/state-replay.js";
import { expandPromptTemplateFromDisk } from "./prompt-expander.js";
import { detectOpenSpecActivity } from "./openspec-activity-detector.js";
import type { OpenSpecPhase } from "../shared/types.js";
import { createUiProxy } from "./ui-proxy.js";
import { registerAskUserTool } from "./ask-user-tool.js";

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
    initBridge(pi);
  } catch (err) {
    // Never crash the host pi agent — dashboard is non-essential
    console.error("[dashboard] Bridge init failed:", err);
  }
}

/** Filter out hidden commands (names starting with __) from commands list */
function filterHiddenCommands(commands: any[]): any[] {
  return commands.filter((cmd) => !cmd.name.startsWith("__"));
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

  function extractFirstMessage(ctx: any): string | undefined {
    try {
      const entries = ctx.sessionManager.getEntries?.();
      if (!entries || !Array.isArray(entries)) return undefined;
      for (const entry of entries) {
        if (entry.role === "user" && typeof entry.content === "string") {
          return entry.content.slice(0, 200);
        }
        if (entry.role === "user" && Array.isArray(entry.content)) {
          for (const part of entry.content) {
            if (part.type === "text" && typeof part.text === "string") {
              return part.text.slice(0, 200);
            }
          }
        }
      }
    } catch { /* ignore */ }
    return undefined;
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
      // pi.sendUserMessage calls session.prompt() with expandPromptTemplates: false,
      // which skips command/skill expansion. To work around this, we expand prompt
      // templates ourselves by reading the template file and sending the expanded content.
      const expanded = expandPromptTemplateFromDisk(text, process.cwd());
      pi.sendUserMessage(expanded);
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

  function getCurrentModelString(): string | undefined {
    const model = cachedCtx?.model;
    if (!model) return undefined;
    return `${model.provider}/${model.id}`;
  }

  function sendModelUpdateIfChanged() {
    const model = getCurrentModelString();
    const thinkingLevel = (pi as any).getThinkingLevel?.() ?? undefined;
    if (model === lastModel && thinkingLevel === lastThinkingLevel) return;
    lastModel = model;
    lastThinkingLevel = thinkingLevel;
    if (model) {
      connection.send({
        type: "model_update",
        sessionId,
        model,
        thinkingLevel,
      });
    }
  }

  function sendSessionNameIfChanged() {
    const name = pi.getSessionName() ?? "";
    if (name === lastSessionName) return;
    lastSessionName = name;
    connection.send({
      type: "session_name_update",
      sessionId,
      name,
    });
  }

  function sendGitInfoIfChanged(cwd: string) {
    const info = gatherGitInfo(cwd);
    if (!info) return;
    if (info.gitBranch === lastGitBranch && info.gitPrNumber === lastGitPrNumber) return;
    lastGitBranch = info.gitBranch;
    lastGitPrNumber = info.gitPrNumber;
    connection.send({
      type: "git_info_update",
      sessionId,
      ...info,
    });
  }

  function sendStateSync() {
    // Re-register session on reconnect
    const model = getCurrentModelString();
    const thinkingLevel = (pi as any).getThinkingLevel?.() ?? undefined;
    lastModel = model;
    lastThinkingLevel = thinkingLevel;

    // Include session file/dir and first message
    const sessionFile = lastSessionFile ?? cachedCtx?.sessionManager?.getSessionFile?.() ?? undefined;
    const sessionDir = lastSessionDir ?? cachedCtx?.sessionManager?.getSessionDir?.() ?? undefined;
    const firstMessage = extractFirstMessage(cachedCtx);

    connection.send({
      type: "session_register",
      sessionId,
      cwd: process.cwd(),
      name: pi.getSessionName() ?? undefined,
      source: detectSessionSource(cachedHasUI),
      model,
      thinkingLevel,
      sessionFile,
      sessionDir,
      firstMessage,
    });

    // Send commands list
    const commands = filterHiddenCommands(pi.getCommands());
    connection.send({
      type: "commands_list",
      sessionId,
      commands,
    });

    // Send models list
    if (cachedModelRegistry) {
      try {
        const models = cachedModelRegistry.getAvailable().map((m: any) => ({
          provider: m.provider,
          id: m.id,
        }));
        connection.send({ type: "models_list", sessionId, models });
      } catch { /* ignore */ }
    }
  }

  function replaySessionEntries() {
    try {
      const entries = cachedCtx?.sessionManager?.getBranch?.();
      if (!entries || entries.length === 0) return;
      const events = replayEntriesAsEvents(sessionId, entries);
      for (const msg of events) {
        connection.send(msg);
      }
    } catch { /* ignore */ }
  }

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

    // Set up UI proxy to forward dialogs to dashboard.
    // For dashboard-spawned sessions (tmux or headless), skip the TUI race —
    // the dashboard is the primary UI, and the TUI dialog in an unattended
    // tmux window would auto-resolve/flood.
    const dashboardSpawned = !!process.env.PI_DASHBOARD_SPAWNED;
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

    // Extract session file/dir and first message
    const sessionFile = ctx.sessionManager.getSessionFile?.() ?? undefined;
    const sessionDir = ctx.sessionManager.getSessionDir?.() ?? undefined;
    lastSessionFile = sessionFile;
    lastSessionDir = sessionDir;
    const firstMessage = extractFirstMessage(ctx);
    lastFirstMessage = firstMessage;

    // Register session with initial model/thinkingLevel
    lastSessionName = pi.getSessionName() ?? "";
    const initialModel = getCurrentModelString();
    const initialThinkingLevel = (pi as any).getThinkingLevel?.() ?? undefined;
    lastModel = initialModel;
    lastThinkingLevel = initialThinkingLevel;
    connection.send({
      type: "session_register",
      sessionId,
      cwd: ctx.cwd,
      name: lastSessionName || undefined,
      source: detectSessionSource(cachedHasUI),
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

    // Send initial commands list
    const commands = filterHiddenCommands(pi.getCommands());
    connection.send({
      type: "commands_list",
      sessionId,
      commands,
    });

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
  }));

  // Shared handler for session_switch and session_fork
  function handleSessionChange(ctx: any) {
    // Unregister old session
    connection.send({
      type: "session_unregister",
      sessionId,
    });

    // Update to new session identity
    sessionId = ctx.sessionManager.getSessionId();
    lastSessionFile = ctx.sessionManager.getSessionFile?.() ?? undefined;
    lastSessionDir = ctx.sessionManager.getSessionDir?.() ?? undefined;
    const firstMessage = extractFirstMessage(ctx);

    // Reset cached state for new session
    lastFirstMessage = firstMessage;
    lastGitBranch = undefined;
    lastGitPrNumber = undefined;
    lastSessionName = pi.getSessionName() ?? "";
    lastModel = getCurrentModelString();
    lastThinkingLevel = (pi as any).getThinkingLevel?.() ?? undefined;

    // Register new session
    connection.send({
      type: "session_register",
      sessionId,
      cwd: ctx.cwd,
      name: lastSessionName || undefined,
      source: detectSessionSource(cachedHasUI),
      model: lastModel,
      thinkingLevel: lastThinkingLevel,
      sessionFile: lastSessionFile,
      sessionDir: lastSessionDir,
      firstMessage,
    });

    // Replay full session history
    replaySessionEntries();

    // Full state sync
    sendGitInfoIfChanged(ctx.cwd);

    const commands = filterHiddenCommands(pi.getCommands());
    connection.send({
      type: "commands_list",
      sessionId,
      commands,
    });

    if (cachedModelRegistry) {
      try {
        const models = cachedModelRegistry.getAvailable().map((m: any) => ({
          provider: m.provider,
          id: m.id,
        }));
        connection.send({ type: "models_list", sessionId, models });
      } catch { /* ignore */ }
    }

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
          source: detectSessionSource(cachedHasUI),
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
