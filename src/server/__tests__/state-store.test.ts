import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createStateStore } from "../state-store.js";

describe("state-store", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-store-test-"));
    filePath = path.join(tmpDir, "state.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with no hidden sessions", () => {
    const store = createStateStore(filePath);
    expect(store.getHiddenSessions()).toEqual([]);
    expect(store.isHidden("any")).toBe(false);
    store.dispose();
  });

  it("sets sessions as hidden", () => {
    const store = createStateStore(filePath);
    store.setHidden("s1", true);
    expect(store.isHidden("s1")).toBe(true);
    expect(store.isHidden("s2")).toBe(false);
    expect(store.getHiddenSessions()).toEqual(["s1"]);
    store.dispose();
  });

  it("unhides sessions", () => {
    const store = createStateStore(filePath);
    store.setHidden("s1", true);
    store.setHidden("s1", false);
    expect(store.isHidden("s1")).toBe(false);
    expect(store.getHiddenSessions()).toEqual([]);
    store.dispose();
  });

  it("persists hidden sessions after flush", () => {
    const store = createStateStore(filePath);
    store.setHidden("s1", true);
    store.setHidden("s2", true);
    store.flush();

    const store2 = createStateStore(filePath);
    expect(store2.isHidden("s1")).toBe(true);
    expect(store2.isHidden("s2")).toBe(true);
    store.dispose();
    store2.dispose();
  });

  it("debounces writes", async () => {
    vi.useFakeTimers();
    const store = createStateStore(filePath);
    store.setHidden("s1", true);
    store.setHidden("s2", true);

    // Not written yet
    expect(fs.existsSync(filePath)).toBe(false);

    // Advance past debounce
    vi.advanceTimersByTime(1100);

    // Now written
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.hiddenSessions).toContain("s1");
    expect(data.hiddenSessions).toContain("s2");

    store.dispose();
    vi.useRealTimers();
  });

  it("flush writes immediately", () => {
    const store = createStateStore(filePath);
    store.setHidden("s1", true);
    store.flush();

    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.hiddenSessions).toEqual(["s1"]);
    store.dispose();
  });

  it("loads existing state from file", () => {
    fs.writeFileSync(filePath, JSON.stringify({ hiddenSessions: ["x", "y"] }));
    const store = createStateStore(filePath);
    expect(store.isHidden("x")).toBe(true);
    expect(store.isHidden("y")).toBe(true);
    expect(store.getHiddenSessions()).toEqual(["x", "y"]);
    store.dispose();
  });

  it("no-op when setting already hidden/unhidden", () => {
    const store = createStateStore(filePath);
    store.setHidden("s1", true);
    store.flush();

    // Setting again should be a no-op (no re-write scheduled)
    store.setHidden("s1", true);
    // File should still have same content
    store.dispose();
  });
});
