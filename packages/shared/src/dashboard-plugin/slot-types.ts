/**
 * Frozen slot taxonomy for the dashboard plugin system.
 * These ids and their payload contracts are versioned via
 * @blackbelt-technology/pi-dashboard-shared.
 *
 * Adding a slot: minor (non-breaking).
 * Removing or renaming a slot: major (breaking).
 */

/** All valid slot ids (frozen for v0.x). */
export type SlotId =
  // React-only slots
  | "sidebar-folder-section"
  | "session-card-action-bar"
  | "workspace-action-bar"
  // (session-card-memory is also react-only; declared below for ordering)
  | "content-inline-footer"
  | "anchored-popover"
  | "command-route"
  | "tool-renderer"
  // React-or-descriptor slots
  | "session-card-memory"
  | "session-card-badge"
  | "content-view"
  | "content-header-sticky"
  | "settings-section"
  // Descriptor-only slots (from extension-ui-system)
  | "management-modal"
  | "footer-segment"
  | "agent-metric"
  | "breadcrumb"
  | "gate"
  | "toast"
  | "rjsf-form";

/** How many contributions a slot allows. */
export type Multiplicity = "one" | "many" | "one-active";

/** Which payload types the slot accepts. */
export type PayloadTier = "react-only" | "descriptor-only" | "react-or-descriptor";

export interface SlotDefinition {
  multiplicity: Multiplicity;
  payloadTier: PayloadTier;
  description: string;
}

/** Frozen slot definitions map for v0.x. */
export const SLOT_DEFINITIONS: Record<SlotId, SlotDefinition> = {
  "sidebar-folder-section": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Collapsible block above session list per workspace folder",
  },
  "session-card-badge": {
    multiplicity: "many",
    payloadTier: "react-or-descriptor",
    description: "Compact info chip on a session card",
  },
  "session-card-action-bar": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Action buttons on a session card",
  },
  "session-card-memory": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Memory/Honcho contributions inside the MEMORY subcard of a session card",
  },
  "workspace-action-bar": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Action buttons inside the WORKSPACE subcard of a session card (jj/git workspace tooling)",
  },
  "content-view": {
    multiplicity: "one-active",
    payloadTier: "react-or-descriptor",
    description: "Full-screen content area view for a session",
  },
  "content-header-sticky": {
    multiplicity: "many",
    payloadTier: "react-or-descriptor",
    description: "Sticky header above the content view",
  },
  "content-inline-footer": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Inline footer below the content view (React-only)",
  },
  "anchored-popover": {
    multiplicity: "one",
    payloadTier: "react-only",
    description: "Popover anchored to a UI trigger element",
  },
  "command-route": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Maps a slash command or URL route to a content view",
  },
  "settings-section": {
    multiplicity: "many",
    payloadTier: "react-or-descriptor",
    description: "A section in the Settings page",
  },
  "tool-renderer": {
    multiplicity: "many",
    payloadTier: "react-only",
    description: "Custom React renderer for a specific tool call by toolName",
  },
  // Descriptor-only (extension-ui-system)
  "management-modal": {
    multiplicity: "many",
    payloadTier: "descriptor-only",
    description: "Full-screen management modal (extension-ui-system)",
  },
  "footer-segment": {
    multiplicity: "many",
    payloadTier: "descriptor-only",
    description: "Segment in the session footer bar (extension-ui-system)",
  },
  "agent-metric": {
    multiplicity: "one",
    payloadTier: "descriptor-only",
    description: "Metric chip on an agent card (extension-ui-system)",
  },
  "breadcrumb": {
    multiplicity: "many",
    payloadTier: "descriptor-only",
    description: "Breadcrumb item in the content header (extension-ui-system)",
  },
  "gate": {
    multiplicity: "many",
    payloadTier: "descriptor-only",
    description: "Flow gate/checkpoint UI (extension-ui-system)",
  },
  "toast": {
    multiplicity: "many",
    payloadTier: "descriptor-only",
    description: "Transient notification toast (extension-ui-system)",
  },
  "rjsf-form": {
    multiplicity: "many",
    payloadTier: "descriptor-only",
    description: "JSON-Schema-driven form (extension-ui-system Phase 4)",
  },
};

/** Valid settings tab ids in SettingsPanel. */
export type SettingsTab =
  | "general"
  | "servers"
  | "packages"
  | "providers"
  | "security"
  | "advanced";

export const VALID_SETTINGS_TABS: SettingsTab[] = [
  "general",
  "servers",
  "packages",
  "providers",
  "security",
  "advanced",
];
