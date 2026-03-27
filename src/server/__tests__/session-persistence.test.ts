import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createSessionPersistence } from "../session-persistence.js";
import type { DashboardSession } from "../../shared/types.js";

function makeSession(overrides: Partial<DashboardSession> = {}): DashboardSession {
  return {
    id: "s1",
    cwd: "/tmp/project",
    source: "tui",
    status: "ended",
    startedAt: 1000,
    tokensIn: 100,
    tokensOut: 50,
    cost: 0.01,
    hidden: false,
    ...overrides,
  };
}

describe("session-persistence", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-persist-test-"));
    filePath = path.join(tmpDir, "sessions.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads empty array when file does not exist", () => {
    const persistence = createSessionPersistence(filePath);
    expect(persistence.load()).toEqual([]);
    persistence.dispose();
  });

  it("loads empty array when file is empty", () => {
    fs.writeFileSync(filePath, "");
    const persistence = createSessionPersistence(filePath);
    expect(persistence.load()).toEqual([]);
    persistence.dispose();
  });

  it("loads empty array when file has invalid JSON", () => {
    fs.writeFileSync(filePath, "not json{{{");
    const persistence = createSessionPersistence(filePath);
    expect(persistence.load()).toEqual([]);
    persistence.dispose();
  });

  it("loads sessions from existing file", () => {
    const sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
    fs.writeFileSync(filePath, JSON.stringify(sessions));
    const persistence = createSessionPersistence(filePath);
    const loaded = persistence.load();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("s1");
    expect(loaded[1].id).toBe("s2");
    persistence.dispose();
  });

  it("saves non-hidden sessions", () => {
    const persistence = createSessionPersistence(filePath);
    const sessions = [
      makeSession({ id: "s1", hidden: false }),
      makeSession({ id: "s2", hidden: false }),
    ];
    persistence.save(sessions);
    persistence.flush();

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("s1");
    expect(data[1].id).toBe("s2");
    persistence.dispose();
  });

  it("excludes hidden sessions from save", () => {
    const persistence = createSessionPersistence(filePath);
    const sessions = [
      makeSession({ id: "s1", hidden: false }),
      makeSession({ id: "s2", hidden: true }),
      makeSession({ id: "s3", hidden: false }),
    ];
    persistence.save(sessions);
    persistence.flush();

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data).toHaveLength(2);
    expect(data.map((s: any) => s.id)).toEqual(["s1", "s3"]);
    persistence.dispose();
  });

  it("debounces writes", () => {
    vi.useFakeTimers();
    const persistence = createSessionPersistence(filePath);
    persistence.save([makeSession({ id: "s1" })]);
    persistence.save([makeSession({ id: "s2" })]);

    // Not written yet
    expect(fs.existsSync(filePath)).toBe(false);

    // Advance past debounce
    vi.advanceTimersByTime(1100);

    // Now written — should have the last save (s2)
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("s2");

    persistence.dispose();
    vi.useRealTimers();
  });

  it("flush writes immediately", () => {
    const persistence = createSessionPersistence(filePath);
    persistence.save([makeSession({ id: "s1" })]);
    persistence.flush();

    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("s1");
    persistence.dispose();
  });

  it("survives simulated restart: save → new instance → load", () => {
    const persistence1 = createSessionPersistence(filePath);
    const sessions = [
      makeSession({ id: "s1", status: "ended", cwd: "/project-a" }),
      makeSession({ id: "s2", status: "active", cwd: "/project-b" }),
    ];
    persistence1.save(sessions);
    persistence1.flush();
    persistence1.dispose();

    // Simulate restart: new instance loads from same file
    const persistence2 = createSessionPersistence(filePath);
    const loaded = persistence2.load();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("s1");
    expect(loaded[0].cwd).toBe("/project-a");
    expect(loaded[1].id).toBe("s2");
    expect(loaded[1].cwd).toBe("/project-b");
    persistence2.dispose();
  });

  it("hidden sessions excluded across restart", () => {
    const persistence1 = createSessionPersistence(filePath);
    persistence1.save([
      makeSession({ id: "s1", hidden: false }),
      makeSession({ id: "s2", hidden: true }),
    ]);
    persistence1.flush();
    persistence1.dispose();

    const persistence2 = createSessionPersistence(filePath);
    const loaded = persistence2.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("s1");
    persistence2.dispose();
  });

  it("strips transient fields (currentTool, dataUnavailable) from persisted data", () => {
    const persistence = createSessionPersistence(filePath);
    const session = makeSession({ id: "s1", currentTool: "bash", dataUnavailable: true });
    persistence.save([session]);
    persistence.flush();

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data[0].currentTool).toBeUndefined();
    expect(data[0].dataUnavailable).toBeUndefined();
    persistence.dispose();
  });

  // openspecData removed from DashboardSession — now per-directory, not per-session
});
