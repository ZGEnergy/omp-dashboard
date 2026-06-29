/**
 * Tests for the flow_write / flow_agents authoring tool renderers.
 * Covers success, validation-failure, and list states + the args-backed
 * Mermaid snapshot. See change: rework-flows-plugin-for-new-pi-flows.
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
import { FlowWriteToolRenderer } from "../client/FlowWriteToolRenderer.js";
import { FlowAgentsToolRenderer } from "../client/FlowAgentsToolRenderer.js";

const registry = createUiPrimitiveRegistry();
registerUiPrimitive(
  registry,
  UI_PRIMITIVE_KEYS.markdownContent,
  (({ content }: { content: string }) => <div data-testid="md">{content}</div>) as never,
);

function renderWrite(props: { toolInput: Record<string, unknown>; status?: "running" | "complete" | "error"; result?: string }) {
  return render(
    <UiPrimitiveProvider value={registry}>
      <FlowWriteToolRenderer toolName="flow_write" sessionId="s1" {...props} />
    </UiPrimitiveProvider>,
  );
}

const FLOW_YAML = `name: invoice
steps:
  - id: extract
    type: agent
    agent: e
    blockedBy: []
  - id: validate
    type: code
    blockedBy: [extract]`;

afterEach(() => cleanup());

describe("FlowWriteToolRenderer", () => {
  it("success: shows command, counts, and a Mermaid snapshot from args", () => {
    const { getByText, getByTestId } = renderWrite({
      toolInput: { name: "invoice", content: FLOW_YAML },
      status: "complete",
      result: JSON.stringify({ written: true, name: "invoice", namespace: "custom", command: "custom:invoice", path: "/p/invoice.yaml", diagnostics: [] }),
    });
    expect(getByText("/custom:invoice")).toBeTruthy();
    expect(getByText("2 steps · 1 agents, 1 code")).toBeTruthy();
    expect(getByTestId("md").textContent).toContain("graph LR");
  });

  it("validation failure: renders diagnostics verbatim", () => {
    const { getByText } = renderWrite({
      toolInput: { name: "invoice", content: FLOW_YAML },
      status: "error",
      result: JSON.stringify({ written: false, diagnostics: [{ message: 'step "validate" missing' }] }),
    });
    expect(getByText(/step "validate" missing/)).toBeTruthy();
  });

  it("view-yaml toggle reveals the submitted args", () => {
    const { getByText, queryByText } = renderWrite({
      toolInput: { name: "invoice", content: FLOW_YAML },
      status: "complete",
      result: JSON.stringify({ written: true, command: "custom:invoice", diagnostics: [] }),
    });
    expect(queryByText(/type: code/)).toBeNull();
    fireEvent.click(getByText(/View flow YAML/));
    expect(getByText(/type: code/)).toBeTruthy();
  });
});

describe("FlowAgentsToolRenderer", () => {
  it("list: shows agent names + count", () => {
    const { getByText } = render(
      <FlowAgentsToolRenderer toolName="flow_agents" sessionId="s1"
        toolInput={{ op: "list" }} status="complete"
        result={JSON.stringify([{ name: "reviewer" }, { name: "reader" }])} />,
    );
    expect(getByText("list · 2 agents")).toBeTruthy();
    expect(getByText("reviewer · reader")).toBeTruthy();
  });

  it("write success: shows saved name", () => {
    const { getByText } = render(
      <FlowAgentsToolRenderer toolName="flow_agents" sessionId="s1"
        toolInput={{ op: "write", content: "name: reviewer" }} status="complete"
        result={JSON.stringify({ written: true, name: "reviewer", path: "/a/reviewer.md", diagnostics: [] })} />,
    );
    expect(getByText("reviewer")).toBeTruthy();
    expect(getByText("saved")).toBeTruthy();
  });

  it("write failure: shows diagnostics", () => {
    const { getByText } = render(
      <FlowAgentsToolRenderer toolName="flow_agents" sessionId="s1"
        toolInput={{ op: "write", content: "bad" }} status="error"
        result={JSON.stringify({ written: false, error: "missing name" })} />,
    );
    expect(getByText("not written")).toBeTruthy();
    expect(getByText(/missing name/)).toBeTruthy();
  });
});
