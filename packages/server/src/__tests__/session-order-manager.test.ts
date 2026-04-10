import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionOrderManager } from "../session-order-manager.js";
import type { PreferencesStore } from "../preferences-store.js";

function createMockPreferencesStore(initialOrder: Record<string, string[]> = {}): PreferencesStore {
  let order = { ...initialOrder };
  return {
    getSessionOrder: vi.fn(() => order),
    setSessionOrder: vi.fn((o: Record<string, string[]>) => { order = o; }),
    getPinnedDirectories: vi.fn(() => []),
    setPinnedDirectories: vi.fn(),
    pinDirectory: vi.fn(),
    unpinDirectory: vi.fn(),
    reorderPinnedDirs: vi.fn(),
    flush: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("SessionOrderManager", () => {
  let stateStore: PreferencesStore;

  beforeEach(() => {
    stateStore = createMockPreferencesStore();
  });

  describe("insert", () => {
    it("prepends session to empty order", () => {
      const mgr = createSessionOrderManager(stateStore);
      mgr.insert("/project", "s1");
      expect(mgr.getOrder("/project")).toEqual(["s1"]);
    });

    it("prepends session to existing order", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.insert("/project", "s3");
      expect(mgr.getOrder("/project")).toEqual(["s3", "s1", "s2"]);
    });

    it("inserts after parent when afterSessionId provided", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s3"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.insert("/project", "s2", "s1");
      expect(mgr.getOrder("/project")).toEqual(["s1", "s2", "s3"]);
    });

    it("prepends when afterSessionId not found in order", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.insert("/project", "s3", "nonexistent");
      expect(mgr.getOrder("/project")).toEqual(["s3", "s1", "s2"]);
    });

    it("does not duplicate if session already in order", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.insert("/project", "s1");
      expect(mgr.getOrder("/project")).toEqual(["s1", "s2"]);
    });

    it("persists after insert", () => {
      const mgr = createSessionOrderManager(stateStore);
      mgr.insert("/project", "s1");
      expect(stateStore.setSessionOrder).toHaveBeenCalled();
    });
  });

  describe("reorder", () => {
    it("replaces order for a cwd", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2", "s3"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.reorder("/project", ["s3", "s1", "s2"]);
      expect(mgr.getOrder("/project")).toEqual(["s3", "s1", "s2"]);
    });

    it("persists after reorder", () => {
      const mgr = createSessionOrderManager(stateStore);
      mgr.reorder("/project", ["s1", "s2"]);
      expect(stateStore.setSessionOrder).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes session from order", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2", "s3"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.remove("/project", "s2");
      expect(mgr.getOrder("/project")).toEqual(["s1", "s3"]);
    });

    it("no-op when session not in order", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.remove("/project", "s99");
      expect(mgr.getOrder("/project")).toEqual(["s1", "s2"]);
    });

    it("removes empty cwd entry", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1"] });
      const mgr = createSessionOrderManager(stateStore);
      mgr.remove("/project", "s1");
      expect(mgr.getOrder("/project")).toEqual([]);
    });
  });

  describe("getOrder with validIds filtering", () => {
    it("filters out stale IDs", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2", "s3"] });
      const mgr = createSessionOrderManager(stateStore);
      const validIds = new Set(["s1", "s3"]);
      expect(mgr.getOrder("/project", validIds)).toEqual(["s1", "s3"]);
    });

    it("returns empty for unknown cwd", () => {
      const mgr = createSessionOrderManager(stateStore);
      expect(mgr.getOrder("/unknown")).toEqual([]);
    });

    it("returns all if no validIds filter", () => {
      stateStore = createMockPreferencesStore({ "/project": ["s1", "s2"] });
      const mgr = createSessionOrderManager(stateStore);
      expect(mgr.getOrder("/project")).toEqual(["s1", "s2"]);
    });
  });

  describe("getAllOrders", () => {
    it("returns all cwd orders", () => {
      stateStore = createMockPreferencesStore({ "/a": ["s1"], "/b": ["s2", "s3"] });
      const mgr = createSessionOrderManager(stateStore);
      const orders = mgr.getAllOrders();
      expect(orders).toEqual({ "/a": ["s1"], "/b": ["s2", "s3"] });
    });
  });
});
