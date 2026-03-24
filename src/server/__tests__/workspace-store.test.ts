import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createWorkspaceStore } from "../workspace-store.js";

describe("workspace-store", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-store-test-"));
    filePath = path.join(tmpDir, "workspaces.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    const store = createWorkspaceStore(filePath);
    expect(store.list()).toEqual([]);
  });

  it("creates a workspace", () => {
    const store = createWorkspaceStore(filePath);
    const ws = store.create({ path: tmpDir, name: "Test" });
    expect(ws.name).toBe("Test");
    expect(ws.path).toBe(tmpDir);
    expect(ws.id).toBeTruthy();
  });

  it("persists to JSON file", () => {
    const store = createWorkspaceStore(filePath);
    store.create({ path: tmpDir, name: "Persisted" });

    // Create new store from same file
    const store2 = createWorkspaceStore(filePath);
    const list = store2.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Persisted");
  });

  it("gets workspace by id", () => {
    const store = createWorkspaceStore(filePath);
    const ws = store.create({ path: tmpDir });
    expect(store.get(ws.id)).toEqual(ws);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("updates workspace", () => {
    const store = createWorkspaceStore(filePath);
    const ws = store.create({ path: tmpDir, name: "Old" });
    const updated = store.update(ws.id, { name: "New", sortOrder: 5 });
    expect(updated.name).toBe("New");
    expect(updated.sortOrder).toBe(5);
  });

  it("throws on update of nonexistent workspace", () => {
    const store = createWorkspaceStore(filePath);
    expect(() => store.update("bad-id", { name: "X" })).toThrow("not found");
  });

  it("deletes workspace", () => {
    const store = createWorkspaceStore(filePath);
    const ws = store.create({ path: tmpDir });
    store.delete(ws.id);
    expect(store.list()).toHaveLength(0);
  });

  it("rejects duplicate path", () => {
    const store = createWorkspaceStore(filePath);
    store.create({ path: tmpDir });
    expect(() => store.create({ path: tmpDir })).toThrow("already exists");
  });

  it("rejects nonexistent path", () => {
    const store = createWorkspaceStore(filePath);
    expect(() => store.create({ path: "/nonexistent/path/xyz" })).toThrow("does not exist");
  });

  it("lists sorted by sortOrder then name", () => {
    const store = createWorkspaceStore(filePath);
    // Create sub-dirs for valid paths
    const d1 = path.join(tmpDir, "b-proj");
    const d2 = path.join(tmpDir, "a-proj");
    fs.mkdirSync(d1);
    fs.mkdirSync(d2);

    store.create({ path: d1, name: "B" });
    store.create({ path: d2, name: "A" });
    const names = store.list().map((w) => w.name);
    expect(names).toEqual(["A", "B"]);
  });

  it("discovers workspaces with .git or .pi dirs", () => {
    const store = createWorkspaceStore(filePath);
    const projDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projDir, ".git"), { recursive: true });
    const noProjDir = path.join(tmpDir, "plain-dir");
    fs.mkdirSync(noProjDir);

    const discovered = store.discover([tmpDir]);
    expect(discovered).toHaveLength(1);
    expect(discovered[0].name).toBe("my-project");
  });

  it("discover skips already-added workspaces", () => {
    const store = createWorkspaceStore(filePath);
    const projDir = path.join(tmpDir, "project");
    fs.mkdirSync(path.join(projDir, ".git"), { recursive: true });
    store.create({ path: projDir });

    const discovered = store.discover([tmpDir]);
    expect(discovered).toHaveLength(0);
  });
});
