/**
 * Main barrel export for @blackbelt-technology/dashboard-plugin-runtime.
 */
export * from "./slot-registry.js";
export * from "./slot-consumers.js";
export * from "./slot-error-boundary.js";
export { PluginContextProvider, CurrentPluginLayer, useSessionEvents } from "./plugin-context.js";
export type { PluginContextProviderProps, PluginLogger, PluginRouter } from "./plugin-context.js";
export { publishSessionEvent, clearSessionEvents } from "./session-events-store.js";
export {
  createUiPrimitiveRegistry,
  registerUiPrimitive,
} from "./ui-primitive-registry.js";
export type { UiPrimitiveRegistry } from "./ui-primitive-registry.js";
export {
  UiPrimitiveProvider,
  useUiPrimitive,
  useUiPrimitiveOrNull,
} from "./ui-primitive-context.js";
export type { UiPrimitiveProviderProps } from "./ui-primitive-context.js";
