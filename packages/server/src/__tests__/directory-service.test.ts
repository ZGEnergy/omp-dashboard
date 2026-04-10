/**
 * Tests for DirectoryService - server-side directory-scoped operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDirectoryService, type DirectoryService } from "../directory-service.js";
import type { PreferencesStore } from "../preferences-store.js";
import type { SessionManager } from "../memory-session-manager.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

// Mock the shared openspec poller
vi.mock("@blackbelt-technology/pi-dashboard-shared/openspec-poller.js", () => ({
  pollOpenSpecAsync: vi.fn(async () => ({ initialized: false, changes: [] })),
}));

// Mock the shared state replay
vi.mock("@blackbelt-technology/pi-dashboard-shared/state-replay.js", () => ({
  replayEntriesAsEvents: vi.fn(() => []),
}));

// Mock session-discovery
vi.mock("../session-discovery.js", () => ({
  discoverSessionsForCwd: vi.fn(() => []),
}));

// Mock session-file-reader
vi.mock("../session-file-reader.js", () => ({
  loadSessionEntries: vi.fn(() => []),
}));

// Mock the pi-coding-agent SessionManager (legacy, kept for compatibility)
vi.mock("@mariozechner/pi-coding-agent", () => ({
  SessionManager: {
    list: vi.fn(async () => []),
    open: vi.fn(() => ({
      getBranch: vi.fn(() => []),
    })),
  },
}));

function createMockPreferencesStore(pinnedDirs: string[] = []): PreferencesStore {
  return {
    getPinnedDirectories: () => pinnedDirs,
    getSessionOrder: () => ({}),
    setSessionOrder: vi.fn(),
    setPinnedDirectories: vi.fn(),
    pinDirectory: vi.fn(),
    unpinDirectory: vi.fn(),
    reorderPinnedDirs: vi.fn(),
    flush: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMockSessionManager(sessions: DashboardSession[] = []): SessionManager {
  const map = new Map<string, DashboardSession>();
  for (const s of sessions) map.set(s.id, s);
  return {
    register: vi.fn((params) => {
      const session = { ...params, status: "active", startedAt: Date.now() } as DashboardSession;
      map.set(params.id, session);
      return session;
    }),
    restore: vi.fn(),
    unregister: vi.fn((id) => {
      const s = map.get(id);
      if (s) { s.status = "ended"; s.endedAt = Date.now(); }
    }),
    update: vi.fn(),
    get: (id) => map.get(id),
    listActive: () => Array.from(map.values()).filter((s) => s.status !== "ended"),
    listAll: () => Array.from(map.values()),
  };
}

describe("DirectoryService", () => {
  let service: DirectoryService;

  afterEach(() => {
    service?.stopPolling();
  });

  describe("knownDirectories", () => {
    it("returns union of pinned dirs and session cwds", () => {
      const stateStore = createMockPreferencesStore(["/pinned/a", "/pinned/b"]);
      const sessionManager = createMockSessionManager([
        { id: "s1", cwd: "/pinned/a", source: "tui", status: "active", startedAt: 1 } as DashboardSession,
        { id: "s2", cwd: "/project/c", source: "tui", status: "active", startedAt: 2 } as DashboardSession,
      ]);
      service = createDirectoryService(stateStore, sessionManager);

      const dirs = service.knownDirectories();
      expect(dirs).toContain("/pinned/a");
      expect(dirs).toContain("/pinned/b");
      expect(dirs).toContain("/project/c");
      expect(dirs.length).toBe(3);
    });

    it("deduplicates directories", () => {
      const stateStore = createMockPreferencesStore(["/same/dir"]);
      const sessionManager = createMockSessionManager([
        { id: "s1", cwd: "/same/dir", source: "tui", status: "active", startedAt: 1 } as DashboardSession,
      ]);
      service = createDirectoryService(stateStore, sessionManager);

      const dirs = service.knownDirectories();
      expect(dirs.filter((d) => d === "/same/dir").length).toBe(1);
    });
  });

  describe("discoverSessions", () => {
    it("calls discoverSessionsForCwd and returns metadata", async () => {
      const { discoverSessionsForCwd } = await import("../session-discovery.js");
      (discoverSessionsForCwd as any).mockReturnValueOnce([
        {
          id: "hist-1",
          cwd: "/project",
          name: "old session",
          startedAt: Date.now(),
          modifiedAt: Date.now(),
          firstMessage: "hello",
          sessionFile: "/project/.pi/sessions/hist-1.jsonl",
          sessionDir: "/project/.pi/sessions",
        },
      ]);

      const stateStore = createMockPreferencesStore();
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const sessions = service.discoverSessions("/project");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("hist-1");
      expect(sessions[0].cwd).toBe("/project");
      expect(sessions[0].sessionFile).toBe("/project/.pi/sessions/hist-1.jsonl");
    });

    it("returns empty array when no sessions found", async () => {
      const { discoverSessionsForCwd } = await import("../session-discovery.js");
      (discoverSessionsForCwd as any).mockReturnValueOnce([]);

      const stateStore = createMockPreferencesStore();
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const sessions = service.discoverSessions("/nonexistent");
      expect(sessions).toEqual([]);
    });
  });

  describe("loadSessionEvents", () => {
    it("loads and converts session entries", async () => {
      const { loadSessionEntries } = await import("../session-file-reader.js");
      const { replayEntriesAsEvents } = await import("@blackbelt-technology/pi-dashboard-shared/state-replay.js");
      
      const mockEntries = [{ type: "message", message: { role: "user", content: "hi" } }];
      (loadSessionEntries as any).mockReturnValueOnce(mockEntries);
      (replayEntriesAsEvents as any).mockReturnValueOnce([
        { type: "event_forward", sessionId: "s1", event: { eventType: "message_start", timestamp: 1, data: {} } },
      ]);

      const stateStore = createMockPreferencesStore();
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const result = await service.loadSessionEvents("s1", "/path/to/session.jsonl");
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(loadSessionEntries).toHaveBeenCalledWith("/path/to/session.jsonl");
    });

    it("returns error on missing file", async () => {
      const { loadSessionEntries } = await import("../session-file-reader.js");
      (loadSessionEntries as any).mockImplementationOnce(() => { throw Object.assign(new Error("not found"), { code: "ENOENT" }); });

      const stateStore = createMockPreferencesStore();
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const result = await service.loadSessionEvents("s1", "/missing.jsonl");
      expect(result.success).toBe(false);
      expect(result.error).toBe("file_not_found");
    });
  });

  describe("getOpenSpecData / refreshOpenSpec", () => {
    it("returns cached data after polling", async () => {
      const { pollOpenSpecAsync } = await import("@blackbelt-technology/pi-dashboard-shared/openspec-poller.js");
      (pollOpenSpecAsync as any).mockResolvedValue({ initialized: true, changes: [{ name: "change-1" }] });

      const stateStore = createMockPreferencesStore();
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const data = await service.refreshOpenSpec("/project");
      expect(data.initialized).toBe(true);
      expect(data.changes[0].name).toBe("change-1");

      // getOpenSpecData returns cached value
      const cached = service.getOpenSpecData("/project");
      expect(cached).toEqual(data);
    });
  });

  describe("onDirectoryAdded", () => {
    it("discovers sessions and polls openspec immediately", async () => {
      const { discoverSessionsForCwd } = await import("../session-discovery.js");
      const { pollOpenSpecAsync } = await import("@blackbelt-technology/pi-dashboard-shared/openspec-poller.js");
      
      (discoverSessionsForCwd as any).mockReturnValueOnce([]);
      (pollOpenSpecAsync as any).mockResolvedValue({ initialized: false, changes: [] });

      const stateStore = createMockPreferencesStore();
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const result = await service.onDirectoryAdded("/new/dir");
      expect(discoverSessionsForCwd).toHaveBeenCalledWith("/new/dir");
      expect(result.sessions).toEqual([]);
      expect(result.openspecData).toBeDefined();
    });
  });

  describe("polling", () => {
    it("startPolling and stopPolling control the timer", () => {
      vi.useFakeTimers();
      const stateStore = createMockPreferencesStore(["/project"]);
      const sessionManager = createMockSessionManager();
      service = createDirectoryService(stateStore, sessionManager);

      const onChange = vi.fn();
      service.startPolling(onChange);
      
      // Should not have fired yet
      expect(onChange).not.toHaveBeenCalled();

      service.stopPolling();
      vi.useRealTimers();
    });
  });
});
