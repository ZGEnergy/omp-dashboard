import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createPreferencesStore } from "../preferences-store.js";

// Mock resolve-path to be a no-op (no symlink resolution in tests)
vi.mock("../resolve-path.js", () => ({
  safeRealpathSync: (p: string) => p,
}));

describe("preferences-store", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pref-store-test-"));
    filePath = path.join(tmpDir, "preferences.json");
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should start with empty defaults when file missing", () => {
    const store = createPreferencesStore(filePath);
    expect(store.getPinnedDirectories()).toEqual([]);
    expect(store.getSessionOrder()).toEqual({});
    store.dispose();
  });

  it("should load existing preferences", () => {
    fs.writeFileSync(filePath, JSON.stringify({
      pinnedDirectories: ["/a", "/b"],
      sessionOrder: { "/a": ["s1", "s2"] },
    }));
    const store = createPreferencesStore(filePath);
    expect(store.getPinnedDirectories()).toEqual(["/a", "/b"]);
    expect(store.getSessionOrder()).toEqual({ "/a": ["s1", "s2"] });
    store.dispose();
  });

  it("should pin and unpin directories", () => {
    const store = createPreferencesStore(filePath);
    store.pinDirectory("/a");
    store.pinDirectory("/b");
    expect(store.getPinnedDirectories()).toEqual(["/a", "/b"]);
    store.unpinDirectory("/a");
    expect(store.getPinnedDirectories()).toEqual(["/b"]);
    store.dispose();
  });

  it("should not duplicate pinned directories", () => {
    const store = createPreferencesStore(filePath);
    store.pinDirectory("/a");
    store.pinDirectory("/a");
    expect(store.getPinnedDirectories()).toEqual(["/a"]);
    store.dispose();
  });

  it("should reorder pinned directories", () => {
    const store = createPreferencesStore(filePath);
    store.pinDirectory("/a");
    store.pinDirectory("/b");
    store.reorderPinnedDirs(["/b", "/a"]);
    expect(store.getPinnedDirectories()).toEqual(["/b", "/a"]);
    store.dispose();
  });

  it("should set and get session order", () => {
    const store = createPreferencesStore(filePath);
    store.setSessionOrder({ "/x": ["s1", "s2"] });
    expect(store.getSessionOrder()).toEqual({ "/x": ["s1", "s2"] });
    store.dispose();
  });

  it("should debounce writes", () => {
    const store = createPreferencesStore(filePath);
    store.pinDirectory("/a");
    store.pinDirectory("/b");
    // Not written yet
    expect(fs.existsSync(filePath)).toBe(false);
    vi.advanceTimersByTime(1000);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.pinnedDirectories).toEqual(["/a", "/b"]);
    store.dispose();
  });

  it("should flush pending writes", () => {
    const store = createPreferencesStore(filePath);
    store.pinDirectory("/a");
    store.flush();
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.pinnedDirectories).toEqual(["/a"]);
    store.dispose();
  });

  it("should not contain hiddenSessions in output", () => {
    const store = createPreferencesStore(filePath);
    store.pinDirectory("/a");
    store.flush();
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.hiddenSessions).toBeUndefined();
    store.dispose();
  });
});
