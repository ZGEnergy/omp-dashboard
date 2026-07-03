/**
 * Per-session split-workspace state with `localStorage` persistence.
 *
 * The chat + editor split's open state, divider ratio, and orientation persist
 * under `pi-dashboard:split:<sessionId>` so they survive reload within the same
 * browser profile. Mirrors the `editor-pane-state.ts` idiom. All storage access
 * is best-effort: quota errors and corrupt JSON never crash the workspace —
 * they log and fall back to the default (closed) state.
 *
 * See change: split-editor-workspace.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const SPLIT_KEY_PREFIX = "pi-dashboard:split:";

/** Divider ratio clamp — neither pane may collapse below a usable minimum. */
export const RATIO_MIN = 0.25;
export const RATIO_MAX = 0.75;

export type SplitOrientation = "h" | "v";

export interface SplitState {
  /** Whether the editor pane is co-mounted alongside ChatView. */
  open: boolean;
  /** Chat pane fraction of the split (0..1); editor gets the remainder. */
  ratio: number;
  /** `h` = side-by-side (desktop), `v` = stacked (mobile). */
  orientation: SplitOrientation;
}

export const DEFAULT_SPLIT_STATE: SplitState = { open: false, ratio: 0.5, orientation: "h" };

/** Clamp a divider ratio into `[RATIO_MIN, RATIO_MAX]`; NaN → default ratio. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_STATE.ratio;
  return Math.max(RATIO_MIN, Math.min(RATIO_MAX, ratio));
}

function keyFor(sessionId: string): string {
  return SPLIT_KEY_PREFIX + sessionId;
}

/** True only for well-formed persisted state; rejects corrupt/partial blobs. */
function isValidState(v: unknown): v is SplitState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.open === "boolean" &&
    typeof s.ratio === "number" &&
    Number.isFinite(s.ratio) &&
    (s.orientation === "h" || s.orientation === "v")
  );
}

/** Read persisted state for a session; default (closed) on absence/corruption. */
export function loadSplitState(sessionId: string): SplitState {
  if (!sessionId) return DEFAULT_SPLIT_STATE;
  try {
    const raw = globalThis.localStorage?.getItem(keyFor(sessionId));
    if (!raw) return DEFAULT_SPLIT_STATE;
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) {
      console.error(`[split-state] discarding corrupt state for session ${sessionId}`);
      return DEFAULT_SPLIT_STATE;
    }
    // Defensive clamp — a persisted ratio may predate a clamp-range change.
    return { ...parsed, ratio: clampRatio(parsed.ratio) };
  } catch (err) {
    console.error(`[split-state] failed to read state for session ${sessionId}`, err);
    return DEFAULT_SPLIT_STATE;
  }
}

/** Persist state; silently drops the write on quota/disabled storage. */
export function saveSplitState(sessionId: string, state: SplitState): void {
  if (!sessionId) return;
  try {
    globalThis.localStorage?.setItem(keyFor(sessionId), JSON.stringify(state));
  } catch (err) {
    console.warn(`[split-state] failed to persist state for session ${sessionId}`, err);
  }
}

/**
 * Session-scoped split state. Loads from `localStorage` on mount and on
 * `sessionId` change; persists on every change. The updater merges a partial
 * patch and clamps `ratio`.
 */
export function useSplitState(
  sessionId: string,
): [SplitState, (patch: Partial<SplitState>) => void] {
  const [state, setState] = useState<SplitState>(() => loadSplitState(sessionId));
  const prevSession = useRef(sessionId);

  useEffect(() => {
    if (prevSession.current !== sessionId) {
      prevSession.current = sessionId;
      setState(loadSplitState(sessionId));
      return;
    }
    saveSplitState(sessionId, state);
  }, [sessionId, state]);

  // Stable identity (functional setState → no deps) so consumers memoizing on
  // the updater don't churn every render. See change: split-editor-workspace.
  const update = useCallback((patch: Partial<SplitState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.ratio !== undefined) next.ratio = clampRatio(patch.ratio);
      return next;
    });
  }, []);

  return [state, update];
}
