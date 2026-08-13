/**
 * Pristine ctx.ui method originals cache.
 * Keyed by ctx.ui object identity. Stored on `process` so jiti module-cache
 * invalidation cannot recapture PromptBus wrappers as natives (same pattern
 * as bridge.ts BRIDGE_KEY).
 */

export interface PristineUiOriginals {
  notify?: (message: string, level?: string) => void;
  select?: (q: string, opts: string[], extra?: unknown) => Promise<string | undefined>;
  input?: (q: string, placeholder?: string, extra?: unknown) => Promise<string | undefined>;
  confirm?: (q: string, msg: string, extra?: unknown) => Promise<boolean>;
  editor?: (q: string, prefill?: string, extra?: unknown) => Promise<string | undefined>;
}

const PRISTINE_UI_KEY = "__pi_dashboard_pristine_ui__";

interface PromptBusTagged {
  __isPromptBusWrapper?: boolean;
}

export function getOrCreatePristineOriginals(ui: unknown): PristineUiOriginals {
  if (!ui || typeof ui !== "object") {
    return {};
  }

  const proc = process as unknown as Record<PropertyKey, WeakMap<object, PristineUiOriginals> | undefined>;
  const map = proc[PRISTINE_UI_KEY] ?? (proc[PRISTINE_UI_KEY] = new WeakMap<object, PristineUiOriginals>());
  const existing = map.get(ui);
  if (existing) {
    return existing;
  }

  const record = ui as Record<string, unknown>;
  const keys: (keyof PristineUiOriginals)[] = ["notify", "select", "input", "confirm", "editor"];
  for (const key of keys) {
    const fn = record[key];
    if (typeof fn === "function" && (fn as PromptBusTagged).__isPromptBusWrapper) {
      console.warn("[bridge] getOrCreatePristineOriginals: captured an already-wrapped ui method");
      break;
    }
  }

  const captured: PristineUiOriginals = {
    notify: typeof record.notify === "function" ? (record.notify as PristineUiOriginals["notify"])!.bind(ui) : undefined,
    select: typeof record.select === "function" ? (record.select as PristineUiOriginals["select"])!.bind(ui) : undefined,
    input: typeof record.input === "function" ? (record.input as PristineUiOriginals["input"])!.bind(ui) : undefined,
    confirm: typeof record.confirm === "function" ? (record.confirm as PristineUiOriginals["confirm"])!.bind(ui) : undefined,
    editor: typeof record.editor === "function" ? (record.editor as PristineUiOriginals["editor"])!.bind(ui) : undefined,
  };

  map.set(ui, captured);
  return captured;
}
