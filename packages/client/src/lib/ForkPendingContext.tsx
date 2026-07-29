/**
 * ForkPendingContext — one source of truth for "a fork I just asked for has
 * not come back yet", shared by every fork control.
 *
 * Before this, no fork control gave any feedback on click (issue #107b) and
 * none was disabled while a request was in flight (#107c), so a double-tap
 * spawned two pi sessions. There are five call sites (`ChatView`,
 * `SkillInvocationCard`, `MobileActionMenu`, `SessionCard` / `SessionHeader`,
 * `OpenSpecBoardView`); per-site state would duplicate the same logic five
 * times, so the pending set lives here and the dedup lives once in
 * `useSessionActions.handleResumeSession`.
 *
 * Key = `entryId` when forking from a message, else `sessionId`. Both are
 * UUIDs, so they cannot collide, and per-message components already hold an
 * `entryId` without knowing their sessionId — no new props anywhere.
 *
 * Deliberately NOT routed through `spawnResult` / `SessionList`: that toast
 * slot only renders while the sidebar is mounted, which it is not in the
 * mobile chat view.
 *
 * See change: fork-action-opens-an-empty-chat.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** Safety net: no control may stay disabled forever if a response is lost. */
export const FORK_PENDING_TIMEOUT_MS = 30_000;

export interface ForkPendingController {
  /** Keys (entryId or sessionId) with a fork request in flight. */
  pendingKeys: ReadonlySet<string>;
  /**
   * Record a fork request. Returns `false` when `key` is already pending —
   * the caller MUST then skip the send. This is the client-side duplicate
   * guard; the server has its own via `session.resuming`.
   */
  beginFork: (key: string, sessionId: string, requestId: string) => boolean;
  /** Settle by `requestId`. No-op for requestIds that were not forks. */
  settleFork: (requestId: string) => void;
}

const EMPTY_KEYS: ReadonlySet<string> = Object.freeze(new Set<string>());

const ForkPendingContext = createContext<ReadonlySet<string>>(EMPTY_KEYS);

/**
 * Owns the pending-fork state. `onSettle` is invoked with the SOURCE
 * sessionId on every settle path (server response, correlated `session_added`,
 * or the safety timeout) so the caller can clear that session's optimistic
 * `resuming` flag. Fork sets `resuming` on the source session, which stays
 * alive, so nothing else would ever clear it.
 */
export function useForkPendingController(
  onSettle?: (sessionId: string) => void,
): ForkPendingController {
  const entriesRef = useRef<Map<string, { key: string; sessionId: string; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);

  // Keep the latest callback reachable without re-creating settleFork (which
  // the timeout closure captures).
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  const settleFork = useCallback((requestId: string) => {
    const entry = entriesRef.current.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    entriesRef.current.delete(requestId);
    setPendingKeys((prev) => {
      if (!prev.has(entry.key)) return prev;
      const next = new Set(prev);
      next.delete(entry.key);
      return next;
    });
    onSettleRef.current?.(entry.sessionId);
  }, []);

  const beginFork = useCallback((key: string, sessionId: string, requestId: string): boolean => {
    for (const entry of entriesRef.current.values()) {
      if (entry.key === key) return false;
    }
    const timer = setTimeout(() => settleFork(requestId), FORK_PENDING_TIMEOUT_MS);
    entriesRef.current.set(requestId, { key, sessionId, timer });
    setPendingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    return true;
  }, [settleFork]);

  // Unmount cleanup: never leak a 30 s timer.
  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      for (const entry of entries.values()) clearTimeout(entry.timer);
      entries.clear();
    };
  }, []);

  return useMemo(() => ({ pendingKeys, beginFork, settleFork }), [pendingKeys, beginFork, settleFork]);
}

export function ForkPendingProvider({
  pendingKeys,
  children,
}: {
  pendingKeys: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  return (
    <ForkPendingContext.Provider value={pendingKeys}>
      {children}
    </ForkPendingContext.Provider>
  );
}

/**
 * `isForkPending(key)` for any fork control. Returns `false` for everything
 * when no Provider is mounted, so standalone renders (tests, plugin hosts)
 * behave exactly as they did before.
 */
export function useForkPending(): (key: string | undefined) => boolean {
  const pendingKeys = useContext(ForkPendingContext);
  return useCallback((key: string | undefined) => !!key && pendingKeys.has(key), [pendingKeys]);
}
