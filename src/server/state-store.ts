/**
 * User preferences state store - JSON-backed with debounced writes.
 * Persists hidden session IDs across server restarts.
 */
import path from "node:path";
import { CONFIG_DIR } from "../shared/config.js";
import { readJsonFile, writeJsonFile } from "./json-store.js";

export const STATE_FILE = path.join(CONFIG_DIR, "state.json");

interface StateData {
  hiddenSessions: string[];
}

export interface StateStore {
  isHidden(sessionId: string): boolean;
  setHidden(sessionId: string, hidden: boolean): void;
  getHiddenSessions(): string[];
  /** Flush pending writes immediately (for shutdown). */
  flush(): void;
  /** Stop debounce timer (for cleanup). */
  dispose(): void;
}

const DEBOUNCE_MS = 1000;

export function createStateStore(filePath: string = STATE_FILE): StateStore {
  const data: StateData = readJsonFile<StateData>(filePath, { hiddenSessions: [] });
  const hiddenSet = new Set(data.hiddenSessions);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  function scheduleSave(): void {
    dirty = true;
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (dirty) {
        dirty = false;
        writeJsonFile(filePath, { hiddenSessions: Array.from(hiddenSet) });
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
      writeJsonFile(filePath, { hiddenSessions: Array.from(hiddenSet) });
    }
  }

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
