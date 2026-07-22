/**
 * Pure decision logic for the cold-start skeleton gate (Task 2.2,
 * bounded-hot-transcript-state / #48 slice 2).
 *
 * `loadingHistory` already flips `true` synchronously the instant a cold
 * (or delta/older) replay subscribe is sent — including on a cache hit that
 * resolves in a handful of milliseconds. Rendering a skeleton immediately on
 * that flag would violate the cold-start contract: cache-hit must produce
 * one stable paint with zero intermediate DOM states. `shouldShowSkeleton`
 * gates the skeleton behind a short threshold so a fast-resolving read never
 * shows it at all; only a read that is genuinely slow earns the loading
 * affordance. See change: bounded-hot-transcript-state (Task 2.2).
 */
export const SKELETON_DELAY_MS = 150;

/**
 * @param elapsedMs milliseconds since the cold-start read began.
 * @param resolved whether the read has since completed (any elapsed time).
 * @param thresholdMs delay before the skeleton is allowed to appear.
 */
export function shouldShowSkeleton(
  elapsedMs: number,
  resolved: boolean,
  thresholdMs: number = SKELETON_DELAY_MS,
): boolean {
  return !resolved && elapsedMs >= thresholdMs;
}
