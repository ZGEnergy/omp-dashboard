/**
 * Pristine ctx.ui method originals cache.
 * Keyed by ctx.ui object identity. Stored on `process` so jiti module-cache
 * invalidation cannot recapture PromptBus wrappers as natives (same pattern
 * as bridge.ts BRIDGE_KEY).
 *
 * Recovery is double-keyed: the WeakMap is the fast path (same module
 * instance), but every wrapper also carries its own pristine original
 * (`__pristineOriginal`) so capture can unwrap an already-patched method even
 * when the WeakMap misses — isolated extension vm contexts, an extension
 * reload that loses module-global state, or a bridge re-initialization on a
 * shared ctx.ui. A wrapper is never stored as an "original"; if a genuine
 * native cannot be unwrapped, that method is left undefined (the TUI arm
 * degrades to the dashboard adapter) instead of recursing infinitely.
 */

export interface PristineUiOriginals {
  notify?: (message: string, level?: string) => void;
  select?: (q: string, opts: string[], extra?: unknown) => Promise<string | undefined>;
  input?: (q: string, placeholder?: string, extra?: unknown) => Promise<string | undefined>;
  confirm?: (q: string, msg: string, extra?: unknown) => Promise<boolean>;
  editor?: (q: string, prefill?: string, extra?: unknown) => Promise<string | undefined>;
}

const PRISTINE_UI_KEY = "__pi_dashboard_pristine_ui__";

interface PromptBusTagged extends Function {
  __isPromptBusWrapper?: boolean;
  __pristineOriginal?: (...args: unknown[]) => unknown;
}

/**
 * Walk a wrapper chain down to the underlying native. Bounded by a visited set
 * so a stale cycle cannot loop forever. Returns `undefined` when the value is
 * a wrapper with no recoverable pristine native.
 */
function unwrapPristine(fn: unknown): ((...args: unknown[]) => unknown) | undefined {
  if (typeof fn !== "function") {
    return undefined;
  }
  const seen = new Set<PromptBusTagged>();
  let cur: ((...args: unknown[]) => unknown) | undefined = fn as (
    ...args: unknown[]
  ) => unknown;
  while (cur) {
    const tagged = cur as unknown as PromptBusTagged;
    if (!tagged.__isPromptBusWrapper) {
      return cur;
    }
    if (seen.has(tagged)) {
      return undefined; // wrapper cycle — never usable as an original
    }
    seen.add(tagged);
    const inner = tagged.__pristineOriginal;
    if (typeof inner !== "function") {
      return undefined;
    }
    cur = inner;
  }
  return undefined;
}

export function getOrCreatePristineOriginals(ui: unknown): PristineUiOriginals {
  if (!ui || typeof ui !== "object") {
    return {};
  }

  const proc = process as unknown as Record<string, WeakMap<object, PristineUiOriginals> | undefined>;
  const map = proc[PRISTINE_UI_KEY] ?? (proc[PRISTINE_UI_KEY] = new WeakMap<object, PristineUiOriginals>());
  const existing = map.get(ui);
  if (existing) {
    return existing;
  }

  const record = ui as Record<string, unknown>;
  const keys = ["notify", "select", "input", "confirm", "editor"] as const;

  const captured: Record<string, unknown> = {};
  let warnedUnrecoverable = false;
  for (const key of keys) {
    const fn = record[key];
    if (typeof fn !== "function") {
      continue;
    }
    const original = unwrapPristine(fn);
    if (!original) {
      if ((fn as PromptBusTagged).__isPromptBusWrapper && !warnedUnrecoverable) {
        console.warn(
          `[bridge] getOrCreatePristineOriginals: ui.${key} already-wrapped with no pristine original — TUI arm disabled for it`,
        );
        warnedUnrecoverable = true;
      }
      continue;
    }
    if ((fn as PromptBusTagged).__isPromptBusWrapper && !(fn as PromptBusTagged).__pristineOriginal) {
      (fn as PromptBusTagged).__pristineOriginal = original;
    }
    captured[key] = original.bind(ui);
  }

  const result = captured as unknown as PristineUiOriginals;
  map.set(ui, result);
  return result;
}