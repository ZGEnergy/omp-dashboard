/**
 * Narrow open-files watcher for the editor pane's changed-on-disk banner.
 *
 * Scope is the pane's **open files only** — not the whole `cwd` tree. Watchers
 * are keyed per (connection, sessionId, relPath) so a browser declares exactly
 * which files it has open (`watch_files`) and the server reconciles the set:
 * new paths get an `fs.watch`, gone paths are closed. `clearConnection` tears
 * every watcher for a disconnected browser down so no file descriptors leak.
 *
 * Best-effort: `fs.watch` is path-based. On Linux (inotify) a rename-in-place
 * edit (tmp + rename) can detach the watch from the new inode, so a later
 * change may not fire. The banner is a hint, not a guarantee; the pane's manual
 * refresh stays authoritative.
 *
 * See change: split-editor-workspace.
 */

import { type FSWatcher, watch } from "node:fs";
import path from "node:path";

/** Synchronous logical containment: `abs` equals or sits under `cwd`. */
function withinCwd(abs: string, cwd: string): boolean {
  const rel = path.relative(cwd, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export type FileChangeListener = (sessionId: string, relPath: string) => void;

interface WatchKey {
  sessionId: string;
  relPath: string;
}

export interface FileWatchManager {
  /**
   * Reconcile the watched set for (ws, sessionId) to exactly `relPaths`. Adds
   * watchers for new paths, closes watchers for removed paths. `onChange` fires
   * with (sessionId, relPath) on a change event (debounced per watcher).
   */
  setWatched(ws: object, sessionId: string, cwd: string, relPaths: string[], onChange: FileChangeListener): void;
  /** Tear down every watcher held by a connection (call on ws close). */
  clearConnection(ws: object): void;
  /** Total live `fs.watch` handles (tests / diagnostics). */
  activeWatchCount(): number;
}

const CHANGE_DEBOUNCE_MS = 40;

export function createFileWatchManager(): FileWatchManager {
  // ws → keyString → FSWatcher. keyString = `${sessionId}\u0000${relPath}`.
  const byConnection = new Map<object, Map<string, FSWatcher>>();

  const keyOf = (k: WatchKey) => `${k.sessionId}\u0000${k.relPath}`;

  function closeWatcher(map: Map<string, FSWatcher>, keyString: string): void {
    const w = map.get(keyString);
    if (w) {
      try {
        w.close();
      } catch {
        /* already closed */
      }
      map.delete(keyString);
    }
  }

  return {
    setWatched(ws, sessionId, cwd, relPaths, onChange) {
      let map = byConnection.get(ws);
      if (!map) {
        map = new Map();
        byConnection.set(ws, map);
      }

      // Desired keys for THIS session (other sessions on the same ws untouched).
      const desired = new Set(relPaths.map((rel) => keyOf({ sessionId, relPath: rel })));

      // Remove watchers for this session's paths that are no longer desired.
      const sessionPrefix = `${sessionId}\u0000`;
      for (const existing of [...map.keys()]) {
        if (existing.startsWith(sessionPrefix) && !desired.has(existing)) {
          closeWatcher(map, existing);
        }
      }

      // Add watchers for newly-desired paths (synchronous, cwd-contained).
      for (const rel of relPaths) {
        const keyString = keyOf({ sessionId, relPath: rel });
        if (map.has(keyString)) continue; // already watched
        const abs = path.resolve(cwd, rel);
        if (!withinCwd(abs, cwd)) continue; // never watch outside cwd
        let timer: NodeJS.Timeout | null = null;
        try {
          const watcher = watch(abs, () => {
            if (timer) return; // debounce a burst of events into one
            timer = setTimeout(() => {
              timer = null;
              onChange(sessionId, rel);
            }, CHANGE_DEBOUNCE_MS);
          });
          watcher.on("error", () => closeWatcher(map!, keyString));
          map.set(keyString, watcher);
        } catch {
          /* file vanished / unwatchable — skip */
        }
      }
    },

    clearConnection(ws) {
      const map = byConnection.get(ws);
      if (!map) return;
      for (const key of [...map.keys()]) closeWatcher(map, key);
      byConnection.delete(ws);
    },

    activeWatchCount() {
      let n = 0;
      for (const map of byConnection.values()) n += map.size;
      return n;
    },
  };
}
