/**
 * Correlates an explicit advisor spawn intent with the bridge registration that
 * proves it belongs to that spawn. Entries are keyed only by the server-minted
 * spawn token: cwd, terminal names, and registration arrival order are never
 * identity signals here.
 */
export interface PendingAdvisorRegistry {
  /** Arm advisor proof for a successful spawn token. */
  record(spawnToken: string): void;
  /** Consume advisor proof after the token has been verified on registration. */
  consume(spawnToken: string | undefined): { advisor: true } | undefined;
  /** Number of unconsumed records, exposed for focused tests. */
  size(): number;
}

export function createPendingAdvisorRegistry(): PendingAdvisorRegistry {
  const pendingAdvisorBySpawnToken = new Map<string, { advisor: true }>();

  return {
    record(spawnToken: string): void {
      if (spawnToken) pendingAdvisorBySpawnToken.set(spawnToken, { advisor: true });
    },

    consume(spawnToken: string | undefined): { advisor: true } | undefined {
      if (!spawnToken) return undefined;
      const pending = pendingAdvisorBySpawnToken.get(spawnToken);
      if (pending) pendingAdvisorBySpawnToken.delete(spawnToken);
      return pending;
    },

    size(): number {
      return pendingAdvisorBySpawnToken.size;
    },
  };
}
