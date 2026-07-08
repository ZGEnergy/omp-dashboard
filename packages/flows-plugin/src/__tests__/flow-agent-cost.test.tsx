/**
 * Per-agent USD cost surfacing (change surface-flow-agent-cost).
 *
 * Pins: reducer stores `result.cost` verbatim onto `FlowAgentState.cost`
 * (undefined when absent), the `formatCost` precision rule (>= 1 → 2dp,
 * < 1 → 4dp), the card stats-line `$` segment (shown when > 0, suppressed
 * when 0/undefined), and the detail header cost value.
 */

import {
  createUiPrimitiveRegistry,
  registerUiPrimitive,
  UiPrimitiveProvider,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import { withUiPrimitiveProvider } from "@blackbelt-technology/dashboard-plugin-runtime/test-support";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import type {
  DashboardEvent,
  FlowAgentState,
  FlowState,
} from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { cleanup, render } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FlowAgentCard, formatCost } from "../client/FlowAgentCard.js";
import { FlowAgentDetail } from "../client/FlowAgentDetail.js";
import { reduceFlowEvent } from "../reducer.js";

function ev(type: string, data: Record<string, unknown>): DashboardEvent {
  return { seq: 1, timestamp: 0, sessionId: "s1", eventType: type, data } as unknown as DashboardEvent;
}

function fold(events: Array<[string, Record<string, unknown>]>): FlowState | null {
  let s: FlowState | null = null;
  for (const [t, d] of events) s = reduceFlowEvent(s, ev(t, d));
  return s;
}

const started: Array<[string, Record<string, unknown>]> = [
  ["flow_started", {
    flowName: "f", task: "t",
    steps: [{ id: "a", stepType: "agent", agent: "a", blockedBy: [] }],
  }],
  ["flow_agent_started", { agentName: "a", stepId: "a", nodeKind: "agent" }],
];

describe("cost reducer (task 1.1, 1.2)", () => {
  it("stores result.cost verbatim onto FlowAgentState.cost", () => {
    const s = fold([
      ...started,
      ["flow_agent_complete", { agentName: "a", stepId: "a", result: { success: true, cost: 0.0142 } }],
    ])!;
    expect(s.agents.get("a")?.cost).toBe(0.0142);
  });

  it("leaves cost undefined when the completion event omits it", () => {
    const s = fold([
      ...started,
      ["flow_agent_complete", { agentName: "a", stepId: "a", result: { success: true } }],
    ])!;
    expect(s.agents.get("a")?.cost).toBeUndefined();
  });
});

describe("formatCost helper (task 1.3)", () => {
  it("uses two decimals at or above $1", () => {
    expect(formatCost(1.2)).toBe("$1.20");
    expect(formatCost(12)).toBe("$12.00");
    expect(formatCost(1)).toBe("$1.00"); // exact >= 1 boundary
  });
  it("uses four decimals below $1", () => {
    expect(formatCost(0.0142)).toBe("$0.0142");
    expect(formatCost(0.5)).toBe("$0.5000");
  });
});

// --- Card render (task 1.4) ---
const cardRegistry = createUiPrimitiveRegistry();
registerUiPrimitive(
  cardRegistry,
  UI_PRIMITIVE_KEYS.agentCard,
  (({ children, stats }: { children: React.ReactNode; stats?: React.ReactNode }) => (
    <div data-testid="card"><div data-testid="stats">{stats}</div>{children}</div>
  )) as never,
);
registerUiPrimitive(cardRegistry, UI_PRIMITIVE_KEYS.formatTokens, ((n: number) => String(n)) as never);
registerUiPrimitive(cardRegistry, UI_PRIMITIVE_KEYS.formatDuration, ((n: number) => `${n}ms`) as never);
registerUiPrimitive(cardRegistry, UI_PRIMITIVE_KEYS.dialog, (() => null) as never);
registerUiPrimitive(cardRegistry, UI_PRIMITIVE_KEYS.markdownContent, (() => null) as never);

function makeAgent(over: Partial<FlowAgentState>): FlowAgentState {
  return {
    agentName: "a", stepId: "a", status: "complete", blockedBy: [],
    recentTools: [], detailHistory: [],
    tokens: { input: 12000, output: 3000 }, duration: 4200,
    ...over,
  } as FlowAgentState;
}

function renderCard(agent: FlowAgentState) {
  return render(
    <UiPrimitiveProvider value={cardRegistry}>
      <FlowAgentCard agent={agent} />
    </UiPrimitiveProvider>,
  );
}

describe("FlowAgentCard cost segment (task 1.4)", () => {
  afterEach(cleanup);

  it("shows a $ segment when cost > 0", () => {
    const { getByTestId } = renderCard(makeAgent({ cost: 0.0142 }));
    expect(getByTestId("stats").textContent).toContain("$0.0142");
  });

  it("omits the segment when cost is 0 (no $, no dangling separator)", () => {
    const { getByTestId } = renderCard(makeAgent({ cost: 0 }));
    const text = getByTestId("stats").textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).toContain("12000");
  });

  it("omits the segment when cost is undefined", () => {
    const { getByTestId } = renderCard(makeAgent({ cost: undefined }));
    expect(getByTestId("stats").textContent ?? "").not.toContain("$");
  });
});

// --- Detail header (task 1.5) ---
function renderDetail(agent: FlowAgentState) {
  return render(
    withUiPrimitiveProvider(
      {
        "ui:markdown-content": (({ content }: { content: string }) => <div>{content}</div>) as never,
        "ui:format-tokens": ((n: number) => String(n)) as never,
        "ui:format-duration": ((n: number) => `${n}ms`) as never,
      },
      <FlowAgentDetail agent={agent} />,
    ),
  );
}

describe("FlowAgentDetail cost in header (task 1.5)", () => {
  afterEach(cleanup);

  it("shows cost when present and > 0", () => {
    const { container } = renderDetail(makeAgent({ cost: 0.0142 }));
    expect(container.textContent).toContain("$0.0142");
  });

  it("omits cost when 0", () => {
    const { container } = renderDetail(makeAgent({ cost: 0 }));
    expect(container.textContent).not.toContain("$");
  });

  it("omits cost when absent", () => {
    const { container } = renderDetail(makeAgent({ cost: undefined }));
    expect(container.textContent).not.toContain("$");
  });
});
