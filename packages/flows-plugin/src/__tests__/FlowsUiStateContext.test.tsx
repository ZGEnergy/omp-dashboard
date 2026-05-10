/**
 * Tests for the plugin-internal UI selection state. Verifies the
 * module-level store, setter semantics, no-op short-circuiting, and
 * the unified `dismissAll` cleanup. See change:
 * pluginize-flows-via-registry.
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import {
  useFlowsUiState,
  useFlowsUiActions,
  __resetFlowsUiStateForTests,
  type FlowsUiState,
} from "../client/FlowsUiStateContext.js";

function Probe({ onSnapshot }: { onSnapshot: (state: FlowsUiState) => void }) {
  const state = useFlowsUiState();
  onSnapshot(state);
  return (
    <div data-testid="probe">
      agent={state.flowDetailAgent ?? "(null)"} arch={String(state.architectDetailOpen)} src={state.sourceOpenAgent ?? "(null)"} yaml={state.flowYamlPreview?.title ?? "(null)"}
    </div>
  );
}

describe("FlowsUiStateContext", () => {
  beforeEach(() => __resetFlowsUiStateForTests());
  afterEach(() => {
    cleanup();
    __resetFlowsUiStateForTests();
  });

  it("starts with the initial state (all nulls / false)", () => {
    const snaps: FlowsUiState[] = [];
    render(<Probe onSnapshot={(s) => snaps.push(s)} />);
    expect(snaps[0]).toEqual({
      flowDetailAgent: null,
      architectDetailOpen: false,
      sourceOpenAgent: null,
      flowYamlPreview: null,
    });
  });

  it("notifies subscribers when setFlowDetailAgent changes the value", () => {
    const snaps: FlowsUiState[] = [];
    let actions: ReturnType<typeof useFlowsUiActions>;
    function ActionsProbe() {
      actions = useFlowsUiActions();
      return null;
    }
    const { getByTestId } = render(
      <>
        <ActionsProbe />
        <Probe onSnapshot={(s) => snaps.push(s)} />
      </>,
    );

    act(() => actions.setFlowDetailAgent("alpha"));
    expect(getByTestId("probe").textContent).toContain("agent=alpha");

    act(() => actions.setFlowDetailAgent(null));
    expect(getByTestId("probe").textContent).toContain("agent=(null)");
  });

  it("supports functional updater for setArchitectDetailOpen", () => {
    const { getByTestId } = render(
      <>
        <ActionsProbeWithUI />
      </>,
    );
    expect(getByTestId("probe").textContent).toContain("arch=false");

    act(() => actions.setArchitectDetailOpen((prev) => !prev));
    expect(getByTestId("probe").textContent).toContain("arch=true");

    act(() => actions.setArchitectDetailOpen((prev) => !prev));
    expect(getByTestId("probe").textContent).toContain("arch=false");
  });

  it("does not notify when a setter is called with the same value", () => {
    let renderCount = 0;
    function CountingProbe() {
      renderCount++;
      useFlowsUiState();
      return null;
    }
    function ActionsProbe() {
      actions = useFlowsUiActions();
      return null;
    }
    render(
      <>
        <ActionsProbe />
        <CountingProbe />
      </>,
    );
    const initial = renderCount;

    act(() => actions.setFlowDetailAgent(null)); // already null
    expect(renderCount).toBe(initial); // no extra render

    act(() => actions.setFlowDetailAgent("alpha")); // change
    expect(renderCount).toBe(initial + 1);

    act(() => actions.setFlowDetailAgent("alpha")); // same value
    expect(renderCount).toBe(initial + 1); // no extra render
  });

  it("dismissAll clears every field in one notify", () => {
    let renderCount = 0;
    function CountingProbe() {
      renderCount++;
      useFlowsUiState();
      return null;
    }
    function ActionsProbe() {
      actions = useFlowsUiActions();
      return null;
    }
    render(
      <>
        <ActionsProbe />
        <CountingProbe />
      </>,
    );

    // Set every field.
    act(() => {
      actions.setFlowDetailAgent("alpha");
      actions.setArchitectDetailOpen(true);
      actions.setSourceOpenAgent("beta");
      actions.setFlowYamlPreview({ content: "x", title: "t" });
    });
    const beforeDismiss = renderCount;

    // dismissAll: single act → expect a single notify (one render).
    act(() => actions.dismissAll());
    expect(renderCount).toBe(beforeDismiss + 1);

    // All fields cleared.
    const probeText = (function readProbe() {
      const snaps: FlowsUiState[] = [];
      render(<Probe onSnapshot={(s) => snaps.push(s)} />);
      return snaps[0];
    })();
    expect(probeText).toEqual({
      flowDetailAgent: null,
      architectDetailOpen: false,
      sourceOpenAgent: null,
      flowYamlPreview: null,
    });
  });

  it("returns a stable actions reference across renders", () => {
    const seen = new Set<unknown>();
    function ActionsProbe() {
      const a = useFlowsUiActions();
      seen.add(a);
      return null;
    }
    const { rerender } = render(<ActionsProbe />);
    rerender(<ActionsProbe />);
    rerender(<ActionsProbe />);
    expect(seen.size).toBe(1);
  });
});

// Shared module-level holder so tests can call setters from outside
// the rendered tree.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let actions: any;

function ActionsProbeWithUI() {
  actions = useFlowsUiActions();
  const state = useFlowsUiState();
  return (
    <div data-testid="probe">
      agent={state.flowDetailAgent ?? "(null)"} arch={String(state.architectDetailOpen)} src={state.sourceOpenAgent ?? "(null)"} yaml={state.flowYamlPreview?.title ?? "(null)"}
    </div>
  );
}
