/**
 * parseOption — normalize an ask-question option into a display title + optional
 * description sub-line. Two shapes are supported:
 *   - pi:  a string, split on the first ` — ` (em dash) or ` · ` (middot).
 *   - omp: an object `{ label, description }` (omp's `ask` tool).
 * Used by SelectRenderer / MultiselectRenderer / BatchRenderer.
 *
 * See change: redesign-ask-user-question-cards + omp-ask-option-objects.
 */
export function parseOption(option: unknown): { title: string; description?: string } {
  if (option && typeof option === "object") {
    const o = option as { label?: unknown; description?: unknown };
    if (typeof o.label === "string") {
      return {
        title: o.label,
        description: typeof o.description === "string" && o.description ? o.description : undefined,
      };
    }
  }
  const s = typeof option === "string" ? option : String(option ?? "");
  const sep = /\s(?:—|·)\s/.exec(s);
  if (!sep) return { title: s };
  return {
    title: s.slice(0, sep.index),
    description: s.slice(sep.index + sep[0].length),
  };
}

/**
 * The string sent back as the answer and used as a React key: the pi option
 * string, or the omp option's `label`.
 */
export function optionValue(option: unknown): string {
  if (typeof option === "string") return option;
  if (option && typeof option === "object" && typeof (option as { label?: unknown }).label === "string") {
    return (option as { label: string }).label;
  }
  return String(option ?? "");
}

/** True when an option is a Cancel affordance (case-insensitive). */
export function isCancelOption(option: unknown): boolean {
  return /^cancel$/i.test(optionValue(option).trim());
}
