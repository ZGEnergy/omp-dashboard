/**
 * Per-fire payload interpolation.
 *
 * Resolves the `${{trigger}}` token against a trigger's single per-fire value
 * (see `FireContext.value`). Applied centrally in the engine's dispatch over
 * an action's `payload` BEFORE the action runs, so no action needs its own
 * substitution logic.
 *
 * Rules:
 *   - A string that is EXACTLY `${{trigger}}` resolves to the typed value
 *     unchanged (whole-value pass-through — preserves number/boolean/object).
 *   - A string that embeds `${{trigger}}` in other text stringifies the value
 *     at that boundary.
 *   - An absent value (`undefined`) resolves `${{trigger}}` to `""`.
 *   - Objects/arrays are walked recursively; other primitives pass through.
 *
 * See change: wire-flow-inputs-in-automation.
 */

const WHOLE = /^\$\{\{trigger\}\}$/;
const EMBED = /\$\{\{trigger\}\}/g;

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** Recursively resolve `${{trigger}}` in a payload value. */
export function interpolate(value: unknown, triggerValue: unknown): unknown {
  if (typeof value === "string") {
    if (WHOLE.test(value)) return triggerValue ?? "";
    return value.replace(EMBED, () => stringify(triggerValue));
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, triggerValue));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(v, triggerValue)]),
    );
  }
  return value;
}
