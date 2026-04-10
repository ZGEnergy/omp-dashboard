import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHeadlessPidRegistry } from "../headless-pid-registry.js";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ChildProcess } from "node:child_process";

function mockProcess(): ChildProcess {
  return new EventEmitter() as any;
}

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "pid-reg-test-"));
}

describe("HeadlessPidRegistry", () => {
  it("should register and track a process", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    expect(registry.size()).toBe(1);
  });

  it("should remove entry on process exit", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    expect(registry.size()).toBe(1);
    proc.emit("exit");
    expect(registry.size()).toBe(0);
  });

  it("should link session ID by cwd", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    const linked = registry.linkSession("session-1", "/projects/app");
    expect(linked).toBe(true);
    expect(registry.getPid("session-1")).toBe(100);
  });

  it("should return false when linking unknown cwd", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const linked = registry.linkSession("session-1", "/unknown");
    expect(linked).toBe(false);
  });

  it("should use FIFO matching for same cwd", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc1 = mockProcess();
    const proc2 = mockProcess();
    registry.register(100, "/projects/app", proc1);
    registry.register(200, "/projects/app", proc2);

    registry.linkSession("session-1", "/projects/app");
    expect(registry.getPid("session-1")).toBe(100);

    registry.linkSession("session-2", "/projects/app");
    expect(registry.getPid("session-2")).toBe(200);
  });

  it("should not link to already-linked entries", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    registry.linkSession("session-1", "/projects/app");

    const linked = registry.linkSession("session-2", "/projects/app");
    expect(linked).toBe(false);
  });

  it("should return undefined for unknown session ID", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    expect(registry.getPid("unknown")).toBeUndefined();
  });

  it("should kill process by session ID", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(process.pid, "/projects/app", proc);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    registry.linkSession("session-1", "/projects/app");
    const killed = registry.killBySessionId("session-1");
    expect(killed).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(-process.pid, "SIGTERM");
    expect(registry.size()).toBe(0);

    killSpy.mockRestore();
  });

  it("should return false when killing unknown session", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const killed = registry.killBySessionId("unknown");
    expect(killed).toBe(false);
  });

  it("should handle kill failure gracefully", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(999999, "/projects/app", proc);
    registry.linkSession("session-1", "/projects/app");

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });

    const killed = registry.killBySessionId("session-1");
    expect(killed).toBe(false);
    expect(registry.size()).toBe(0);

    killSpy.mockRestore();
  });

  it("should remove by PID", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    registry.remove(100);
    expect(registry.size()).toBe(0);
  });

  it("should kill all tracked processes", () => {
    const registry = createHeadlessPidRegistry({ pidFilePath: join(makeTempDir(), "pids.json") });
    const proc1 = mockProcess();
    const proc2 = mockProcess();
    registry.register(100, "/a", proc1);
    registry.register(200, "/b", proc2);

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    registry.killAll();
    expect(killSpy).toHaveBeenCalledTimes(2);
    expect(registry.size()).toBe(0);
    killSpy.mockRestore();
  });
});

describe("HeadlessPidRegistry persistence", () => {
  it("should persist entries to disk on register", () => {
    const dir = makeTempDir();
    const pidFile = join(dir, "pids.json");
    const registry = createHeadlessPidRegistry({ pidFilePath: pidFile });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);

    const data = JSON.parse(readFileSync(pidFile, "utf-8"));
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].pid).toBe(100);
    expect(data.entries[0].cwd).toBe("/projects/app");
    expect(data.entries[0].spawnedAt).toBeDefined();
  });

  it("should remove entry from disk on process exit", () => {
    const dir = makeTempDir();
    const pidFile = join(dir, "pids.json");
    const registry = createHeadlessPidRegistry({ pidFilePath: pidFile });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    proc.emit("exit");

    const data = JSON.parse(readFileSync(pidFile, "utf-8"));
    expect(data.entries).toHaveLength(0);
  });

  it("should remove entry from disk on remove()", () => {
    const dir = makeTempDir();
    const pidFile = join(dir, "pids.json");
    const registry = createHeadlessPidRegistry({ pidFilePath: pidFile });
    const proc = mockProcess();
    registry.register(100, "/projects/app", proc);
    registry.remove(100);

    const data = JSON.parse(readFileSync(pidFile, "utf-8"));
    expect(data.entries).toHaveLength(0);
  });
});

describe("HeadlessPidRegistry orphan cleanup", () => {
  it("should reclaim alive processes from disk", () => {
    const dir = makeTempDir();
    const pidFile = join(dir, "pids.json");

    // Pre-populate the PID file with current process PID (guaranteed alive)
    writeFileSync(pidFile, JSON.stringify({
      entries: [{ pid: process.pid, cwd: "/projects/app", spawnedAt: new Date().toISOString() }],
    }));

    const registry = createHeadlessPidRegistry({ pidFilePath: pidFile });
    registry.cleanupOrphans();

    expect(registry.size()).toBe(1);
    expect(registry.getPid("any")).toBeUndefined(); // not linked yet
  });

  it("should remove dead processes from disk", () => {
    const dir = makeTempDir();
    const pidFile = join(dir, "pids.json");

    // Use a PID that's almost certainly dead
    writeFileSync(pidFile, JSON.stringify({
      entries: [{ pid: 999999, cwd: "/projects/app", spawnedAt: new Date().toISOString() }],
    }));

    const registry = createHeadlessPidRegistry({ pidFilePath: pidFile });
    registry.cleanupOrphans();

    expect(registry.size()).toBe(0);
    const data = JSON.parse(readFileSync(pidFile, "utf-8"));
    expect(data.entries).toHaveLength(0);
  });

  it("should kill very old alive orphans (>7 days)", () => {
    const dir = makeTempDir();
    const pidFile = join(dir, "pids.json");

    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
    writeFileSync(pidFile, JSON.stringify({
      entries: [{ pid: process.pid, cwd: "/projects/app", spawnedAt: oldDate }],
    }));

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const registry = createHeadlessPidRegistry({ pidFilePath: pidFile });
    registry.cleanupOrphans();

    // Should have tried to kill the process group
    expect(killSpy).toHaveBeenCalledWith(-process.pid, "SIGTERM");
    // Should NOT be reclaimed
    expect(registry.size()).toBe(0);

    killSpy.mockRestore();
  });
});
