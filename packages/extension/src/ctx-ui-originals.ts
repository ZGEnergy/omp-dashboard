/**
 * Pristine ctx.ui method originals cache.
 * Keyed by ctx.ui object identity to guarantee idempotence across session_start calls.
 */

export interface PristineUiOriginals {
  notify?: (message: string, level?: string) => void;
  select?: (q: string, opts: string[], extra?: any) => Promise<string | undefined>;
  input?: (q: string, placeholder?: string, extra?: any) => Promise<string | undefined>;
  confirm?: (q: string, msg: string, extra?: any) => Promise<boolean>;
  editor?: (q: string, prefill?: string, extra?: any) => Promise<string | undefined>;
}

const pristineUiMap = new WeakMap<object, PristineUiOriginals>();

export function getOrCreatePristineOriginals(ui: any): PristineUiOriginals {
  if (!ui || typeof ui !== 'object') {
    return {};
  }

  const existing = pristineUiMap.get(ui);
  if (existing) {
    return existing;
  }

  const captured: PristineUiOriginals = {
    notify: typeof ui.notify === 'function' ? ui.notify.bind(ui) : undefined,
    select: typeof ui.select === 'function' ? ui.select.bind(ui) : undefined,
    input: typeof ui.input === 'function' ? ui.input.bind(ui) : undefined,
    confirm: typeof ui.confirm === 'function' ? ui.confirm.bind(ui) : undefined,
    editor: typeof ui.editor === 'function' ? ui.editor.bind(ui) : undefined,
  };

  // Dev warning if captured method is already wrapped
  for (const fn of Object.values(captured)) {
    if (fn && (fn as any).__isPromptBusWrapper) {
      console.warn('[bridge] getOrCreatePristineOriginals: captured an already-wrapped ui method');
      break;
    }
  }

  pristineUiMap.set(ui, captured);
  return captured;
}
