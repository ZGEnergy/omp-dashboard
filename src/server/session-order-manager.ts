/**
 * Manages per-cwd session ordering with persistence via PreferencesStore.
 * All mutations are synchronous — Node.js event loop provides concurrency safety.
 */
import type { PreferencesStore } from "./preferences-store.js";

export interface SessionOrderManager {
  /** Insert session into cwd order. Prepends by default, or inserts after afterSessionId. */
  insert(cwd: string, sessionId: string, afterSessionId?: string): void;
  /** Replace the full order for a cwd. */
  reorder(cwd: string, sessionIds: string[]): void;
  /** Remove a session from its cwd order. */
  remove(cwd: string, sessionId: string): void;
  /** Get order for a cwd, optionally filtering to only valid IDs. */
  getOrder(cwd: string, validIds?: Set<string>): string[];
  /** Get all cwd→order entries. */
  getAllOrders(): Record<string, string[]>;
}

export function createSessionOrderManager(preferencesStore: PreferencesStore): SessionOrderManager {
  // Load initial state from store
  const orderMap: Record<string, string[]> = { ...preferencesStore.getSessionOrder() };

  function persist(): void {
    preferencesStore.setSessionOrder({ ...orderMap });
  }

  return {
    insert(cwd: string, sessionId: string, afterSessionId?: string): void {
      if (!orderMap[cwd]) {
        orderMap[cwd] = [];
      }
      const arr = orderMap[cwd];

      // Don't duplicate
      if (arr.includes(sessionId)) return;

      if (afterSessionId) {
        const idx = arr.indexOf(afterSessionId);
        if (idx !== -1) {
          arr.splice(idx + 1, 0, sessionId);
        } else {
          arr.unshift(sessionId);
        }
      } else {
        arr.unshift(sessionId);
      }
      persist();
    },

    reorder(cwd: string, sessionIds: string[]): void {
      orderMap[cwd] = [...sessionIds];
      persist();
    },

    remove(cwd: string, sessionId: string): void {
      if (!orderMap[cwd]) return;
      orderMap[cwd] = orderMap[cwd].filter((id) => id !== sessionId);
      persist();
    },

    getOrder(cwd: string, validIds?: Set<string>): string[] {
      const arr = orderMap[cwd];
      if (!arr) return [];
      if (!validIds) return [...arr];
      return arr.filter((id) => validIds.has(id));
    },

    getAllOrders(): Record<string, string[]> {
      return { ...orderMap };
    },
  };
}
