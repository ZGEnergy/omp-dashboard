/**
 * In-memory plugin status store.
 * Tracks load success/failure for each discovered plugin.
 * Consumed by /api/health.plugins[].
 */
import type { PluginStatus } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/plugin-status.js";

export interface PluginStatusStore {
  setStatus(status: PluginStatus): void;
  getStatus(id: string): PluginStatus | undefined;
  listAll(): PluginStatus[];
}

export function createPluginStatusStore(): PluginStatusStore {
  const store = new Map<string, PluginStatus>();
  return {
    setStatus(status: PluginStatus) {
      store.set(status.id, status);
    },
    getStatus(id: string) {
      return store.get(id);
    },
    listAll(): PluginStatus[] {
      return Array.from(store.values());
    },
  };
}
