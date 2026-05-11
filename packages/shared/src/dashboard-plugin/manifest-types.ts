import type { SlotId, SettingsTab } from "./slot-types.js";

/**
 * A single slot claim in a plugin manifest.
 */
export interface PluginClaim {
  /** The slot this claim targets. */
  slot: SlotId;
  /** Exported component name from the plugin's client entry (for React slots). */
  component?: string;
  /** Route command for "command-route" slot (e.g. "/specs"). */
  command?: string;
  /** Trigger id for "anchored-popover" slot. */
  trigger?: string;
  /** toolName for "tool-renderer" slot. */
  toolName?: string;
  /**
   * For "settings-section" slot: which SettingsPanel tab to render in.
   * Defaults to "general" if omitted.
   */
  tab?: SettingsTab;
  /** Slot-specific extra config. */
  config?: Record<string, unknown>;
  /**
   * Optional exported predicate function name for filtering contributions.
   * Answers "does this claim apply to this target?" — a claim failing its
   * predicate is removed from the slot's claim list entirely.
   */
  predicate?: string;
  /**
   * Optional exported sync function name. Answers "will this claim's component
   * produce visible output for this target?" — a claim whose shouldRender
   * returns false is NOT mounted and counts as absent for the wrapper-gate
   * helpers (e.g. `useSlotHasClaimsForSession`), so parent subcards hide
   * cleanly. Use when the component conditionally returns `null` based on
   * dynamic state (e.g. "extension not installed"). MUST be synchronous.
   *
   * See change: auto-hide-empty-session-subcards.
   */
  shouldRender?: string;
}

/**
 * The pi-dashboard-plugin manifest.
 * Declared as the `pi-dashboard-plugin` field in a package.json,
 * or as a top-level `dashboard-plugin.json` adjacent to package.json.
 */
export interface PluginManifest {
  /** Globally unique kebab-case plugin id. */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /**
   * Lower number = rendered earlier in multi-contribution slots.
   * Default 1000. First-party plugins use 100.
   */
  priority?: number;
  /** Relative path to the bundled client entry (from package root). */
  client?: string;
  /** Optional relative path to the server entry. */
  server?: string;
  /** Optional relative path to a pi-extension/bridge entry. */
  bridge?: string;
  /** Optional relative path to a JSON Schema 7 file for plugin config validation. */
  configSchema?: string;
  /** Slot claims. */
  claims: PluginClaim[];
  /**
   * When true, the plugin is a test fixture and SHALL be excluded from
   * production bundles (NODE_ENV=production).
   */
  fixture?: boolean;
}
