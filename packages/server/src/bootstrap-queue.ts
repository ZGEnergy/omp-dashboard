/**
 * In-memory queue for pi-dependent operations deferred during bootstrap
 * install. When `bootstrapState.status === "installing"`, callers should
 * enqueue their handler and return a 202 Accepted with the ticketId.
 * When status transitions to "ready", `flushAll()` runs every queued
 * handler sequentially in enqueue order.
 *
 * Queue is process-local and NOT persisted. If the dashboard crashes
 * mid-install, queued requests are lost — documented as a known
 * limitation in design.md §16.2.
 *
 * See change: unified-bootstrap-install.
 */
import { randomUUID } from "node:crypto";

export interface QueuedTicket<T> {
  ticketId: string;
  /**
   * Resolves when the queued handler runs (or rejects if it throws).
   * Call sites can await this when they want to synchronously return
   * the eventual result — but 202-Accepted flows MUST NOT await, they
   * return the ticketId to the client immediately.
   */
  result: Promise<T>;
}

export interface BootstrapQueue {
  enqueue<T>(handler: () => Promise<T>): QueuedTicket<T>;
  flushAll(): Promise<void>;
  /** Number of currently pending tickets. */
  size(): number;
  /** Drop all pending tickets without running them (used at shutdown). */
  clear(reason?: string): void;
  /**
   * Register a listener invoked after each ticket runs (success or
   * failure). The server wires this to a `bootstrap_ticket_complete`
   * WS broadcast so browser clients can correlate the outcome of a
   * 202-accepted request via their stored ticketId.
   * See change: unified-bootstrap-install.
   */
  onTicketComplete(
    listener: (evt: { ticketId: string; success: boolean; error?: string }) => void,
  ): () => void;
}

interface PendingEntry {
  ticketId: string;
  run: () => Promise<void>;
  /** Reject the caller's `result` promise. Called by `clear()` to
   *  drain tickets at shutdown. */
  reject: (err: unknown) => void;
}

export function createBootstrapQueue(): BootstrapQueue {
  const pending: PendingEntry[] = [];
  const listeners = new Set<
    (evt: { ticketId: string; success: boolean; error?: string }) => void
  >();

  function notify(evt: { ticketId: string; success: boolean; error?: string }): void {
    for (const l of listeners) {
      try {
        l(evt);
      } catch (err) {
        console.error("[bootstrap-queue] ticket-complete listener threw:", err);
      }
    }
  }

  return {
    enqueue<T>(handler: () => Promise<T>): QueuedTicket<T> {
      const ticketId = randomUUID();
      let resolve!: (value: T) => void;
      let reject!: (err: unknown) => void;
      const result = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      pending.push({
        ticketId,
        reject,
        run: async () => {
          try {
            const value = await handler();
            resolve(value);
            notify({ ticketId, success: true });
          } catch (err) {
            reject(err);
            const message = err instanceof Error ? err.message : String(err);
            notify({ ticketId, success: false, error: message });
          }
        },
      });
      return { ticketId, result };
    },

    async flushAll(): Promise<void> {
      while (pending.length > 0) {
        const entry = pending.shift();
        if (!entry) break;
        try {
          await entry.run();
        } catch (err) {
          // Handler errors propagate via the ticket's `result` promise;
          // they should never reach here unless there's a bug in `run`.
          console.error(`[bootstrap-queue] ticket ${entry.ticketId} run threw:`, err);
        }
      }
    },

    size() {
      return pending.length;
    },

    clear(reason = "queue cleared") {
      const drained = pending.splice(0, pending.length);
      for (const entry of drained) {
        // Reject the caller's `result` promise directly and broadcast the
        // completion so any browser holding the ticketId learns the
        // outcome.
        entry.reject(new Error(reason));
        notify({ ticketId: entry.ticketId, success: false, error: reason });
      }
    },
    onTicketComplete(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
