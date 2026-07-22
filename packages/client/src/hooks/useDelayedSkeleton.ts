import { useEffect, useState } from "react";
import { SKELETON_DELAY_MS } from "../lib/delayed-skeleton.js";

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
 * See change: bounded-hot-transcript-state (Task 2.2). Reuses no #59
 * machinery directly — this only gates when the existing `loadingHistory`
 * skeleton (`ChatView`) is allowed to render.
 */
export function useDelayedSkeleton(active: boolean, thresholdMs: number = SKELETON_DELAY_MS): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), thresholdMs);
    return () => clearTimeout(timer);
  }, [active, thresholdMs]);

  return visible;
}
