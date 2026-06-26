/**
 * Tests for expandable per-agent rows in FlowSummary.
 * Collapsed rows show a truncated peek; expanding reveals full summary
 * (markdown), typed-output chips, and the file list. Failed steps
 * auto-expand. Rows without detail are not interactive. Per-row state
 * is independent. See change: expandable-flow-summary-rows.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  UiPrimitiveProvider,
  createUiPrimitiveRegistry,
  registerUiPrimitive,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import type { FlowState, FlowAgentState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { FlowSummary } from "../client/FlowSummary.js";

const registry = createUiPrimitiveRegistry();
registerUiPrimitive(
  registry,
  UI_PRIMITIVE_KEYS.markdownContent,
  (({ content }: { content: string }) => <div data-testid="md">{content}</div>) as never,
);
registerUiPrimitive(
  registry,
  UI_PRIMITIVE_KEYS.formatDuration,
  (((ms: number) => `${ms}ms`) as never),
);
// FlowGraph (rendered inside FlowSummary) consumes the zoom-controls primitive.
registerUiPrimitive(
  registry,
  UI_PRIMITIVE_KEYS.zoomControls,
  ((() => null) as never),
);

function agent(over: Partial<FlowAgentState>): FlowAgentState {
  return {
    agentName: over.stepId ?? "a",
    stepId: over.stepId ?? "a",
    status: "complete",
    blockedBy: [],
    recentTools: [],
    detailHistory: [],
    ...over,
  };
}

function makeState(agents: FlowAgentState[]): FlowState {
  return {
    flowName: "demo-flow",
    task: "t",
    status: "success",
    autonomousMode: false,
    agents: new Map(agents.map((a) => [a.stepId, a])),
  };
}

function renderSummary(state: FlowState) {
  return render(
    <UiPrimitiveProvider value={registry}>
      <FlowSummary flowState={state} onDismiss={() => {}} />
    </UiPrimitiveProvider>,
  );
}

afterEach(() => cleanup());

describe("FlowSummary expandable rows", () => {
  it("collapsed complete row shows truncated peek; clicking reveals full summary, chips, files", () => {
    const state = makeState([
      agent({
        stepId: "classify",
        label: "classify-intent",
        status: "complete",
        summary: "Decided the request was a refactor of the reducer module.",
        files: ["flow-reducer.ts", "flow-reducer.test.ts"],
        typedOutputs: { intent: "refactor", branch: "refactor" },
      }),
    ]);
    const { getByText, queryByTestId, getByTestId } = renderSummary(state);

    // Collapsed: full summary not yet rendered through markdown primitive.
    expect(queryByTestId("md")).toBeNull();

    fireEvent.click(getByText("classify-intent", { selector: "span" }));

    // Expanded: full summary via markdown primitive.
    expect(getByTestId("md").textContent).toContain("refactor of the reducer module");
    // Typed-output chip (branch filtered out, intent shown).
    expect(getByText("intent")).toBeTruthy();
    // File list rendered.
    expect(getByText(/flow-reducer\.test\.ts/)).toBeTruthy();
  });

  it("failed step renders expanded on mount", () => {
    const state = makeState([
      agent({
        stepId: "verify",
        label: "verify-change",
        status: "error",
        outcome: "hard",
        summary: "Coverage gate failed on the new branch path.",
      }),
    ]);
    const { getByTestId } = renderSummary(state);
    // Auto-expanded → markdown primitive rendered without any click.
    expect(getByTestId("md").textContent).toContain("Coverage gate failed");
  });

  it("row without summary/files/typedOutputs is not interactive", () => {
    const state = makeState([
      agent({ stepId: "bare", label: "bare-step", status: "complete" }),
    ]);
    const { getByText, queryByTestId } = renderSummary(state);
    fireEvent.click(getByText("bare-step", { selector: "span" }));
    expect(queryByTestId("md")).toBeNull();
  });

  it("expanding one row leaves siblings collapsed", () => {
    const state = makeState([
      agent({ stepId: "one", label: "step-one", status: "complete", summary: "Summary one." }),
      agent({ stepId: "two", label: "step-two", status: "complete", summary: "Summary two." }),
    ]);
    const { getByText, getAllByTestId, queryAllByTestId } = renderSummary(state);

    expect(queryAllByTestId("md")).toHaveLength(0);
    fireEvent.click(getByText("step-one", { selector: "span" }));

    const mds = getAllByTestId("md");
    expect(mds).toHaveLength(1);
    expect(mds[0].textContent).toContain("Summary one.");
  });
});
