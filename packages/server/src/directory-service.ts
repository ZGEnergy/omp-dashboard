/**
 * DirectoryService — server-side directory-scoped operations.
 *
 * Responsibilities:
 *   - Session discovery and event loading (unchanged).
 *   - OpenSpec polling with an mtime-gated cache, configurable interval,
 *     concurrency cap (semaphore), and deterministic per-cwd jitter to
 *     flatten the CPU envelope.
 *   - Pi resources scanning on its own slower cadence (5× openspec interval)
 *     so it does not stack onto the openspec burst.
 *
 * See change: optimize-openspec-poll-burst for the cost model.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildOpenSpecData,
  pollOpenSpecAsync,
  runOpenSpecList,
  runOpenSpecStatus,
} from "@blackbelt-technology/pi-dashboard-shared/openspec-poller.js";
import { DEFAULT_OPENSPEC_POLL, type OpenSpecPollConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { createSemaphore, type Semaphore } from "@blackbelt-technology/pi-dashboard-shared/semaphore.js";
import { discoverSessionsForCwd } from "./session-discovery.js";
import { replayEntriesAsEvents } from "@blackbelt-technology/pi-dashboard-shared/state-replay.js";
import { scanPiResources } from "./pi-resource-scanner.js";
import type { OpenSpecData, OpenSpecChange } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { PiResourcesResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import type { PreferencesStore } from "./preferences-store.js";
import type { SessionManager } from "./memory-session-manager.js";

import type { DiscoveredSession } from "./session-discovery.js";
export type { DiscoveredSession } from "./session-discovery.js";

export interface LoadResult {
  success: boolean;
  events: Array<{ eventType: string; timestamp: number; data: Record<string, unknown> }>;
  error?: string;
}

export interface DirectoryAddedResult {
  sessions: DiscoveredSession[];
  openspecData: OpenSpecData;
}

export interface DirectoryService {
  knownDirectories(): string[];
  discoverSessions(cwd: string): DiscoveredSession[];
  loadSessionEvents(sessionId: string, sessionFile: string): Promise<LoadResult>;
  getOpenSpecData(cwd: string): OpenSpecData | undefined;
  /** Force refresh: bypasses the mtime gate. Still honors the semaphore. */
  refreshOpenSpec(cwd: string): Promise<OpenSpecData>;
  /** Gated poll: respects `changeDetection` config and the semaphore. Returns cached data. */
  pollDirectoryGated(cwd: string): Promise<OpenSpecData>;
  getPiResources(cwd: string): PiResourcesResult | undefined;
  refreshPiResources(cwd: string): Promise<PiResourcesResult>;
  startPolling(onChange: (cwd: string, data: OpenSpecData) => void): void;
  stopPolling(): void;
  /** Apply a new OpenSpecPollConfig without losing cache. Safe to call mid-stream. */
  reconfigurePolling(config: OpenSpecPollConfig): void;
  onDirectoryAdded(cwd: string): Promise<DirectoryAddedResult>;
}

// ── Jitter ─────────────────────────────────────────────────────────
// 32-bit FNV-1a hash — cheap, stable, well-distributed for short strings.
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function phaseOffsetMs(cwd: string, jitterSeconds: number): number {
  if (!Number.isFinite(jitterSeconds) || jitterSeconds <= 0) return 0;
  return fnv1a32(cwd) % (jitterSeconds * 1000);
}

// ── mtime helpers ──────────────────────────────────────────────────
function statMtimeOr(p: string): number | undefined {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return undefined;
  }
}

// ── Per-directory cache ────────────────────────────────────────────
type PerChangeEntry = {
  mtimeMs: number | undefined;
  change: OpenSpecChange;
};

type DirCache = {
  /** mtime of `<cwd>/openspec/changes/` when we last ran `openspec list`. */
  listMtimeMs: number | undefined;
  /** Cached list-result entries (raw shape from openspec list). */
  listResult: Array<{ name: string; status: string; completedTasks: number; totalTasks: number }> | undefined;
  changes: Map<string, PerChangeEntry>;
  /** Last built OpenSpecData (what we broadcast). */
  data: OpenSpecData | undefined;
};

function emptyDirCache(): DirCache {
  return { listMtimeMs: undefined, listResult: undefined, changes: new Map(), data: undefined };
}

export function createDirectoryService(
  preferencesStore: PreferencesStore,
  sessionManager: SessionManager,
  initialConfig?: Partial<OpenSpecPollConfig>,
): DirectoryService {
  let cfg: OpenSpecPollConfig = { ...DEFAULT_OPENSPEC_POLL, ...(initialConfig ?? {}) };

  const caches = new Map<string, DirCache>();
  const piResourcesCache = new Map<string, PiResourcesResult>();

  let semaphore: Semaphore = createSemaphore(cfg.maxConcurrentSpawns);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let piResourcesTimer: ReturnType<typeof setInterval> | null = null;
  let onChangeCallback: ((cwd: string, data: OpenSpecData) => void) | null = null;
  const scheduledPhaseTimers = new Set<ReturnType<typeof setTimeout>>();

  // In-progress session loads for dedup
  const loadingSet = new Set<string>();

  function computeKnownDirectories(): string[] {
    const dirs = new Set<string>();
    for (const dir of preferencesStore.getPinnedDirectories()) dirs.add(dir);
    for (const session of sessionManager.listAll()) dirs.add(session.cwd);
    return Array.from(dirs);
  }

  function discoverSessions(cwd: string): DiscoveredSession[] {
    return discoverSessionsForCwd(cwd);
  }

  async function loadSessionEvents(sessionId: string, sessionFile: string): Promise<LoadResult> {
    if (loadingSet.has(sessionId)) {
      return { success: false, events: [], error: "already_loading" };
    }
    loadingSet.add(sessionId);
    try {
      const { loadSessionEntries } = await import("./session-file-reader.js");
      const entries = loadSessionEntries(sessionFile);
      const eventMessages = replayEntriesAsEvents(sessionId, entries);
      const events = eventMessages.map((m) => m.event);
      return { success: true, events };
    } catch (err: any) {
      const error = err?.code === "ENOENT" ? "file_not_found" : (err?.message ?? "parse_error");
      return { success: false, events: [], error };
    } finally {
      loadingSet.delete(sessionId);
    }
  }

  // ── Core gated poll ──────────────────────────────────────────────
  // Contract:
  //   - `force=true` bypasses both the list-mtime and per-change-mtime gates.
  //   - Every CLI spawn goes through the shared semaphore.
  //   - Cache is updated atomically per directory: on any failure the
  //     old cache stays intact.
  async function pollOne(cwd: string, force: boolean): Promise<OpenSpecData> {
    const cache = caches.get(cwd) ?? emptyDirCache();
    const gateEnabled = cfg.changeDetection === "mtime" && !force;

    const changesRoot = path.join(cwd, "openspec", "changes");
    const rootMtime = statMtimeOr(changesRoot);

    // If the directory doesn't exist, short-circuit (matches old behavior).
    if (rootMtime === undefined) {
      const empty: OpenSpecData = { initialized: false, changes: [] };
      cache.data = empty;
      cache.listMtimeMs = undefined;
      cache.listResult = undefined;
      cache.changes.clear();
      caches.set(cwd, cache);
      return empty;
    }

    // ── Step 1: list (gated) ──
    let listResult: typeof cache.listResult = cache.listResult;
    const listCacheValid = gateEnabled && cache.listMtimeMs === rootMtime && cache.listResult !== undefined;
    if (!listCacheValid) {
      const raw = await semaphore.run(() => runOpenSpecList(cwd));
      if (!raw || !Array.isArray(raw.changes)) {
        const empty: OpenSpecData = { initialized: false, changes: [] };
        cache.data = empty;
        cache.listMtimeMs = rootMtime;
        cache.listResult = undefined;
        cache.changes.clear();
        caches.set(cwd, cache);
        return empty;
      }
      listResult = raw.changes;
      cache.listMtimeMs = rootMtime;
      cache.listResult = listResult;
    }

    // Prune cache for changes no longer present.
    const liveNames = new Set((listResult ?? []).map((c) => c.name));
    for (const key of Array.from(cache.changes.keys())) {
      if (!liveNames.has(key)) cache.changes.delete(key);
    }

    // ── Step 2: per-change status (gated) ──
    const statusResults = new Map<string, { artifacts?: Array<{ id: string; status: string }>; isComplete?: boolean } | null>();

    await Promise.all((listResult ?? []).map(async (c) => {
      const changeDir = path.join(changesRoot, c.name);
      const changeMtime = statMtimeOr(changeDir);
      const cached = cache.changes.get(c.name);

      if (gateEnabled && cached && cached.mtimeMs !== undefined && cached.mtimeMs === changeMtime) {
        // Cache hit. Reuse the artifacts/isComplete from the cached OpenSpecChange.
        statusResults.set(c.name, {
          artifacts: cached.change.artifacts.map((a) => ({ id: a.id, status: a.status })),
          ...(cached.change.isComplete !== undefined ? { isComplete: cached.change.isComplete } : {}),
        });
        return;
      }

      const status = await semaphore.run(() => runOpenSpecStatus(cwd, c.name));
      statusResults.set(c.name, status);
    }));

    // ── Step 3: build + cache + return ──
    const data = buildOpenSpecData({ changes: listResult ?? [] }, statusResults);

    // Update per-change cache with the mtimes we just observed.
    for (const change of data.changes) {
      const changeDir = path.join(changesRoot, change.name);
      const changeMtime = statMtimeOr(changeDir);
      cache.changes.set(change.name, { mtimeMs: changeMtime, change });
    }
    cache.data = data;
    caches.set(cwd, cache);
    return data;
  }

  async function refreshOpenSpec(cwd: string): Promise<OpenSpecData> {
    try {
      return await pollOne(cwd, true);
    } catch {
      // Fall back to the legacy monolithic path so "refresh" never silently fails.
      const data = await pollOpenSpecAsync(cwd);
      const cache = caches.get(cwd) ?? emptyDirCache();
      cache.data = data;
      caches.set(cwd, cache);
      return data;
    }
  }

  async function pollDirectoryGated(cwd: string): Promise<OpenSpecData> {
    return pollOne(cwd, false);
  }

  async function refreshPiResourcesInternal(cwd: string): Promise<PiResourcesResult> {
    const data = await scanPiResources(cwd);
    piResourcesCache.set(cwd, data);
    return data;
  }

  // ── Scheduler ────────────────────────────────────────────────────
  const TICK_SLOW_WARN_MS = 5000;
  const DEBUG_ENABLED =
    typeof process !== "undefined" && typeof process.env?.DEBUG === "string" && /pi-dashboard|openspec-poll/.test(process.env.DEBUG);

  let openspecTickInFlight = false;
  async function scheduleOpenSpecTick() {
    if (openspecTickInFlight) return;
    openspecTickInFlight = true;
    const tickStart = Date.now();
    let spawnsBefore = 0;
    let spawnsAfter = 0;
    try {
      const dirs = computeKnownDirectories();
      // Track spawn count by hooking the semaphore's size(). Approximation.
      spawnsBefore = semaphore.size();
      await Promise.all(dirs.map((cwd) => new Promise<void>((resolve) => {
        const delay = phaseOffsetMs(cwd, cfg.jitterSeconds);
        const timer = setTimeout(async () => {
          scheduledPhaseTimers.delete(timer);
          try {
            const prev = caches.get(cwd)?.data;
            const prevJson = prev ? JSON.stringify(prev) : undefined;
            const next = await pollDirectoryGated(cwd);
            const nextJson = JSON.stringify(next);
            if (nextJson !== prevJson) onChangeCallback?.(cwd, next);
          } catch (err) {
            // Swallow — the next tick will retry.
            console.error(`[openspec-poll] tick failed for ${cwd}:`, err);
          } finally {
            resolve();
          }
        }, delay);
        scheduledPhaseTimers.add(timer);
      })));
      spawnsAfter = semaphore.size();
    } finally {
      openspecTickInFlight = false;
      const durationMs = Date.now() - tickStart;
      if (DEBUG_ENABLED) {
        const dirs = computeKnownDirectories().length;
        // eslint-disable-next-line no-console
        console.log(`[openspec-poll] tick dirs=${dirs} queueBefore=${spawnsBefore} queueAfter=${spawnsAfter} durationMs=${durationMs}`);
      }
      if (durationMs > TICK_SLOW_WARN_MS) {
        console.warn(`[openspec-poll] slow tick: ${durationMs}ms (threshold ${TICK_SLOW_WARN_MS}ms). Consider raising pollIntervalSeconds or lowering maxConcurrentSpawns.`);
      }
    }
  }

  let piResourcesInFlight = false;
  async function schedulePiResourcesTick() {
    if (piResourcesInFlight) return;
    piResourcesInFlight = true;
    try {
      await Promise.all(computeKnownDirectories().map(async (cwd) => {
        try { await refreshPiResourcesInternal(cwd); }
        catch { /* ignore, next tick retries */ }
      }));
    } finally {
      piResourcesInFlight = false;
    }
  }

  function installTimers() {
    if (pollTimer) clearInterval(pollTimer);
    if (piResourcesTimer) clearInterval(piResourcesTimer);
    pollTimer = setInterval(scheduleOpenSpecTick, cfg.pollIntervalSeconds * 1000);
    // Pi resources change far less often; poll at 5× the openspec interval.
    piResourcesTimer = setInterval(schedulePiResourcesTick, cfg.pollIntervalSeconds * 5 * 1000);
  }

  function stopTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (piResourcesTimer) { clearInterval(piResourcesTimer); piResourcesTimer = null; }
    for (const t of scheduledPhaseTimers) clearTimeout(t);
    scheduledPhaseTimers.clear();
  }

  return {
    knownDirectories: computeKnownDirectories,
    discoverSessions,
    loadSessionEvents,

    getOpenSpecData(cwd: string): OpenSpecData | undefined {
      return caches.get(cwd)?.data;
    },

    refreshOpenSpec,
    pollDirectoryGated,

    getPiResources(cwd: string): PiResourcesResult | undefined {
      return piResourcesCache.get(cwd);
    },

    async refreshPiResources(cwd: string): Promise<PiResourcesResult> {
      return refreshPiResourcesInternal(cwd);
    },

    startPolling(onChange: (cwd: string, data: OpenSpecData) => void) {
      onChangeCallback = onChange;
      installTimers();
    },

    stopPolling() {
      stopTimers();
      onChangeCallback = null;
    },

    reconfigurePolling(newCfg: OpenSpecPollConfig) {
      const oldInterval = cfg.pollIntervalSeconds;
      cfg = { ...newCfg };
      semaphore.setMax(cfg.maxConcurrentSpawns);
      // Only re-install timers if they were running and the interval actually changed.
      if (pollTimer && oldInterval !== cfg.pollIntervalSeconds) {
        installTimers();
      }
    },

    async onDirectoryAdded(cwd: string): Promise<DirectoryAddedResult> {
      const [sessions, openspecData] = await Promise.all([
        discoverSessions(cwd),
        refreshOpenSpec(cwd),
      ]);
      return { sessions, openspecData };
    },
  };
}
