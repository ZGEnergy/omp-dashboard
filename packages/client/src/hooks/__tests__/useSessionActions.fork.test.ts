/**
 * Regression lock for issue #69: handleResumeSession(id, "fork", entryId) emits
 * a real resume_session { mode:"fork", entryId } wire message and registers a
 * pending-spawn entry so the resulting session_added auto-navigates. Proves the
 * fork dispatch is not an inert no-op.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionActions } from "../useSessionActions.js";

function setup() {
  const pendingSpawnsRef = {
    current: new Map<string, { cwd: string; kind: "spawn" | "resume"; placeholderCwd?: string }>(),
  };
  const send = vi.fn();
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
  };
  const { result } = renderHook(() => useSessionActions(deps));
  return { actions: result.current, send, pendingSpawnsRef };
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
});
