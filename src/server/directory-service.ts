/**
 * DirectoryService — server-side directory-scoped operations.
 * Handles session discovery, event loading, and OpenSpec polling
 * directly on the server without requiring bridge connections.
 */
import { pollOpenSpecAsync } from "../shared/openspec-poller.js";
import { replayEntriesAsEvents } from "../shared/state-replay.js";
import type { OpenSpecData } from "../shared/types.js";
import type { StateStore } from "./state-store.js";
import type { SessionManager } from "./memory-session-manager.js";

const POLL_INTERVAL = 30_000;

export interface DiscoveredSession {
  id: string;
  cwd: string;
  name?: string;
  startedAt: number;
  firstMessage?: string;
  sessionFile?: string;
  sessionDir?: string;
}

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
  discoverSessions(cwd: string): Promise<DiscoveredSession[]>;
  loadSessionEvents(sessionId: string, sessionFile: string): Promise<LoadResult>;
  getOpenSpecData(cwd: string): OpenSpecData | undefined;
  refreshOpenSpec(cwd: string): Promise<OpenSpecData>;
  startPolling(onChange: (cwd: string, data: OpenSpecData) => void): void;
  stopPolling(): void;
  onDirectoryAdded(cwd: string): Promise<DirectoryAddedResult>;
}

export function createDirectoryService(
  stateStore: StateStore,
  sessionManager: SessionManager,
): DirectoryService {
  const openspecCache = new Map<string, OpenSpecData>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let onChangeCallback: ((cwd: string, data: OpenSpecData) => void) | null = null;

  // In-progress session loads for dedup
  const loadingSet = new Set<string>();

  function computeKnownDirectories(): string[] {
    const dirs = new Set<string>();
    for (const dir of stateStore.getPinnedDirectories()) {
      dirs.add(dir);
    }
    for (const session of sessionManager.listAll()) {
      dirs.add(session.cwd);
    }
    return Array.from(dirs);
  }

  async function discoverSessions(cwd: string): Promise<DiscoveredSession[]> {
    try {
      const mod = await import("@mariozechner/pi-coding-agent") as any;
      const SM = mod.SessionManager;
      const sessions = await SM.list(cwd);
      return (sessions || []).map((s: any) => ({
        id: s.id,
        cwd: s.cwd,
        name: s.name,
        startedAt: s.created instanceof Date ? s.created.getTime() : Date.now(),
        firstMessage: s.firstMessage || undefined,
        sessionFile: s.path,
        sessionDir: s.cwd,
      }));
    } catch {
      return [];
    }
  }

  async function loadSessionEvents(sessionId: string, sessionFile: string): Promise<LoadResult> {
    // Dedup: wait if already loading
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

  async function refreshOpenSpec(cwd: string): Promise<OpenSpecData> {
    const data = await pollOpenSpecAsync(cwd);
    openspecCache.set(cwd, data);
    return data;
  }

  async function pollAllDirectories() {
    const dirs = computeKnownDirectories();
    // Poll all directories in parallel, non-blocking
    await Promise.all(dirs.map(async (cwd) => {
      const data = await pollOpenSpecAsync(cwd);
      const prev = openspecCache.get(cwd);
      const prevJson = prev ? JSON.stringify(prev) : undefined;
      const newJson = JSON.stringify(data);
      openspecCache.set(cwd, data);
      if (newJson !== prevJson) {
        onChangeCallback?.(cwd, data);
      }
    }));
  }

  return {
    knownDirectories: computeKnownDirectories,
    discoverSessions,
    loadSessionEvents,

    getOpenSpecData(cwd: string): OpenSpecData | undefined {
      return openspecCache.get(cwd);
    },

    refreshOpenSpec,

    startPolling(onChange: (cwd: string, data: OpenSpecData) => void) {
      onChangeCallback = onChange;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(pollAllDirectories, POLL_INTERVAL);
    },

    stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      onChangeCallback = null;
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
