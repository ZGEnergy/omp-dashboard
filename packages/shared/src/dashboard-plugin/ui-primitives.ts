/**
 * UI primitive registry — public contract types.
 *
 * Defines the stable string keys plugins use to look up dashboard-provided
 * UI primitives (components + helpers) at runtime via `useUiPrimitive(key)`.
 * Each key has a typed contract in `UiPrimitiveMap`; the contract is the
 * primitive's public API — adding optional props is non-breaking, renaming
 * or removing required props is breaking.
 *
 * The dashboard's main.tsx is responsible for registering an implementation
 * for every key in `UI_PRIMITIVE_KEYS`. The registry runtime itself lives in
 * `@blackbelt-technology/dashboard-plugin-runtime`; this file is just types
 * and key constants so it can be imported safely from any layer (no React
 * runtime cost for non-renderer consumers).
 *
 * See change: add-plugin-ui-primitive-registry.
 */
import type { ComponentType, ReactNode } from "react";

/**
 * Frozen set of stable string keys identifying registered UI primitives.
 *
 * Keys are namespaced under `ui:` so they're easy to grep and so future
 * registries (e.g. server-side or extension-specific) won't collide.
 *
 * Adding a key is non-breaking. Renaming or removing a key requires a
 * deprecation cycle (register both keys for one minor release with a
 * warning, then remove).
 */
export const UI_PRIMITIVE_KEYS = {
  /** Reusable card container with status-colored border, header, optional stats line. */
  agentCard: "ui:agent-card",
  /** Markdown renderer with code highlighting, math, mermaid, tables, lightbox. */
  markdownContent: "ui:markdown-content",
  /** Modal yes/no confirmation dialog. */
  confirmDialog: "ui:confirm-dialog",
  /** Base modal portal: renders children at `document.body` with body-scroll lock. */
  dialogPortal: "ui:dialog-portal",
  /** Typeahead-filtered selection dialog with keyboard navigation. */
  searchableSelectDialog: "ui:searchable-select-dialog",
  /** Zoom in/out/reset button group, paired with a zoom-pan controller. */
  zoomControls: "ui:zoom-controls",
  /** Format a token count as a human-readable string (e.g. 12000 → "12k"). */
  formatTokens: "ui:format-tokens",
  /** Format a duration in milliseconds as a human-readable string. */
  formatDuration: "ui:format-duration",
} as const;

/** Union of all valid UI primitive keys (literal-string narrowed). */
export type UiPrimitiveKey = (typeof UI_PRIMITIVE_KEYS)[keyof typeof UI_PRIMITIVE_KEYS];

// ── Public contract types ──────────────────────────────────────────────────

/**
 * Public prop signature for the agent-card primitive.
 *
 * Mirrors `AgentCardShell` in client-utils. Optional fields stay optional;
 * required fields stay required. Adding a new optional prop is non-breaking;
 * renaming `name` to `title` would be breaking.
 */
export interface UiAgentCardProps {
  name: string;
  status: string;
  headerRight?: ReactNode;
  stats?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  children?: ReactNode;
}

/** Public prop signature for the markdown-content primitive. */
export interface UiMarkdownContentProps {
  content: string;
}

/** Public prop signature for the confirm-dialog primitive. */
export interface UiConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Public prop signature for the dialog-portal primitive. */
export interface UiDialogPortalProps {
  children: ReactNode;
}

/**
 * One option in a searchable-select-dialog. Mirrors `SelectOption` in
 * client-utils so the existing component implementation is contract-compatible
 * without adapter shims.
 */
export interface UiSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  badgeColor?: string;
}

/** Public prop signature for the searchable-select-dialog primitive. */
export interface UiSearchableSelectDialogProps {
  title: string;
  options: UiSelectOption[];
  onSelect: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
  emptyMessage?: string;
}

/** Public prop signature for the zoom-controls primitive. */
export interface UiZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  scale: number;
}

// ── The map ────────────────────────────────────────────────────────────────

/**
 * Type-level mapping from each `UI_PRIMITIVE_KEYS` value to its public
 * implementation contract.
 *
 * Component contracts use `ComponentType<P>` (React functional or class
 * component); helper contracts use plain function signatures. The runtime
 * registry uses this map to type-check both registration and lookup.
 *
 * Adding a key: extend `UI_PRIMITIVE_KEYS` AND add the corresponding entry
 * here. TypeScript will fail builds that reference the new key without
 * matching registration in main.tsx.
 */
export interface UiPrimitiveMap {
  "ui:agent-card": ComponentType<UiAgentCardProps>;
  "ui:markdown-content": ComponentType<UiMarkdownContentProps>;
  "ui:confirm-dialog": ComponentType<UiConfirmDialogProps>;
  "ui:dialog-portal": ComponentType<UiDialogPortalProps>;
  "ui:searchable-select-dialog": ComponentType<UiSearchableSelectDialogProps>;
  "ui:zoom-controls": ComponentType<UiZoomControlsProps>;
  "ui:format-tokens": (n: number) => string;
  "ui:format-duration": (ms: number) => string;
}
