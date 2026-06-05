/**
 * Resolve the optional `session_register` visibility fields the bridge
 * forwards to the server (fact-forwarding only; the server decides what to
 * do with them). See change: auto-hide-headless-worker-sessions.
 */

/**
 * Map the bridge's environment to an explicit visibility override.
 * `PI_DASHBOARD_VISIBLE` wins over `PI_DASHBOARD_HIDDEN` (explicit show beats
 * hide). Absent ⇒ undefined (server falls back to its auto-hide heuristic).
 */
export function resolveVisibilityIntent(
  env: NodeJS.ProcessEnv,
): "hidden" | "visible" | undefined {
  if (env.PI_DASHBOARD_VISIBLE) return "visible";
  if (env.PI_DASHBOARD_HIDDEN) return "hidden";
  return undefined;
}

/**
 * Build the optional `{ hasUI?, visibilityIntent? }` slice of a
 * `session_register` payload. Fields are omitted (not set to undefined) when
 * absent so legacy/back-compat behavior is preserved on the wire.
 */
export function buildVisibilityRegisterFields(
  hasUI: boolean | undefined,
  env: NodeJS.ProcessEnv,
): { hasUI?: boolean; visibilityIntent?: "hidden" | "visible" } {
  const fields: { hasUI?: boolean; visibilityIntent?: "hidden" | "visible" } = {};
  if (hasUI !== undefined) fields.hasUI = hasUI;
  const intent = resolveVisibilityIntent(env);
  if (intent) fields.visibilityIntent = intent;
  return fields;
}
