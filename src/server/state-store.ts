/**
 * User preferences state store - JSON-backed with debounced writes.
 * Persists hidden session IDs across server restarts.
 */
import path from "node:path";
import { CONFIG_DIR } from "../shared/config.js";
import { readJsonFile, writeJsonFile } from "./json-store.js";
import { safeRealpathSync } from "./resolve-path.js";

export const STATE_FILE = path.join(CONFIG_DIR, "state.json");

interface StateData {
  hiddenSessions: string[];
  sessionOrder: Record<string, string[]>;
  pinnedDirectories: string[];
}

export interface StateStore {
  isHidden(sessionId: string): boolean;
  setHidden(sessionId: string, hidden: boolean): void;
  getHiddenSessions(): string[];
  getSessionOrder(): Record<string, string[]>;
  setSessionOrder(order: Record<string, string[]>): void;
  getPinnedDirectories(): string[];
  setPinnedDirectories(dirs: string[]): void;
  pinDirectory(dirPath: string): void;
  unpinDirectory(dirPath: string): void;
  reorderPinnedDirs(dirs: string[]): void;
  /** Flush pending writes immediately (for shutdown). */
  flush(): void;
  /** Stop debounce timer (for cleanup). */
  dispose(): void;
}

const DEBOUNCE_MS = 1000;

export function createStateStore(filePath: string = STATE_FILE): StateStore {
  const data: StateData = readJsonFile<StateData>(filePath, { hiddenSessions: [], sessionOrder: {}, pinnedDirectories: [] });
  const hiddenSet = new Set(data.hiddenSessions);
  let sessionOrder: Record<string, string[]> = data.sessionOrder ?? {};
  // Resolve symlinks in stored pinned paths on load
  const rawPinned = data.pinnedDirectories ?? [];
  let pinnedDirectories: string[] = rawPinned.map(safeRealpathSync);
  // Deduplicate in case symlinks resolved to the same path
  pinnedDirectories = [...new Set(pinnedDirectories)];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Mark dirty if any paths were resolved so the file gets updated
  let dirty = pinnedDirectories.length !== rawPinned.length || pinnedDirectories.some((p, i) => p !== rawPinned[i]);

  function scheduleSave(): void {
    dirty = true;
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (dirty) {
        dirty = false;
        writeJsonFile(filePath, { hiddenSessions: Array.from(hiddenSet), sessionOrder, pinnedDirectories });
      }
    }, DEBOUNCE_MS);
  }

  function flushNow(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (dirty) {
      dirty = false;
      writeJsonFile(filePath, { hiddenSessions: Array.from(hiddenSet), sessionOrder, pinnedDirectories });
    }
  }

  // Persist resolved paths immediately if any changed on load
  if (dirty) scheduleSave();

  return {
    isHidden(sessionId: string): boolean {
      return hiddenSet.has(sessionId);
    },

    setHidden(sessionId: string, hidden: boolean): void {
      if (hidden) {
        if (hiddenSet.has(sessionId)) return;
        hiddenSet.add(sessionId);
      } else {
        if (!hiddenSet.has(sessionId)) return;
        hiddenSet.delete(sessionId);
      }
      scheduleSave();
    },

    getHiddenSessions(): string[] {
      return Array.from(hiddenSet);
    },

    getSessionOrder(): Record<string, string[]> {
      return sessionOrder;
    },

    setSessionOrder(order: Record<string, string[]>): void {
      sessionOrder = order;
      scheduleSave();
    },

    getPinnedDirectories(): string[] {
      return [...pinnedDirectories];
    },

    setPinnedDirectories(dirs: string[]): void {
      pinnedDirectories = [...dirs];
      scheduleSave();
    },

    pinDirectory(dirPath: string): void {
      if (pinnedDirectories.includes(dirPath)) return;
      pinnedDirectories.push(dirPath);
      scheduleSave();
    },

    unpinDirectory(dirPath: string): void {
      const idx = pinnedDirectories.indexOf(dirPath);
      if (idx === -1) return;
      pinnedDirectories.splice(idx, 1);
      scheduleSave();
    },

    reorderPinnedDirs(dirs: string[]): void {
      pinnedDirectories = [...dirs];
      scheduleSave();
    },

    flush(): void {
      flushNow();
    },

    dispose(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}
