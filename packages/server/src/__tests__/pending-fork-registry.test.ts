import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPendingForkRegistry } from "../pending-fork-registry.js";

describe("PendingForkRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records and consumes a fork", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/project", "parent-1");
    const result = reg.consumeFork("/project");
    expect(result).toBe("parent-1");
  });

  it("returns undefined when no fork pending", () => {
    const reg = createPendingForkRegistry();
    expect(reg.consumeFork("/project")).toBeUndefined();
  });

  it("consume clears the entry", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/project", "parent-1");
    reg.consumeFork("/project");
    expect(reg.consumeFork("/project")).toBeUndefined();
  });

  it("expires after 30 seconds", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/project", "parent-1");
    vi.advanceTimersByTime(30_001);
    expect(reg.consumeFork("/project")).toBeUndefined();
  });

  it("does not expire before 30 seconds", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/project", "parent-1");
    vi.advanceTimersByTime(29_999);
    expect(reg.consumeFork("/project")).toBe("parent-1");
  });

  it("latest fork overwrites previous for same cwd", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/project", "parent-1");
    reg.recordFork("/project", "parent-2");
    expect(reg.consumeFork("/project")).toBe("parent-2");
  });

  it("different cwds are independent", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/a", "parent-a");
    reg.recordFork("/b", "parent-b");
    expect(reg.consumeFork("/a")).toBe("parent-a");
    expect(reg.consumeFork("/b")).toBe("parent-b");
  });

  it("dispose clears all timers", () => {
    const reg = createPendingForkRegistry();
    reg.recordFork("/a", "parent-a");
    reg.recordFork("/b", "parent-b");
    reg.dispose();
    expect(reg.consumeFork("/a")).toBeUndefined();
    expect(reg.consumeFork("/b")).toBeUndefined();
  });
});
