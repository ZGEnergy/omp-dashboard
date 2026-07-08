/**
 * Group 5 (wire-flow-inputs-in-automation) — dialog hosts the
 * `automation-action-editor` slot additively below ActionPayloadForm, and the
 * file-trigger config field round-trips to `on:`.
 *
 * api + ui-primitive mocked (mirrors CreateAutomationDialog.test.tsx).
 */
import React from "react";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { withUiPrimitiveProvider } from "@blackbelt-technology/dashboard-plugin-runtime/test-support";
import {
  applyPluginConfigUpdate,
  PluginContextProvider,
  CurrentPluginLayer,
} from "@blackbelt-technology/dashboard-plugin-runtime/context";
import { createSlotRegistry, type SlotRegistry } from "@blackbelt-technology/dashboard-plugin-runtime";
import type { UiModelSelectorProps } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import type { TriggerCategoryDescriptor } from "../shared/automation-types.js";

const { createAutomation, updateAutomation, listTriggerKinds, isGitCapable, listActions } = vi.hoisted(() => ({
  createAutomation: vi.fn(async (_b: any) => ({ ok: true as const })),
  updateAutomation: vi.fn(async (_b: any) => ({ ok: true as const })),
  listTriggerKinds: vi.fn(async (): Promise<TriggerCategoryDescriptor[]> => []),
  isGitCapable: vi.fn(async (_cwd?: string) => false),
  listActions: vi.fn(async (_cwd?: string) => [] as any[]),
}));
vi.mock("../client/api.js", () => ({ createAutomation, updateAutomation, listTriggerKinds, isGitCapable, listActions }));

import { CreateAutomationDialog } from "../client/CreateAutomationDialog.js";

const FLOWS_ACTION = {
  id: "flows.run",
  source: "flows",
  label: "Run a flow",
  available: true,
  payloadSchema: [
    { key: "flow", label: "Flow", type: "enum", options: ["invoicebot:process"] },
    { key: "task", label: "Task", type: "multiline" },
  ],
};

const CATEGORIES_WITH_FILE: TriggerCategoryDescriptor[] = [
  { category: "scheduled", label: "Scheduled", status: "enabled", events: [] },
  {
    category: "file",
    label: "File",
    status: "enabled",
    events: [
      { event: "created", label: "File created", status: "enabled" },
      { event: "changed", label: "File changed", status: "enabled" },
      { event: "deleted", label: "File deleted", status: "enabled" },
    ],
  },
];

function MockModelSelector({ models, onSelect }: UiModelSelectorProps) {
  return (
    <div>
      {(models ?? []).map((m) => {
        const label = `${m.provider}/${m.id}`;
        return (
          <button key={label} data-testid={`model-opt-${label}`} onClick={() => onSelect(label)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Stub editor contributed into `automation-action-editor` for `flows.run`. */
function StubEditor({
  payload,
  onChange,
}: {
  payload: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <button
      data-testid="stub-editor"
      onClick={() => onChange({ ...payload, inputs: { invoice: "${{trigger}}" } })}
    >
      wire invoice
    </button>
  );
}

function wrap(node: React.ReactNode, registry: SlotRegistry) {
  return withUiPrimitiveProvider(
    { "ui:model-selector": MockModelSelector },
    <PluginContextProvider registry={registry} sessions={[]} send={() => {}}>
      <CurrentPluginLayer pluginId="automation">{node}</CurrentPluginLayer>
    </PluginContextProvider>,
  );
}

function seedRoles() {
  act(() => {
    applyPluginConfigUpdate({
      type: "plugin_config_update",
      id: "roles",
      config: {
        roles: { fast: "anthropic/claude-haiku-4-5", coding: "anthropic/claude-sonnet-4-5" },
        models: [{ provider: "anthropic", id: "claude-sonnet-4-5" }],
      },
    });
  });
}

function registryWithEditor(): SlotRegistry {
  const reg = createSlotRegistry();
  reg.addClaim({
    pluginId: "flows",
    priority: 100,
    slot: "automation-action-editor",
    config: { actionId: "flows.run" },
    Component: StubEditor as React.ComponentType<any>,
  });
  return reg;
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  listTriggerKinds.mockResolvedValue([{ category: "scheduled", label: "Scheduled", status: "enabled", events: [] }]);
  isGitCapable.mockResolvedValue(false);
  listActions.mockResolvedValue([
    { id: "core.prompt", source: "core", label: "Prompt", available: true, payloadSchema: [] },
    FLOWS_ACTION,
  ]);
  seedRoles();
});

describe("CreateAutomationDialog — automation-action-editor slot (group 5)", () => {
  async function selectFlowsRun(getByTestId: (id: string) => HTMLElement) {
    await waitFor(() => expect(getByTestId("action-group-flows")).toBeTruthy());
    fireEvent.click(getByTestId("action-group-flows"));
    fireEvent.click(getByTestId("create-action-flows.run"));
    await waitFor(() => expect(getByTestId("action-payload-flow")).toBeTruthy());
  }

  it("renders a contributed editor for a matching action id (additive with ActionPayloadForm)", async () => {
    const { getByTestId } = render(wrap(<CreateAutomationDialog cwd="/repo" onClose={() => {}} />, registryWithEditor()));
    await selectFlowsRun(getByTestId);
    // Both the generic form (flow/task) AND the contributed editor render.
    expect(getByTestId("action-payload-flow")).toBeTruthy();
    expect(getByTestId("stub-editor")).toBeTruthy();
  });

  it("falls back to ActionPayloadForm only when no editor is contributed", async () => {
    // Registry has no automation-action-editor claim.
    const { getByTestId, queryByTestId } = render(
      wrap(<CreateAutomationDialog cwd="/repo" onClose={() => {}} />, createSlotRegistry()),
    );
    await selectFlowsRun(getByTestId);
    expect(getByTestId("action-payload-flow")).toBeTruthy();
    expect(queryByTestId("stub-editor")).toBeNull();
  });

  it("persists payload.inputs written by the contributed editor (coexists with flow/task)", async () => {
    const { getByTestId } = render(wrap(<CreateAutomationDialog cwd="/repo" onClose={() => {}} />, registryWithEditor()));
    fireEvent.change(getByTestId("create-name"), { target: { value: "inv" } });
    await selectFlowsRun(getByTestId);
    fireEvent.change(getByTestId("action-payload-flow"), { target: { value: "invoicebot:process" } });
    fireEvent.click(getByTestId("stub-editor"));
    fireEvent.click(getByTestId("create-submit"));
    await waitFor(() => expect(createAutomation).toHaveBeenCalled());
    expect(createAutomation.mock.calls[0]![0]!.config.action).toEqual({
      kind: "flows.run",
      payload: { flow: "invoicebot:process", task: "", inputs: { invoice: "${{trigger}}" } },
    });
  });
});

describe("CreateAutomationDialog — file trigger config (group 5.3)", () => {
  it("renders the folder field and round-trips to on: { kind: file, path, events, settle }", async () => {
    listTriggerKinds.mockResolvedValue(CATEGORIES_WITH_FILE);
    const { getByTestId } = render(wrap(<CreateAutomationDialog cwd="/repo" onClose={() => {}} />, createSlotRegistry()));
    await waitFor(() => expect(getByTestId("trigger-cat-file")).toBeTruthy());
    fireEvent.click(getByTestId("trigger-cat-file"));
    fireEvent.change(getByTestId("create-name"), { target: { value: "watch-spool" } });
    fireEvent.change(getByTestId("create-file-path"), { target: { value: "/spool/invoices" } });
    fireEvent.click(getByTestId("create-event-created"));
    fireEvent.click(getByTestId("create-submit"));
    await waitFor(() => expect(createAutomation).toHaveBeenCalled());
    expect(createAutomation.mock.calls[0]![0]!.config.on).toEqual({
      kind: "file",
      path: "/spool/invoices",
      events: ["created"],
      settle: "rename-only",
    });
  });

  it("blocks submission when the folder path is empty", async () => {
    listTriggerKinds.mockResolvedValue(CATEGORIES_WITH_FILE);
    const { getByTestId } = render(wrap(<CreateAutomationDialog cwd="/repo" onClose={() => {}} />, createSlotRegistry()));
    await waitFor(() => expect(getByTestId("trigger-cat-file")).toBeTruthy());
    fireEvent.click(getByTestId("trigger-cat-file"));
    fireEvent.change(getByTestId("create-name"), { target: { value: "watch-spool" } });
    fireEvent.click(getByTestId("create-event-created"));
    fireEvent.click(getByTestId("create-submit"));
    await Promise.resolve();
    expect(createAutomation).not.toHaveBeenCalled();
  });
});
