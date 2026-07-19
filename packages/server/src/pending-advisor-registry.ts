/**
 * Correlates an explicit advisor spawn intent with the bridge registration that
 * proves it belongs to that spawn. Entries are keyed only by the server-minted
 * spawn token: cwd, terminal names, and registration arrival order are never
 * identity signals here.
 */
const defaultUnconfirmedReservationTtlMs = () => 5 * 60_000;

type AdvisorProof = { advisor: true };
type DeferredConsumer = (proof: AdvisorProof) => void;

interface PendingEntry {
  armed: boolean;
  timer: ReturnType<typeof setTimeout>;
  consumer?: DeferredConsumer;
}

export interface PendingAdvisorRegistry {
  /** Reserve a token while the async advisor spawn is in flight. */
  reserve(spawnToken: string): void;
  /**
   * Confirm a successful spawn and begin its registration window from this
   * instant, using the exact timeout snapshot passed to the watchdog.
   */
  arm(spawnToken: string, registrationWindowMs: number): void;
  /** Discard a reservation when its spawn fails or throws. */
  discard(spawnToken: string): void;
  /** True when a server-minted token belongs to an advisor spawn in flight. */
  has(spawnToken: string | undefined): boolean;
  /**
   * Consume armed proof after verified registration. If registration wins the
   * spawn's completion race, retain its consumer until `arm` succeeds.
   */
  consume(spawnToken: string | undefined, onConfirmed?: DeferredConsumer): AdvisorProof | undefined;
  /** Drop all pending timers and records during shutdown/tests. */
  dispose(): void;
  /** Number of unconsumed records, exposed for focused tests. */
  size(): number;
}

export interface PendingAdvisorRegistryOptions {
  /** Bounded cleanup for reservations whose async spawn never completes. */
  getUnconfirmedReservationTtlMs?: () => number;
}

export function createPendingAdvisorRegistry(
  options?: PendingAdvisorRegistryOptions,
): PendingAdvisorRegistry {
  const getUnconfirmedReservationTtlMs = options?.getUnconfirmedReservationTtlMs ?? defaultUnconfirmedReservationTtlMs;
  const pendingAdvisorBySpawnToken = new Map<string, PendingEntry>();

  function remove(spawnToken: string): PendingEntry | undefined {
    const entry = pendingAdvisorBySpawnToken.get(spawnToken);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    pendingAdvisorBySpawnToken.delete(spawnToken);
    return entry;
  }

  return {
    reserve(spawnToken: string): void {
      if (!spawnToken) return;
      remove(spawnToken);
      const timer = setTimeout(
        () => pendingAdvisorBySpawnToken.delete(spawnToken),
        getUnconfirmedReservationTtlMs(),
      );
      timer.unref?.();
      pendingAdvisorBySpawnToken.set(spawnToken, { armed: false, timer });
    },

    arm(spawnToken: string, registrationWindowMs: number): void {
      const entry = pendingAdvisorBySpawnToken.get(spawnToken);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.armed = true;
      entry.timer = setTimeout(() => pendingAdvisorBySpawnToken.delete(spawnToken), registrationWindowMs);
      entry.timer.unref?.();
      if (entry.consumer) {
        remove(spawnToken);
        entry.consumer({ advisor: true });
      }
    },

    discard(spawnToken: string): void {
      remove(spawnToken);
    },

    has(spawnToken: string | undefined): boolean {
      return Boolean(spawnToken && pendingAdvisorBySpawnToken.has(spawnToken));
    },

    consume(spawnToken: string | undefined, onConfirmed?: DeferredConsumer): AdvisorProof | undefined {
      if (!spawnToken) return undefined;
      const entry = pendingAdvisorBySpawnToken.get(spawnToken);
      if (!entry) return undefined;
      if (entry.armed) {
        remove(spawnToken);
        return { advisor: true };
      }
      if (onConfirmed) entry.consumer = onConfirmed;
      return undefined;
    },

    dispose(): void {
      for (const entry of pendingAdvisorBySpawnToken.values()) clearTimeout(entry.timer);
      pendingAdvisorBySpawnToken.clear();
    },

    size(): number {
      return pendingAdvisorBySpawnToken.size;
    },
  };
}
