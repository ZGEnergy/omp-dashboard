/**
 * Plugin status types used in /api/health.plugins[] and WebSocket broadcasts.
 */

/** Status of a single discovered plugin, reported by /api/health. */
export interface PluginStatus {
  id: string;
  enabled: boolean;
  loaded: boolean;
  /** Error message if the plugin failed to load or has a conflict. */
  error?: string;
  /** Number of slot claims declared in the plugin's manifest. */
  claims: number;
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
