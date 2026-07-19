import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerToBrowserMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { DashboardEvent, DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { createInitialState, type SessionState } from "../../lib/event-reducer.js";
import { useMessageHandler } from "../useMessageHandler.js";

function makeSession(overrides: Partial<DashboardSession> = {}): DashboardSession {
  return {
    id: "s1",
    cwd: "/tmp/repo",
    source: "tui",
    status: "active",
    startedAt: 1,
    ...overrides,
  } as DashboardSession;
}

function setup(initialState: SessionState, initialSession: DashboardSession = makeSession()) {
  const statesRef = { current: new Map([[initialSession.id, initialState]]) };
  const sessionsRef = { current: new Map([[initialSession.id, initialSession]]) };
  const setSessionStates = vi.fn((updater: any) => {
    statesRef.current = typeof updater === "function" ? updater(statesRef.current) : updater;
  });
  const setSessions = vi.fn((updater: any) => {
    sessionsRef.current = typeof updater === "function" ? updater(sessionsRef.current) : updater;
  });

  const setters: any = {
    setSessions,
    setSessionStates,
    setSessionCommands: vi.fn(),
    setFileResults: vi.fn(),
    setChangedOnDisk: vi.fn(),
    setOpenspecMap: vi.fn(),
    setFolderGitMap: vi.fn(),
    setOpenspecGroupsMap: vi.fn(),
    setModelsMap: vi.fn(),
    setRolesMap: vi.fn(),
    setSpawnResult: vi.fn(),
    setSessionOrderMap: vi.fn(),
    setPinnedDirectories: vi.fn(),
    setPinnedDirsLoaded: vi.fn(),
    setFavoriteModels: vi.fn(),
    setWorkspaces: vi.fn(),
    setTerminals: vi.fn(),
    setDiscoveredServers: vi.fn(),
    setSpawnErrors: vi.fn(),
    setResumeErrors: vi.fn(),
    setDisplayPrefs: vi.fn(),
    setViewMessagesMap: vi.fn(),
    setLoadingHistory: vi.fn(),
    setCanvasMap: vi.fn(),
  };
  const deps: any = {
    send: vi.fn(),
    navigate: vi.fn(),
    clearSpawningCwd: vi.fn(),
    spawningCwdsRef: { current: new Set<string>() },
    subscribedRef: { current: new Set<string>() },
    pendingTerminalCwdRef: { current: null },
    lastCreatedTerminalIdRef: { current: null },
    maxSeqMapRef: { current: new Map<string, number>() },
    selectedSessionIdRef: { current: undefined },
    pendingSpawnsRef: { current: new Map() },
    loadingHistoryTimersRef: { current: new Map() },
  };
  const { result } = renderHook(() => useMessageHandler(setters, deps));
  return {
    dispatch: (message: ServerToBrowserMessage) => result.current(message),
    statesRef,
    sessionsRef,
    setSessionStates,
  };
}

function sessionUpdated(updates: Record<string, unknown>): ServerToBrowserMessage {
  return { type: "session_updated", sessionId: "s1", updates } as ServerToBrowserMessage;
}

function modelSelectEvent(): ServerToBrowserMessage {
  return {
    type: "event",
    sessionId: "s1",
    seq: 1,
    event: {
      sessionId: "s1",
      eventType: "model_select",
      timestamp: 1,
      data: {
        model: { provider: "anthropic", id: "claude-3" },
        thinkingLevel: "high",
      },
    } as DashboardEvent,
  };
}

describe("useMessageHandler authoritative model snapshots", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears stale thinking state when the server snapshot carries null", () => {
    const initialState = { ...createInitialState(), model: "openai/old", thinkingLevel: "high" };
    const initialSession = makeSession({ model: "openai/old", thinkingLevel: "high" });
    const { dispatch, statesRef, sessionsRef } = setup(initialState, initialSession);

    dispatch(sessionUpdated({ model: "anthropic/claude-3", thinkingLevel: null }));

    expect(statesRef.current.get("s1")).toMatchObject({ model: "anthropic/claude-3", thinkingLevel: null });
    expect(sessionsRef.current.get("s1")).toMatchObject({ model: "anthropic/claude-3", thinkingLevel: null });
  });

  it("does not optimistically apply model_select to live preference state", () => {
    const initialState = { ...createInitialState(), model: "openai/old", thinkingLevel: "low" };
    const { dispatch, statesRef } = setup(initialState);

    dispatch(modelSelectEvent());
    for (const callback of rafCallbacks.splice(0)) callback(performance.now());

    expect(statesRef.current.get("s1")).toMatchObject({ model: "openai/old", thinkingLevel: "low" });
  });

  it("keeps the last Pi-ordered session snapshot", () => {
    const { dispatch, statesRef, sessionsRef } = setup(createInitialState());

    dispatch(sessionUpdated({ model: "openai/first", thinkingLevel: "low" }));
    dispatch(sessionUpdated({ model: "anthropic/last", thinkingLevel: null }));

    expect(statesRef.current.get("s1")).toMatchObject({ model: "anthropic/last", thinkingLevel: null });
    expect(sessionsRef.current.get("s1")).toMatchObject({ model: "anthropic/last", thinkingLevel: null });
  });
});
