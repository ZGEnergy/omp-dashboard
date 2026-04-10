import { describe, it, expect } from "vitest";
import { createMemorySessionManager } from "../memory-session-manager.js";

describe("memory-session-manager", () => {
  it("registers a session", () => {
    const sm = createMemorySessionManager();
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
    const sm = createMemorySessionManager();
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    expect(sm.get("s1")).toBeDefined();
    expect(sm.get("nonexistent")).toBeUndefined();
  });

  it("unregisters session", () => {
    const sm = createMemorySessionManager();
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.unregister("s1");
    const s = sm.get("s1");
    expect(s?.status).toBe("ended");
    expect(s?.endedAt).toBeDefined();
  });

  it("updates session", () => {
    const sm = createMemorySessionManager();
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.update("s1", { tokensIn: 100, model: "test/model" });
    expect(sm.get("s1")?.tokensIn).toBe(100);
    expect(sm.get("s1")?.model).toBe("test/model");
  });

  it("updates hidden state on session object", () => {
    const sm = createMemorySessionManager();
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.update("s1", { hidden: true });
    expect(sm.get("s1")?.hidden).toBe(true);
  });

  it("listActive excludes ended sessions", () => {
    const sm = createMemorySessionManager();
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.register({ id: "s2", cwd: "/tmp", source: "tui" });
    sm.unregister("s1");
    expect(sm.listActive()).toHaveLength(1);
    expect(sm.listActive()[0].id).toBe("s2");
  });

  it("listAll includes all sessions", () => {
    const sm = createMemorySessionManager();
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.register({ id: "s2", cwd: "/tmp", source: "tui" });
    sm.unregister("s1");
    expect(sm.listAll()).toHaveLength(2);
  });

  it("starts empty after creation", () => {
    const sm = createMemorySessionManager();
    expect(sm.listAll()).toHaveLength(0);
  });

  it("onChange receives sessionId", () => {
    const sm = createMemorySessionManager();
    const ids: string[] = [];
    sm.onChange = (sessionId) => ids.push(sessionId);
    sm.register({ id: "s1", cwd: "/tmp", source: "tui" });
    sm.update("s1", { tokensIn: 50 });
    sm.unregister("s1");
    expect(ids).toEqual(["s1", "s1", "s1"]);
  });
});
