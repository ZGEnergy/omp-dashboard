/**
 * Regressions for change: session-tail-rehydrate (reviewer P1/P2).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMessageHandler } from "../useMessageHandler.js";
import {
  createInitialState,
  type SessionState,
  type InteractiveUiRequest,
} from "../../lib/event-reducer.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { ServerToBrowserMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { CachedEvent } from "../../lib/replay-cache.js";

function makeStartEvt(toolCallId: string, ts: number): DashboardEvent {
  return {
    eventType: "tool_execution_start",
    timestamp: ts,
    data: { toolCallId, toolName: "bash", args: { command: `cmd-${toolCallId}` } },
  };
}

function setup(opts?: { withPersister?: boolean }) {
  const sessionStatesRef = { current: new Map<string, SessionState>() };
  const maxSeqMap = new Map<string, number>();
  const historyWindowRef = {
    current: new Map<string, { minSeq: number; hasMoreOlder: boolean }>(),
  };
  const historyWindowMapRef = {
    current: new Map<string, { minSeq: number; hasMoreOlder: boolean }>(),
  };
  const loadingOlderMapRef = { current: new Map<string, boolean>() };
  const buffers = new Map<string, CachedEvent[]>();

  const setSessionStates = vi.fn((updater: any) => {
    if (typeof updater === "function") {
      sessionStatesRef.current = updater(sessionStatesRef.current);
    } else {
      sessionStatesRef.current = updater;
    }
  });
  const setHistoryWindowMap = vi.fn((updater: any) => {
    if (typeof updater === "function") {
      historyWindowMapRef.current = updater(historyWindowMapRef.current);
    } else {
      historyWindowMapRef.current = updater;
    }
  });
  const setLoadingOlderMap = vi.fn((updater: any) => {
    if (typeof updater === "function") {
      loadingOlderMapRef.current = updater(loadingOlderMapRef.current);
    } else {
      loadingOlderMapRef.current = updater;
    }
  });

  const replayPersister = opts?.withPersister
    ? {
        record(sessionId: string, events: CachedEvent[]) {
          const cur = buffers.get(sessionId) ?? [];
          const bySeq = new Map(cur.map((e) => [e.seq, e]));
          for (const e of events) bySeq.set(e.seq, e);
          buffers.set(sessionId, [...bySeq.values()].sort((a, b) => a.seq - b.seq));
        },
        seed(sessionId: string, events: CachedEvent[]) {
          buffers.set(sessionId, [...events].sort((a, b) => a.seq - b.seq));
        },
        merge(sessionId: string, events: CachedEvent[]) {
          const cur = buffers.get(sessionId) ?? [];
          const bySeq = new Map(cur.map((e) => [e.seq, e]));
          for (const e of events) bySeq.set(e.seq, e);
          const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
          buffers.set(sessionId, merged);
          return merged;
        },
        snapshot(sessionId: string) {
          return buffers.get(sessionId) ?? [];
        },
        drop: vi.fn(async (sessionId: string) => {
          buffers.delete(sessionId);
        }),
        flush: vi.fn(async () => {}),
      }
    : undefined;

  const setters: any = {
    setSessions: vi.fn(),
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
    setFavoriteModels: vi.fn(),
    setWorkspaces: vi.fn(),
    setTerminals: vi.fn(),
    setEditorStatuses: vi.fn(),
    setDiscoveredServers: vi.fn(),
    setSpawnErrors: vi.fn(),
    setResumeErrors: vi.fn(),
    setDisplayPrefs: vi.fn(),
    setViewMessagesMap: vi.fn(),
    setLoadingHistory: vi.fn(),
  };

  const deps: any = {
    send: vi.fn(),
    navigate: vi.fn(),
    clearSpawningCwd: vi.fn(),
    spawningCwdsRef: { current: new Set() },
    subscribedRef: { current: new Set() },
    pendingTerminalCwdRef: { current: null },
    lastCreatedTerminalIdRef: { current: null },
    maxSeqMapRef: { current: maxSeqMap },
    selectedSessionIdRef: { current: undefined },
    pendingSpawnsRef: { current: new Map() },
    loadingHistoryTimersRef: { current: new Map() },
    replayPersister,
    historyWindowRef,
    setHistoryWindowMap,
    setLoadingOlderMap,
  };

  const { result } = renderHook(() => useMessageHandler(setters, deps));
  const dispatch = (msg: ServerToBrowserMessage) => result.current(msg);
  return {
    dispatch,
    sessionStatesRef,
    maxSeqMap,
    historyWindowRef,
    historyWindowMapRef,
    loadingOlderMapRef,
    buffers,
    setLoadingOlderMap,
  };
}

describe("useMessageHandler session-tail-rehydrate", () => {
  const SID = "s-tail";

  it("session_state_reset clears history window meta", () => {
    const { dispatch, historyWindowRef, historyWindowMapRef, loadingOlderMapRef } = setup();
    historyWindowRef.current.set(SID, { minSeq: 50, hasMoreOlder: true });
    historyWindowMapRef.current.set(SID, { minSeq: 50, hasMoreOlder: true });
    loadingOlderMapRef.current.set(SID, true);

    dispatch({ type: "session_state_reset", sessionId: SID } as ServerToBrowserMessage);

    expect(historyWindowRef.current.has(SID)).toBe(false);
    expect(historyWindowMapRef.current.has(SID)).toBe(false);
    expect(loadingOlderMapRef.current.has(SID)).toBe(false);
  });

  it("does not invent hasMoreOlder from warm deltas without window meta", () => {
    const { dispatch, historyWindowRef, maxSeqMap } = setup();
    // Seed a prior max so this is a warm delta, not a cold seed.
    maxSeqMap.set(SID, 10);
    dispatch({
      type: "event_replay",
      sessionId: SID,
      events: [{ seq: 11, event: makeStartEvt("t11", 1100) }],
      isLast: true,
    } as ServerToBrowserMessage);

    expect(historyWindowRef.current.get(SID)).toBeUndefined();
  });

  it("cold windowed seed (firstSeq>1, maxSeq=0) infers hasMoreOlder", () => {
    const { dispatch, historyWindowRef } = setup();
    dispatch({
      type: "event_replay",
      sessionId: SID,
      events: [
        { seq: 50, event: makeStartEvt("t50", 5000) },
        { seq: 51, event: makeStartEvt("t51", 5100) },
      ],
      isLast: true,
    } as ServerToBrowserMessage);

    expect(historyWindowRef.current.get(SID)).toEqual({ minSeq: 50, hasMoreOlder: true });
  });

  it("loadingOlder clears only on isLast terminal batch", () => {
    const { dispatch, loadingOlderMapRef, maxSeqMap, buffers } = setup({ withPersister: true });
    maxSeqMap.set(SID, 100);
    // Seed tail buffer so older page can merge
    buffers.set(SID, [
      { seq: 90, event: makeStartEvt("t90", 9000) },
      { seq: 100, event: makeStartEvt("t100", 10000) },
    ]);
    loadingOlderMapRef.current.set(SID, true);

    dispatch({
      type: "event_replay",
      sessionId: SID,
      events: [{ seq: 80, event: makeStartEvt("t80", 8000) }],
      windowMaxSeq: 80,
      isLast: false,
    } as ServerToBrowserMessage);
    expect(loadingOlderMapRef.current.get(SID)).toBe(true);

    dispatch({
      type: "event_replay",
      sessionId: SID,
      events: [{ seq: 70, event: makeStartEvt("t70", 7000) }],
      windowMaxSeq: 80,
      isLast: true,
    } as ServerToBrowserMessage);
    expect(loadingOlderMapRef.current.get(SID)).toBe(false);
  });

  it("older-page merge preserves pending interactive ask UI", () => {
    const { dispatch, sessionStatesRef, maxSeqMap, buffers } = setup({ withPersister: true });
    maxSeqMap.set(SID, 20);
    buffers.set(SID, [
      { seq: 15, event: makeStartEvt("t15", 1500) },
      { seq: 20, event: makeStartEvt("t20", 2000) },
    ]);

    const ask: InteractiveUiRequest = {
      requestId: "ask-1",
      method: "ask_user",
      params: { prompt: "Continue?" },
      status: "pending",
    };
    const seeded = createInitialState();
    seeded.interactiveRequests = [ask];
    seeded.messages = [
      {
        id: "ui-ask-1",
        role: "interactiveUi",
        content: "ask_user",
        timestamp: 999,
        args: { requestId: "ask-1", method: "ask_user", params: { prompt: "Continue?" }, status: "pending" },
      },
    ];
    sessionStatesRef.current.set(SID, seeded);

    dispatch({
      type: "event_replay",
      sessionId: SID,
      events: [{ seq: 5, event: makeStartEvt("t5", 500) }],
      windowMaxSeq: 5,
      isLast: true,
    } as ServerToBrowserMessage);

    const state = sessionStatesRef.current.get(SID)!;
    expect(state.interactiveRequests.some((r) => r.requestId === "ask-1")).toBe(true);
    expect(state.messages.some((m) => m.role === "interactiveUi" && m.id === "ui-ask-1")).toBe(true);
  });
});
