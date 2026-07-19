/**
 * Correlates an explicit advisor spawn intent with the bridge registration that
 * proves it belongs to that spawn. Entries are keyed only by the server-minted
 * spawn token: cwd, terminal names, and registration arrival order are never
 * identity signals here.
 */
const DEFAULT_TTL_MS = 60_000;

type AdvisorProof = { advisor: true };
type DeferredConsumer = (proof: AdvisorProof) => void;

interface PendingEntry {
  confirmed: boolean;
  timer: ReturnType<typeof setTimeout>;
  consumer?: DeferredConsumer;
}

export interface PendingAdvisorRegistry {
  /** Reserve a token while an advisor spawn awaits its crash gate. */
  reserve(spawnToken: string): void;
  /** Confirm a reserved token only after its spawn succeeds. */
  confirm(spawnToken: string): void;
  /** Discard a reservation when its spawn fails or throws. */
  discard(spawnToken: string): void;
  /**
   * Consume confirmed proof after verified registration. If registration wins
   * the spawn's completion race, retain its consumer until `confirm` succeeds.
   */
  consume(spawnToken: string | undefined, onConfirmed?: DeferredConsumer): AdvisorProof | undefined;
  /** Drop all pending timers and records during shutdown/tests. */
  dispose(): void;
  /** Number of unconsumed records, exposed for focused tests. */
  size(): number;
}

export interface PendingAdvisorRegistryOptions {
  ttlMs?: number;
}

export function createPendingAdvisorRegistry(
  options?: PendingAdvisorRegistryOptions,
): PendingAdvisorRegistry {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
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
      const timer = setTimeout(() => pendingAdvisorBySpawnToken.delete(spawnToken), ttlMs);
      timer.unref?.();
      pendingAdvisorBySpawnToken.set(spawnToken, { confirmed: false, timer });
    },

    confirm(spawnToken: string): void {
      const entry = pendingAdvisorBySpawnToken.get(spawnToken);
      if (!entry) return;
      entry.confirmed = true;
      if (entry.consumer) {
        remove(spawnToken);
        entry.consumer({ advisor: true });
      }
    },

    discard(spawnToken: string): void {
      remove(spawnToken);
    },

    consume(spawnToken: string | undefined, onConfirmed?: DeferredConsumer): AdvisorProof | undefined {
      if (!spawnToken) return undefined;
      const entry = pendingAdvisorBySpawnToken.get(spawnToken);
      if (!entry) return undefined;
      if (entry.confirmed) {
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
