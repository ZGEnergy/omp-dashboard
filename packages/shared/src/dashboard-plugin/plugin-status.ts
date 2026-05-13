/**
 * Plugin status types used in /api/health.plugins[] and WebSocket broadcasts.
 */

/**
 * Where pi-coding-agent's loader will (or won't) find this plugin's bridge.
 *
 * - `"packages[]"`     — bridge path present in `settings.json#packages[]`
 *                         (pi reads this; bridge will load on session start)
 * - `"dashboardPluginBridges"` — only present in the legacy key pi ignores
 *                         (loaded: false expected)
 * - `"none"`           — plugin has no bridge entry or registration failed
 *
 * See change: fix-pi-flows-end-to-end (Group 2).
 */
export type BridgeLoadSource = "packages[]" | "dashboardPluginBridges" | "none";

/**
 * Latest bridge-status probe forwarded from the pi-side extension (for
 * status-emitting bridges like flows-anthropic-bridge). Omitted when the
 * plugin has no bridge or hasn't reported yet.
 */
export interface BridgeProbeSnapshot {
  status: "probing" | "waiting_peers" | "active" | "degraded";
  /** Per-peer probe results keyed by the peer spec (e.g. "@pi/anthropic-messages"). */
  peers: Record<string, { ok: boolean; reason?: string }>;
  /** Unix-ms timestamp when the bridge emitted this snapshot. */
  at: number;
}

/** Status of a single discovered plugin, reported by /api/health. */
export interface PluginStatus {
  id: string;
  enabled: boolean;
  loaded: boolean;
  /** Error message if the plugin failed to load or has a conflict. */
  error?: string;
  /** Number of slot claims declared in the plugin's manifest. */
  claims: number;
  /**
   * Where the bridge entry is registered, classified at health-check time.
   * See change: fix-pi-flows-end-to-end Group 2.
   */
  bridgeLoadedFrom?: BridgeLoadSource;
  /** Latest bridge-status probe (only present for status-emitting bridges). */
  lastProbe?: BridgeProbeSnapshot;
}

/** WebSocket broadcast sent to all browsers when a plugin's config changes. */
export interface PluginConfigUpdate {
  type: "plugin_config_update";
  /** Plugin id that was updated. */
  id: string;
  /**
   * Only this plugin's namespace config (plugins.<id>.*).
   * Never contains other plugins' config.
   */
  config: unknown;
}
