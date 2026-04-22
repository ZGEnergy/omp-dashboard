/**
 * Tiny FIFO semaphore for throttling concurrent async operations.
 *
 * Used by the server's openspec polling scheduler to cap how many
 * `openspec` CLI spawns may be running at once. Rolled in-repo instead
 * of pulling `p-limit` because we need `setMax()` for live reconfig
 * (when the user edits `openspec.maxConcurrentSpawns` in settings).
 *
 * Contract:
 *   - `run(fn)` runs `fn` through the gate. At most `max` tasks are
 *     in-flight; excess tasks queue FIFO.
 *   - `setMax(n)` resizes. Growing drains the queue up to the new cap
 *     on the next microtask. Shrinking does not interrupt in-flight
 *     tasks; it only affects newly queued ones.
 *   - `size()` = active + queued.
 *   - If the task throws/rejects, the slot is released and queued
 *     tasks proceed.
 */
export interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>;
  setMax(n: number): void;
  size(): number;
}

export function createSemaphore(max: number): Semaphore {
  if (!Number.isFinite(max) || max < 1) {
    throw new Error(`Semaphore max must be a positive integer, got ${max}`);
  }
  let limit = Math.floor(max);
  let active = 0;
  const queue: Array<() => void> = [];

  function drain() {
    while (active < limit && queue.length > 0) {
      const next = queue.shift()!;
      active++;
      next();
    }
  }

  function release() {
    active--;
    // Schedule drain on microtask so `run()` callers see a stable state first.
    queueMicrotask(drain);
  }

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          let settled = false;
          try {
            Promise.resolve()
              .then(fn)
              .then(
                (value) => { if (!settled) { settled = true; release(); resolve(value); } },
                (err) => { if (!settled) { settled = true; release(); reject(err); } },
              );
          } catch (err) {
            if (!settled) { settled = true; release(); reject(err); }
          }
        };
        if (active < limit) {
          active++;
          start();
        } else {
          queue.push(start);
        }
      });
    },
    setMax(n: number): void {
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Semaphore max must be a positive integer, got ${n}`);
      }
      limit = Math.floor(n);
      // Drain synchronously so callers that do `setMax(n); await tick` see queued tasks started.
      drain();
    },
    size(): number {
      return active + queue.length;
    },
  };
}
