/**
 * Tests for `reduceFlowsSessionState` and `useFlowsSessionState`.
 *
 * The pure reducer is tested with synthesized event sequences to verify
 * it matches the shell's pre-deletion behavior (event-reducer.ts:1292-1313)
 * exactly. The hook is smoke-tested via React rendering with a live
 * `useSessionEvents` subscription and direct calls to
 * `publishSessionEvent` to drive the event stream.
 *
 * See change: pluginize-flows-via-registry.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import {
  PluginContextProvider,
  publishSessionEvent,
  clearSessionEvents,
} from "@blackbelt-technology/dashboard-plugin-runtime";

// We don't import __resetSessionEventsStoreForTests across the package
// boundary (it's marked @internal). Each test scopes events to a unique
// session id, so isolation comes from the session-id namespace itself.
let __testCounter = 0;
function nextSessionId(): string { return `S-${++__testCounter}`; }
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import {
  reduceFlowsSessionState,
  useFlowsSessionState,
  type FlowsSessionState,
} from "../client/FlowsSessionStateContext.js";

// ── Event factories matching the real protocol shapes ──────────────

function flowStartedEvent(seq: number, flowName = "build"): DashboardEvent {
  return {
    seq,
    timestamp: new Date(seq * 1000).toISOString(),
    eventType: "flow_started",
    data: {
      flowName,
      task: "test task",
      steps: [
        { id: "s1", stepType: "agent", agent: "alpha", blockedBy: [] },
        { id: "s2", stepType: "agent", agent: "beta", blockedBy: ["s1"] },
      ],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function flowSummaryDismissedEvent(seq: number): DashboardEvent {
  return {
    seq,
    timestamp: new Date(seq * 1000).toISOString(),
    eventType: "flow_summary_dismissed",
    data: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function architectStartedEvent(seq: number): DashboardEvent {
  return {
    seq,
    timestamp: new Date(seq * 1000).toISOString(),
    eventType: "architect_started",
    data: {
      mode: "new",
      iteration: 1,
      resolvedModel: "claude-sonnet-4",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function unrelatedEvent(seq: number): DashboardEvent {
  return {
    seq,
    timestamp: new Date(seq * 1000).toISOString(),
    eventType: "tool_start",
    data: { toolName: "Read" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ── Pure reducer tests ─────────────────────────────────────────────

describe("reduceFlowsSessionState (pure)", () => {
  it("returns the same EMPTY_STATE reference for empty input", () => {
    const a = reduceFlowsSessionState([]);
    const b = reduceFlowsSessionState([]);
    expect(a).toBe(b);
    expect(a.flowState).toBeNull();
    expect(a.architectState).toBeNull();
    expect(a.flowStates.size).toBe(0);
  });

  it("returns EMPTY_STATE when no flow / architect events are present", () => {
    const result = reduceFlowsSessionState([
      unrelatedEvent(1),
      unrelatedEvent(2),
    ]);
    expect(result.flowState).toBeNull();
    expect(result.architectState).toBeNull();
  });

  it("derives flowState from a flow_started event", () => {
    const result = reduceFlowsSessionState([flowStartedEvent(1, "build")]);
    expect(result.flowState).not.toBeNull();
    expect(result.flowState!.flowName).toBe("build");
    expect(result.flowStates.size).toBe(1);
    expect(result.flowStates.get("build")).toBe(result.flowState);
  });

  it("clears flowStates on flow_summary_dismissed", () => {
    const result = reduceFlowsSessionState([
      flowStartedEvent(1, "build"),
      flowSummaryDismissedEvent(2),
    ]);
    // flow_summary_dismissed clears flowStates per
    // event-reducer.ts:1298-1300 behavior.
    expect(result.flowStates.size).toBe(0);
  });

  it("derives architectState from architect_started", () => {
    const result = reduceFlowsSessionState([architectStartedEvent(1)]);
    expect(result.architectState).not.toBeNull();
    // architect_started doesn't carry flowName — that's filled in by
    // later events (architect_preview / architect_complete). What
    // architect_started DOES set is phase + architectMode + iteration.
    expect(result.architectState!.phase).toBe("designing");
    expect(result.architectState!.architectMode).toBe("new");
  });

  it("derives both flow and architect state when events of both kinds are present", () => {
    const result = reduceFlowsSessionState([
      architectStartedEvent(1),
      flowStartedEvent(2, "build"),
    ]);
    expect(result.architectState).not.toBeNull();
    expect(result.flowState).not.toBeNull();
    expect(result.flowState!.flowName).toBe("build");
  });

  it("ignores unrelated events between flow events", () => {
    const result = reduceFlowsSessionState([
      flowStartedEvent(1, "build"),
      unrelatedEvent(2),
      unrelatedEvent(3),
    ]);
    expect(result.flowState!.flowName).toBe("build");
  });
});

// ── Hook tests (live useSessionEvents subscription) ────────────────

function Probe({ sessionId, onSnapshot }: {
  sessionId: string;
  onSnapshot: (state: FlowsSessionState) => void;
}) {
  const state = useFlowsSessionState(sessionId);
  onSnapshot(state);
  return (
    <div data-testid="probe">
      flow={state.flowState?.flowName ?? "(none)"} arch={state.architectState?.flowName ?? "(none)"}
    </div>
  );
}

describe("useFlowsSessionState (hook)", () => {
  afterEach(() => cleanup());

  it("returns EMPTY_STATE for a session with no events", () => {
    const snaps: FlowsSessionState[] = [];
    const sid = nextSessionId();
    render(
      <PluginContextProvider>
        <Probe sessionId={sid} onSnapshot={(s) => snaps.push(s)} />
      </PluginContextProvider>,
    );
    expect(snaps[0].flowState).toBeNull();
    expect(snaps[0].architectState).toBeNull();
  });

  it("re-renders with derived state when a flow event arrives", () => {
    const snaps: FlowsSessionState[] = [];
    const sid = nextSessionId();
    const { getByTestId } = render(
      <PluginContextProvider>
        <Probe sessionId={sid} onSnapshot={(s) => snaps.push(s)} />
      </PluginContextProvider>,
    );
    expect(getByTestId("probe").textContent).toContain("flow=(none)");

    act(() => publishSessionEvent(sid, flowStartedEvent(1, "build")));
    expect(getByTestId("probe").textContent).toContain("flow=build");
  });

  it("scopes derived state per session", () => {
    const snapsA: FlowsSessionState[] = [];
    const snapsB: FlowsSessionState[] = [];
    const sidA = nextSessionId();
    const sidB = nextSessionId();
    render(
      <PluginContextProvider>
        <Probe sessionId={sidA} onSnapshot={(s) => snapsA.push(s)} />
        <Probe sessionId={sidB} onSnapshot={(s) => snapsB.push(s)} />
      </PluginContextProvider>,
    );

    act(() => publishSessionEvent(sidA, flowStartedEvent(1, "alpha-flow")));
    act(() => publishSessionEvent(sidB, flowStartedEvent(2, "beta-flow")));

    const lastA = snapsA[snapsA.length - 1];
    const lastB = snapsB[snapsB.length - 1];
    expect(lastA.flowState!.flowName).toBe("alpha-flow");
    expect(lastB.flowState!.flowName).toBe("beta-flow");
  });

  it("returns a stable state reference across renders that don't change events", () => {
    const snaps: FlowsSessionState[] = [];
    const sid = nextSessionId();
    const { rerender } = render(
      <PluginContextProvider>
        <Probe sessionId={sid} onSnapshot={(s) => snaps.push(s)} />
      </PluginContextProvider>,
    );

    act(() => publishSessionEvent(sid, flowStartedEvent(1, "build")));
    const refAfterPublish = snaps[snaps.length - 1];

    // Force re-render without publishing.
    rerender(
      <PluginContextProvider>
        <Probe sessionId={sid} onSnapshot={(s) => snaps.push(s)} />
      </PluginContextProvider>,
    );
    const refAfterRerender = snaps[snaps.length - 1];

    expect(refAfterRerender).toBe(refAfterPublish);
  });

  it("clears flowStates when the events store is cleared", () => {
    const snaps: FlowsSessionState[] = [];
    const sid = nextSessionId();
    render(
      <PluginContextProvider>
        <Probe sessionId={sid} onSnapshot={(s) => snaps.push(s)} />
      </PluginContextProvider>,
    );

    act(() => publishSessionEvent(sid, flowStartedEvent(1, "build")));
    expect(snaps[snaps.length - 1].flowState).not.toBeNull();

    act(() => clearSessionEvents(sid));
    const last = snaps[snaps.length - 1];
    expect(last.flowState).toBeNull();
    expect(last.flowStates.size).toBe(0);
  });
});
