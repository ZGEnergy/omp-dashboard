/**
 * Regression suite for issue #69: fork-from-here.
 *
 * Case A — a fork's `session_added` carrying the matching `spawnRequestId`
 * auto-navigates to the new fork session (creates AND opens the continuation).
 * Case B — a failed `resume_result` now raises a visible toast (not just the
 * easy-to-miss per-session banner), so a failed fork can never look inert.
 */

import type { ServerToBrowserMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMessageHandler } from "../useMessageHandler.js";

function makeSession(id: string, cwd: string): DashboardSession {
  return { id, cwd, source: "tui", status: "active", startedAt: 1 } as DashboardSession;
}

function setup(pending: Map<string, { cwd: string; kind: "spawn" | "resume"; placeholderCwd?: string }>) {
  const navigate = vi.fn();
  const settleFork = vi.fn();
  const showToast = vi.fn();
  const setResumeErrors = vi.fn();
  const setters: any = {
    setSessions: vi.fn(), setSessionStates: vi.fn(), setSessionCommands: vi.fn(),
    setFileResults: vi.fn(), setOpenspecMap: vi.fn(), setOpenspecGroupsMap: vi.fn(),
    setModelsMap: vi.fn(), setRolesMap: vi.fn(), setSpawnResult: vi.fn(),
    setSessionOrderMap: vi.fn(), setPinnedDirectories: vi.fn(), setFavoriteModels: vi.fn(),
    setWorkspaces: vi.fn(), setTerminals: vi.fn(), setEditorStatuses: vi.fn(),
    setDiscoveredServers: vi.fn(), setSpawnErrors: vi.fn(), setResumeErrors,
    setDisplayPrefs: vi.fn(), setViewMessagesMap: vi.fn(),
  };
  const deps: any = {
    send: vi.fn(),
    navigate,
    clearSpawningCwd: vi.fn(),
    spawningCwdsRef: { current: new Set<string>() },
    subscribedRef: { current: new Set<string>() },
    pendingTerminalCwdRef: { current: null },
    lastCreatedTerminalIdRef: { current: null },
    maxSeqMapRef: { current: new Map<string, number>() },
    selectedSessionIdRef: { current: undefined },
    pendingSpawnsRef: { current: pending },
    showToast,
    settleFork,
  };
  const { result } = renderHook(() => useMessageHandler(setters, deps));
  return {
    dispatch: (m: ServerToBrowserMessage) => result.current(m),
    navigate,
    showToast,
    setResumeErrors,
    settleFork,
    pending,
  };
}

describe("useMessageHandler — fork result", () => {
  it("Case A: auto-navigates to the new fork on session_added with matching spawnRequestId", () => {
    const pending = new Map([["rq1", { cwd: "", kind: "resume" as const }]]);
    const { dispatch, navigate, pending: p } = setup(pending);

    dispatch({
      type: "session_added",
      session: makeSession("fork-2", "/repo"),
      spawnRequestId: "rq1",
    } as ServerToBrowserMessage);

    expect(navigate).toHaveBeenCalledWith("/session/fork-2");
    expect(p.has("rq1")).toBe(false);
  });

  it("Case B: raises an error toast AND sets the banner on a failed resume_result", () => {
    const { dispatch, showToast, setResumeErrors } = setup(new Map());

    dispatch({
      type: "resume_result",
      success: false,
      sessionId: "s1",
      message: "Fork from entry failed: Entry ID not found",
    } as ServerToBrowserMessage);

    expect(showToast).toHaveBeenCalledWith("Fork from entry failed: Entry ID not found", "error");
    expect(setResumeErrors).toHaveBeenCalled();
  });

  // Issue #107. `settleFork` is the single clear-path for the fork-pending
  // spinner AND for the source session's optimistic `resuming` flag. Fork
  // leaves the source session alive, so if either arm skipped this the
  // source's Resume/Fork buttons would stay disabled forever.
  describe("fork-pending settle", () => {
    it("settles on the FAILURE arm", () => {
      const { dispatch, settleFork } = setup(new Map());
      dispatch({
        type: "resume_result", success: false, sessionId: "s1",
        message: "nope", requestId: "rq_f",
      } as ServerToBrowserMessage);
      expect(settleFork).toHaveBeenCalledWith("rq_f");
    });

    it("settles on the SUCCESS arm", () => {
      const { dispatch, settleFork } = setup(new Map());
      dispatch({
        type: "resume_result", success: true, sessionId: "s1",
        message: "ok", requestId: "rq_s",
      } as ServerToBrowserMessage);
      expect(settleFork).toHaveBeenCalledWith("rq_s");
    });

    it("settles on the correlated session_added", () => {
      const pending = new Map([["rq_a", { cwd: "", kind: "resume" as const }]]);
      const { dispatch, settleFork } = setup(pending);
      dispatch({
        type: "session_added", session: makeSession("fork-3", "/repo"), spawnRequestId: "rq_a",
      } as ServerToBrowserMessage);
      expect(settleFork).toHaveBeenCalledWith("rq_a");
    });

    it("does nothing when resume_result carries no requestId", () => {
      const { dispatch, settleFork } = setup(new Map());
      dispatch({
        type: "resume_result", success: true, sessionId: "s1", message: "ok",
      } as ServerToBrowserMessage);
      expect(settleFork).not.toHaveBeenCalled();
    });
  });

  it("renders the localized toast for code FORK_SOURCE_UNAVAILABLE", () => {
    const { dispatch, showToast } = setup(new Map());

    dispatch({
      type: "resume_result",
      success: false,
      sessionId: "s1",
      code: "FORK_SOURCE_UNAVAILABLE",
      message: "Can't fork — pi's transcript file for this session is no longer on disk.",
      requestId: "rq_u",
    } as ServerToBrowserMessage);

    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/no longer on disk/i),
      "error",
    );
  });
});
