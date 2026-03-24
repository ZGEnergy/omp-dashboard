import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createMemorySessionManager } from "../memory-session-manager.js";
import { createStateStore } from "../state-store.js";
import { createWorkspaceStore } from "../workspace-store.js";
import type { StateStore } from "../state-store.js";
import type { WorkspaceStore } from "../workspace-store.js";

describe("memory-session-manager", () => {
  let tmpDir: string;
  let stateStore: StateStore;
  let workspaceStore: WorkspaceStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mem-sm-test-"));
    stateStore = createStateStore(path.join(tmpDir, "state.json"));
    workspaceStore = createWorkspaceStore(path.join(tmpDir, "workspaces.json"));
  });

  afterEach(() => {
    stateStore.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers a session", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    const session = sm.register({
      id: "s1",
      cwd: "/tmp",
      source: "tui",
      name: "Test",
    });
    expect(session.id).toBe("s1");
    expect(session.status).toBe("active");
    expect(session.name).toBe("Test");
  });

  it("gets session by id", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    expect(sm.get("s1")).toBeDefined();
    expect(sm.get("nonexistent")).toBeUndefined();
  });

  it("unregisters session", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.unregister("s1");
    const s = sm.get("s1");
    expect(s?.status).toBe("ended");
    expect(s?.endedAt).toBeDefined();
  });

  it("updates session", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.update("s1", { tokensIn: 100, model: "test/model" });
    expect(sm.get("s1")?.tokensIn).toBe(100);
    expect(sm.get("s1")?.model).toBe("test/model");
  });

  it("persists hidden state via stateStore", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.update("s1", { hidden: true });
    expect(stateStore.isHidden("s1")).toBe(true);
  });

  it("clears hidden state on register (active sessions are always visible)", () => {
    stateStore.setHidden("s1", true);
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    const session = sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    expect(session.hidden).toBe(false);
    expect(stateStore.isHidden("s1")).toBe(false);
  });

  it("listActive excludes ended sessions", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.register({ id: "s2", cwd: "/tmp", source: "tui" });
    sm.unregister("s1");
    expect(sm.listActive()).toHaveLength(1);
    expect(sm.listActive()[0].id).toBe("s2");
  });

  it("listAll includes all sessions", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.register({ id: "s2", cwd: "/tmp", source: "tui" });
    sm.unregister("s1");
    expect(sm.listAll()).toHaveLength(2);
  });

  it("matches workspace by cwd prefix", () => {
    workspaceStore.create({ path: tmpDir, name: "MyProject" });
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    const subPath = path.join(tmpDir, "subdir");
    fs.mkdirSync(subPath, { recursive: true });
    const session = sm.register({ id: "s1", cwd: subPath, source: "tui" });
    expect(session.workspaceId).toBeDefined();
  });

  it("no workspace match returns undefined workspaceId", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    const session = sm.register({ id: "s1", cwd: "/some/random/path", source: "tui" });
    expect(session.workspaceId).toBeUndefined();
  });

  it("starts empty after creation (no SQLite hydration)", () => {
    const sm = createMemorySessionManager(stateStore, workspaceStore);
    expect(sm.listAll()).toHaveLength(0);
  });
});
