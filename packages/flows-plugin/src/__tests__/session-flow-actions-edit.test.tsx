/**
 * SessionFlowActions edit-mode gating + New/Edit launcher.
 * The New/Edit button shows only when editMode is on, and selecting a flow (or
 * "+ New flow") invokes onEditFlow(name|undefined) so the claim can send
 * `/skill:edit-flow [name]`. See change: rework-flows-plugin-for-new-pi-flows.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  UiPrimitiveProvider,
  createUiPrimitiveRegistry,
  registerUiPrimitive,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import type { FlowInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { SessionFlowActions } from "../client/SessionFlowActions.js";

const registry = createUiPrimitiveRegistry();
registerUiPrimitive(registry, UI_PRIMITIVE_KEYS.confirmDialog, (() => null) as never);
// Stub SearchableSelectDialog: render each option as a button that selects it.
registerUiPrimitive(
  registry,
  UI_PRIMITIVE_KEYS.searchableSelectDialog,
  (({ options, onSelect }: { options: Array<{ value: string; label: string }>; onSelect: (v: string) => void }) => (
    <div data-testid="picker">
      {options.map((o) => (
        <button key={o.value} onClick={() => onSelect(o.value)}>{o.label}</button>
      ))}
    </div>
  )) as never,
);

const flows: FlowInfo[] = [{ name: "invoice-research" } as FlowInfo];

function renderActions(props: Partial<React.ComponentProps<typeof SessionFlowActions>>) {
  return render(
    <UiPrimitiveProvider value={registry}>
      <SessionFlowActions
        flows={flows}
        editMode={false}
        onFlowAction={() => {}}
        onEditFlow={() => {}}
        {...props}
      />
    </UiPrimitiveProvider>,
  );
}

afterEach(() => cleanup());

describe("SessionFlowActions edit mode", () => {
  it("hides New / Edit when edit mode is off", () => {
    const { queryByTestId } = renderActions({ editMode: false });
    expect(queryByTestId("flows-new-edit-button")).toBeNull();
  });

  it("shows New / Edit when edit mode is on", () => {
    const { getByTestId } = renderActions({ editMode: true });
    expect(getByTestId("flows-new-edit-button")).toBeTruthy();
  });

  it("selecting an existing flow calls onEditFlow(name)", () => {
    const onEditFlow = vi.fn();
    const { getByTestId, getByText } = renderActions({ editMode: true, onEditFlow });
    fireEvent.click(getByTestId("flows-new-edit-button"));
    fireEvent.click(getByText("invoice-research"));
    expect(onEditFlow).toHaveBeenCalledWith("invoice-research");
  });

  it("selecting + New flow calls onEditFlow(undefined)", () => {
    const onEditFlow = vi.fn();
    const { getByTestId, getByText } = renderActions({ editMode: true, onEditFlow });
    fireEvent.click(getByTestId("flows-new-edit-button"));
    fireEvent.click(getByText("+ New flow"));
    expect(onEditFlow).toHaveBeenCalledWith(undefined);
  });
});
