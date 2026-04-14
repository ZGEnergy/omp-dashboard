/**
 * Client-side component registry for PromptBus.
 *
 * Maps component type strings to metadata about how to render prompts.
 * Built-in type: "generic-dialog" (default interactive dialog).
 * Extensions can register additional types (e.g. "architect-prompt").
 */

export interface PromptComponentInfo {
  /** Component type identifier */
  type: string;
  /** Where this component renders */
  placement: "inline" | "widget-bar" | "overlay";
}

const registry = new Map<string, PromptComponentInfo>();

// Register built-in generic dialog
registry.set("generic-dialog", {
  type: "generic-dialog",
  placement: "inline",
});

// Register architect prompt (widget bar rendering)
registry.set("architect-prompt", {
  type: "architect-prompt",
  placement: "widget-bar",
});

/**
 * Get component info by type. Falls back to generic-dialog for unknown types.
 */
export function getPromptComponentInfo(type: string): PromptComponentInfo {
  return registry.get(type) ?? registry.get("generic-dialog")!;
}

/**
 * Register a custom prompt component type.
 */
export function registerPromptComponent(info: PromptComponentInfo): void {
  registry.set(info.type, info);
}

/**
 * Check if a prompt should render in the widget bar (vs inline in chat).
 */
export function isWidgetBarPrompt(componentType: string): boolean {
  const info = getPromptComponentInfo(componentType);
  return info.placement === "widget-bar";
}
