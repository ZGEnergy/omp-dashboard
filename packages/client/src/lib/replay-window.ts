/**
 * Authoritative merge for the session history window `{ minSeq, hasMoreOlder }`.
 *
 * Every replay frame carries window metadata describing only its own range.
 * A cold baseline replaces the window, an older page advances it downward,
 * and a delta must never regress it — otherwise a cache-admitted older
 * history window would be clobbered by the delta that follows it, silently
 * disabling load-older for the session.
 */
export interface ReplayWindowFrame {
  minSeq: number | null;
  hasMoreOlder: boolean | null;
  kind: "cold" | "delta" | "older";
}

export interface ReplayWindow {
  minSeq: number;
  hasMoreOlder: boolean;
}

export function mergeReplayWindow(
  previous: ReplayWindow | undefined,
  metadata: ReplayWindowFrame,
  ledgerMinSeq: number,
): ReplayWindow | null {
  const inferredMin = (metadata.minSeq ?? ledgerMinSeq) || previous?.minSeq || 0;
  const coldFallback = metadata.kind === "cold" &&
    metadata.minSeq === null && metadata.hasMoreOlder === null && inferredMin > 1;
  if (metadata.minSeq === null && metadata.hasMoreOlder === null && !coldFallback) return null;
  if (metadata.kind === "older") {
    return {
      minSeq: previous ? Math.min(previous.minSeq, inferredMin) : inferredMin,
      hasMoreOlder: metadata.hasMoreOlder ?? previous?.hasMoreOlder ?? false,
    };
  }
  if (metadata.kind === "cold") {
    return {
      minSeq: inferredMin,
      hasMoreOlder: metadata.hasMoreOlder ?? (coldFallback ? true : previous?.hasMoreOlder ?? false),
    };
  }
  // Delta frames describe only their own appended range: keep the established
  // older-history window; a delta shortfall does not prove older history.
  return {
    minSeq: previous ? Math.min(previous.minSeq, inferredMin || previous.minSeq) : inferredMin,
    hasMoreOlder: previous?.hasMoreOlder ?? false,
  };
}
