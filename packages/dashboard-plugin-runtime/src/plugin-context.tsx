/**
 * Plugin context provider and hooks for dashboard plugins.
 *
 * The PluginContextProvider wraps the entire React app. Each slot consumer
 * pushes a nested CurrentPluginContext layer when rendering a contribution,
 * scoping hooks like usePluginConfig<T>() and logger to the contributing plugin.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { SlotId } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/slot-types.js";
import type { PluginConfigUpdateMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { createSlotRegistry, type SlotRegistry, type ClaimEntry } from "./slot-registry.js";

// ── Logger ───────────────────────────────────────────────────────────────────

export interface PluginLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

function createPluginLogger(pluginId: string): PluginLogger {
  const prefix = `[plugin:${pluginId}]`;
  return {
    info: (msg, ...args) => console.info(prefix, msg, ...args),
    warn: (msg, ...args) => console.warn(prefix, msg, ...args),
    error: (msg, ...args) => console.error(prefix, msg, ...args),
  };
}

// ── Router ───────────────────────────────────────────────────────────────────

export interface PluginRouter {
  open(viewId: string, params?: Record<string, unknown>): void;
  close(): void;
}

// ── Plugin context (outer) ───────────────────────────────────────────────────

export interface PluginContextValue {
  registry: SlotRegistry;
  /** Access session state by id. */
  useSessionState(sessionId: string): DashboardSession | undefined;
  /** Access all sessions. */
  useAllSessions(): DashboardSession[];
  /** Get plugin config for a specific plugin id. */
  getPluginConfig(pluginId: string): Record<string, unknown>;
  /** Subscribe to plugin config updates. Returns an unsubscribe fn. */
  subscribePluginConfig(
    pluginId: string,
    cb: (config: Record<string, unknown>) => void,
  ): () => void;
  /** Dispatch a message over the active WebSocket. */
  send(message: unknown): void;
  /** Router to open/close content views. */
  pluginRouter: PluginRouter;
  /** WebSocket connection (used internally for subscriptions). */
  ws?: WebSocket | null;
}

const PluginReactContext = createContext<PluginContextValue | null>(null);

// ── Per-plugin context (nested, pushed by slot consumers) ────────────────────

interface CurrentPluginContextValue {
  pluginId: string;
}
const CurrentPluginContext = createContext<CurrentPluginContextValue | null>(null);

// ── Public hooks (called from plugin component code) ─────────────────────────

/** @public — called only from plugin slot contributions */
export function usePluginConfig<T = Record<string, unknown>>(): T {
  const outer = useContext(PluginReactContext);
  const current = useContext(CurrentPluginContext);
  if (!current) {
    throw new Error(
      "usePluginConfig must be called from a plugin slot contribution; " +
        "if you need a plugin's config from outside, use server-side getPluginConfig",
    );
  }
  if (!outer) throw new Error("Slot consumer must be rendered inside <PluginContextProvider>");

  const { pluginId } = current;
  const [config, setConfig] = useState<Record<string, unknown>>(
    () => outer.getPluginConfig(pluginId),
  );

  useEffect(() => {
    return outer.subscribePluginConfig(pluginId, setConfig);
  }, [outer, pluginId]);

  return config as T;
}

/** @public */
export function useAllSessions(): DashboardSession[] {
  const ctx = useContext(PluginReactContext);
  if (!ctx) throw new Error("Slot consumer must be rendered inside <PluginContextProvider>");
  return ctx.useAllSessions();
}

/** @public */
export function useSessionState(sessionId: string): DashboardSession | undefined {
  const ctx = useContext(PluginReactContext);
  if (!ctx) throw new Error("Slot consumer must be rendered inside <PluginContextProvider>");
  return ctx.useSessionState(sessionId);
}

/** @public — namespaced logger for the current plugin contribution */
export function usePluginLogger(): PluginLogger {
  const current = useContext(CurrentPluginContext);
  if (!current) {
    throw new Error("usePluginLogger must be called from a plugin slot contribution");
  }
  return React.useMemo(() => createPluginLogger(current.pluginId), [current.pluginId]);
}

/** @public */
export function usePluginSend(): (message: unknown) => void {
  const ctx = useContext(PluginReactContext);
  if (!ctx) throw new Error("Slot consumer must be rendered inside <PluginContextProvider>");
  return ctx.send;
}

/** @public */
export function usePluginRouter(): PluginRouter {
  const ctx = useContext(PluginReactContext);
  if (!ctx) throw new Error("Slot consumer must be rendered inside <PluginContextProvider>");
  return ctx.pluginRouter;
}

// ── Registry accessor ─────────────────────────────────────────────────────────

/** Returns null when outside a PluginContextProvider (graceful degradation). */
export function useSlotRegistryOrNull(): SlotRegistry | null {
  const ctx = useContext(PluginReactContext);
  return ctx ? ctx.registry : null;
}

/** Throws when outside a PluginContextProvider (for test assertions). */
export function useSlotRegistry(): SlotRegistry {
  const ctx = useContext(PluginReactContext);
  if (!ctx) throw new Error("Slot consumer must be rendered inside <PluginContextProvider>");
  return ctx.registry;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export interface PluginContextProviderProps {
  children: ReactNode;
  registry?: SlotRegistry;
  sessions?: DashboardSession[];
  sessionStates?: Map<string, DashboardSession>;
  send?: (message: unknown) => void;
  pluginRouter?: PluginRouter;
  ws?: WebSocket | null;
}

// Per-plugin config store (in-memory, keyed by plugin id)
const pluginConfigs = new Map<string, Record<string, unknown>>();
const configSubscribers = new Map<string, Set<(c: Record<string, unknown>) => void>>();

function getConfig(pluginId: string): Record<string, unknown> {
  return pluginConfigs.get(pluginId) ?? {};
}

function setConfig(pluginId: string, config: Record<string, unknown>): void {
  pluginConfigs.set(pluginId, config);
  const subs = configSubscribers.get(pluginId);
  if (subs) for (const cb of subs) cb(config);
}

function subscribeConfig(
  pluginId: string,
  cb: (config: Record<string, unknown>) => void,
): () => void {
  if (!configSubscribers.has(pluginId)) configSubscribers.set(pluginId, new Set());
  configSubscribers.get(pluginId)!.add(cb);
  return () => configSubscribers.get(pluginId)?.delete(cb);
}

/**
 * Apply an incoming plugin_config_update broadcast.
 * Called by the WebSocket message handler.
 */
export function applyPluginConfigUpdate(update: PluginConfigUpdateMessage): void {
  setConfig(update.id, update.config as Record<string, unknown>);
}

/**
 * Initialize plugin configs from a bulk fetch (e.g. from /api/config).
 */
export function initPluginConfigs(pluginsBlock: Record<string, Record<string, unknown>>): void {
  for (const [id, config] of Object.entries(pluginsBlock)) {
    pluginConfigs.set(id, config);
  }
}

export function PluginContextProvider({
  children,
  registry,
  sessions = [],
  send: sendFn,
  pluginRouter: routerProp,
  ws,
}: PluginContextProviderProps) {
  const resolvedRegistry = registry ?? createSlotRegistry();

  const useAllSessionsFn = useCallback(() => sessions, [sessions]);
  const useSessionStateFn = useCallback(
    (sessionId: string) => sessions.find(s => s.id === sessionId),
    [sessions],
  );

  const send = useCallback(
    (message: unknown) => {
      if (sendFn) sendFn(message);
    },
    [sendFn],
  );

  const pluginRouter = routerProp ?? {
    open: (viewId, _params) => console.warn(`[plugin-router] open(${viewId}) not wired`),
    close: () => console.warn("[plugin-router] close() not wired"),
  };

  // Subscribe to plugin_config_update WebSocket messages
  useEffect(() => {
    if (!ws) return;
    function onMessage(evt: MessageEvent) {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg?.type === "plugin_config_update") {
          applyPluginConfigUpdate(msg as PluginConfigUpdateMessage);
        }
      } catch {
        // ignore parse errors
      }
    }
    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [ws]);

  const value: PluginContextValue = {
    registry: resolvedRegistry,
    useAllSessions: useAllSessionsFn,
    useSessionState: useSessionStateFn,
    getPluginConfig: getConfig,
    subscribePluginConfig: subscribeConfig,
    send,
    pluginRouter,
    ws,
  };

  return <PluginReactContext.Provider value={value}>{children}</PluginReactContext.Provider>;
}

// ── Slot consumer wrapper ─────────────────────────────────────────────────────

/**
 * Wraps a single contribution's component in the nested CurrentPluginContext
 * layer so that usePluginConfig<T>() and usePluginLogger() resolve to the
 * correct plugin's namespace.
 */
export function CurrentPluginLayer({
  pluginId,
  children,
}: {
  pluginId: string;
  children: ReactNode;
}) {
  return (
    <CurrentPluginContext.Provider value={{ pluginId }}>
      {children}
    </CurrentPluginContext.Provider>
  );
}

// Re-export types consumers need
export type { SlotRegistry, ClaimEntry };
export type { SlotId };
