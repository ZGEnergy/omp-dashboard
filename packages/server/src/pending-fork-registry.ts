/**
 * Tracks pending fork operations to place forked sessions after their parent.
 * Entries expire after 30 seconds if not consumed.
 */

const EXPIRY_MS = 30_000;

interface PendingFork {
  parentSessionId: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface PendingForkRegistry {
  /** Record that a fork was initiated from parentSessionId in the given cwd. */
  recordFork(cwd: string, parentSessionId: string): void;
  /** Consume and return the parent session ID for a cwd, or undefined if none pending. */
  consumeFork(cwd: string): string | undefined;
  /** Clear all pending entries and timers. */
  dispose(): void;
}

export function createPendingForkRegistry(): PendingForkRegistry {
  const pending = new Map<string, PendingFork>();

  return {
    recordFork(cwd: string, parentSessionId: string): void {
      // Clear previous entry for same cwd
      const existing = pending.get(cwd);
      if (existing) {
        clearTimeout(existing.timer);
      }
      const timer = setTimeout(() => {
        pending.delete(cwd);
      }, EXPIRY_MS);
      pending.set(cwd, { parentSessionId, timer });
    },

    consumeFork(cwd: string): string | undefined {
      const entry = pending.get(cwd);
      if (!entry) return undefined;
      clearTimeout(entry.timer);
      pending.delete(cwd);
      return entry.parentSessionId;
    },

    dispose(): void {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
      }
      pending.clear();
    },
  };
}
