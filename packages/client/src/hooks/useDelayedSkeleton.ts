import { useEffect, useState } from "react";

/** Delay before the skeleton is allowed to appear (see hook doc below). */
export const SKELETON_DELAY_MS = 150;

/**
 * Delayed skeleton gate for cold-start reveal (Task 2.2,
 * bounded-hot-transcript-state / #48 slice 2).
 *
 * `active` tracks a cold-start read in flight (e.g. `loadingHistory`). The
 * returned flag stays `false` until `active` has been continuously true for
 * `thresholdMs`; a fast (cache-hit) read that resolves before the threshold
 * never shows a skeleton at all — no intermediate DOM state. Once `active`
 * flips false the flag drops immediately (single swap to the resolved
 * content), and re-activating restarts the threshold window.
 *
 * `resetKey` re-arms the window whenever it changes while `active` stays
 * `true` — needed because `ChatView` is reused (not remounted) across
 * session switches, so a still-loading session B must not inherit session
 * A's partially-elapsed or already-fired timer. Pass the session identifier.
 *
 * See change: bounded-hot-transcript-state (Task 2.2). Reuses no #59
 * machinery directly — this only gates when the existing `loadingHistory`
 * skeleton (`ChatView`) is allowed to render.
 */
export function useDelayedSkeleton(
  active: boolean,
  resetKey?: string,
  thresholdMs: number = SKELETON_DELAY_MS,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), thresholdMs);
    return () => clearTimeout(timer);
  }, [active, resetKey, thresholdMs]);

  return visible;
}
