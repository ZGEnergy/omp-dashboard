/**
 * Regression lock for issue #69: handleResumeSession(id, "fork", entryId) emits
 * a real resume_session { mode:"fork", entryId } wire message and registers a
 * pending-spawn entry so the resulting session_added auto-navigates. Proves the
 * fork dispatch is not an inert no-op.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionActions } from "../useSessionActions.js";

function setup(withDedup = false) {
  const pendingSpawnsRef = {
    current: new Map<string, { cwd: string; kind: "spawn" | "resume"; placeholderCwd?: string }>(),
  };
  const send = vi.fn();
  // Stand-in for the real ForkPendingController: same contract (returns false
  // when a fork for `key` is already in flight), no React state.
  const pendingKeys = new Set<string>();
  const beginFork = vi.fn((key: string, _sessionId: string, _requestId: string) => {
    if (pendingKeys.has(key)) return false;
    pendingKeys.add(key);
    return true;
  });
  const deps: any = {
    selectedId: "s1",
    send,
    navigate: vi.fn(),
    setMobileOpen: vi.fn(),
    sessions: new Map(),
    setSessions: vi.fn(),
    setSessionStates: vi.fn(),
    setSpawningCwds: vi.fn(),
    setTerminals: vi.fn(),
    clearSpawningCwd: vi.fn(),
    spawnTimeoutsRef: { current: new Map() },
    pendingTerminalCwdRef: { current: null },
    terminals: new Map(),
    pendingSpawnsRef,
    ...(withDedup ? { beginFork } : {}),
  };
  const { result } = renderHook(() => useSessionActions(deps));
  return { actions: result.current, send, pendingSpawnsRef, beginFork };
}

describe("useSessionActions — handleResumeSession fork", () => {
  it("sends resume_session with mode:fork + entryId and registers a pending resume entry", () => {
    const { actions, send, pendingSpawnsRef } = setup();
    actions.handleResumeSession("s1", "fork", "entry-123");

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume_session",
        sessionId: "s1",
        mode: "fork",
        entryId: "entry-123",
        placement: "front",
      }),
    );
    const sent = send.mock.calls[0][0];
    expect(typeof sent.requestId).toBe("string");
    expect(sent.requestId.length).toBeGreaterThan(0);

    expect(pendingSpawnsRef.current.size).toBe(1);
    const entry = [...pendingSpawnsRef.current.values()][0];
    expect(entry.kind).toBe("resume");
    // The pending entry key is the same requestId echoed on the wire.
    expect(pendingSpawnsRef.current.has(sent.requestId)).toBe(true);
  });

  // Issue #107 (c): before this, each tap minted a fresh requestId and sent
  // another resume_session, spawning one pi per tap.
  describe("duplicate-activation guard", () => {
    it("sends once for two rapid forks of the same entryId", () => {
      const { actions, send, beginFork } = setup(true);
      actions.handleResumeSession("s1", "fork", "entry-123");
      actions.handleResumeSession("s1", "fork", "entry-123");

      expect(send).toHaveBeenCalledTimes(1);
      expect(beginFork).toHaveBeenCalledTimes(2);
      // The key is the entryId, and the requestId it registered is the one
      // that went out on the wire.
      expect(beginFork.mock.calls[0][0]).toBe("entry-123");
      expect(beginFork.mock.calls[0][2]).toBe(send.mock.calls[0][0].requestId);
    });

    it("still sends for a different entryId in the same session", () => {
      const { actions, send } = setup(true);
      actions.handleResumeSession("s1", "fork", "entry-123");
      actions.handleResumeSession("s1", "fork", "entry-456");

      expect(send).toHaveBeenCalledTimes(2);
    });

    it("keys a session-scoped fork (no entryId) on the sessionId", () => {
      const { actions, send, beginFork } = setup(true);
      actions.handleResumeSession("s1", "fork");
      actions.handleResumeSession("s1", "fork");

      expect(send).toHaveBeenCalledTimes(1);
      expect(beginFork.mock.calls[0][0]).toBe("s1");
    });

    it("does not dedup continue mode", () => {
      const { actions, send, beginFork } = setup(true);
      actions.handleResumeSession("s1", "continue");
      actions.handleResumeSession("s1", "continue");

      expect(send).toHaveBeenCalledTimes(2);
      expect(beginFork).not.toHaveBeenCalled();
    });
  });
});
