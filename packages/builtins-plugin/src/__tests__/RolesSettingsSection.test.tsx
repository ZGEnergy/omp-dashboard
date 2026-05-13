/**
 * Tests for BuiltInRolesSettings — see change fix-pi-flows-end-to-end (Group 5).
 *
 * Roles + models are GLOBAL in pi-flows / pi-coding-agent; the component
 * reads them via `usePluginConfig<BuiltinsConfig>()` after the WS layer
 * routes `roles_list` / `models_list` through `applyPluginConfigUpdate`.
 *
 * Covers:
 *   - Empty state when plugin config has no roles.
 *   - Renders preset row + role grid when config is populated.
 *   - Clicking a role + selecting a model dispatches `role_set` over the
 *     existing protocol (no new WS messages).
 *   - Preset save/load/delete dispatch the matching existing messages.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import {
  PluginContextProvider,
  CurrentPluginLayer,
  applyPluginConfigUpdate,
} from "@blackbelt-technology/dashboard-plugin-runtime/context";
import { createSlotRegistry } from "@blackbelt-technology/dashboard-plugin-runtime";
import { withUiPrimitiveProvider } from "@blackbelt-technology/dashboard-plugin-runtime/test-support";
import type { UiModelSelectorProps } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import {
  BuiltInRolesSettings,
  inferProviderForBareId,
} from "../RolesSettingsSection.js";

/**
 * Mock `ui:model-selector` impl: renders one button per model with a
 * data-testid that matches the test expectations of the old inline picker
 * (`roles-model-option-<provider>/<id>`). onSelect fires with the full label.
 */
function MockModelSelector({ models, onSelect }: UiModelSelectorProps) {
  return (
    <div data-testid="mock-model-selector">
      {(models ?? []).map((m) => {
        const label = `${m.provider}/${m.id}`;
        return (
          <button
            key={label}
            data-testid={`roles-model-option-${label}`}
            onClick={() => onSelect(label)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface SendCapture {
  messages: unknown[];
  fn: (m: unknown) => void;
}

function makeSend(): SendCapture {
  const messages: unknown[] = [];
  return { messages, fn: (m: unknown) => messages.push(m) };
}

function wrap(children: React.ReactNode, send?: (m: unknown) => void) {
  return withUiPrimitiveProvider(
    { "ui:model-selector": MockModelSelector },
    <PluginContextProvider
      registry={createSlotRegistry()}
      sessions={[{ id: "sess-live", cwd: "/x", status: "idle" } as any]}
      send={send}
    >
      <CurrentPluginLayer pluginId="builtins">{children}</CurrentPluginLayer>
    </PluginContextProvider>,
  );
}

const sampleConfig = {
  roles: { architect: "anthropic/claude-3-7-sonnet", planner: "openai/gpt-4o" },
  presets: [
    { name: "default", roles: { architect: "anthropic/claude-3-7-sonnet" } },
    { name: "cheap", roles: { architect: "openai/gpt-4o-mini" } },
  ],
  activePreset: "default" as string | null,
  models: [
    { provider: "anthropic", id: "claude-3-7-sonnet" },
    { provider: "openai", id: "gpt-4o" },
    { provider: "openai", id: "gpt-4o-mini" },
  ],
};

function seedConfig(cfg: Record<string, unknown>) {
  act(() => {
    applyPluginConfigUpdate({
      type: "plugin_config_update",
      id: "builtins",
      config: cfg,
    });
  });
}

describe("BuiltInRolesSettings", () => {
  beforeEach(() => {
    seedConfig({});
  });
  afterEach(() => {
    cleanup();
    seedConfig({});
  });

  it("renders an empty hint when plugin config has no roles", () => {
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />));
    expect(getByTestId("roles-settings-empty").textContent).toContain("pi-flows");
  });

  it("renders preset row + role grid when config is populated", () => {
    seedConfig(sampleConfig);
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />));
    expect(getByTestId("roles-settings")).toBeTruthy();
    expect(getByTestId("roles-preset-load-default")).toBeTruthy();
    expect(getByTestId("roles-preset-load-cheap")).toBeTruthy();
    expect(getByTestId("roles-row-architect")).toBeTruthy();
    expect(getByTestId("roles-row-planner")).toBeTruthy();
  });

  it("clicking a role opens the model picker; selecting a model dispatches role_set", () => {
    const send = makeSend();
    seedConfig(sampleConfig);
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />, send.fn));
    fireEvent.click(getByTestId("roles-row-architect"));
    expect(getByTestId("roles-model-picker")).toBeTruthy();
    fireEvent.click(getByTestId("roles-model-option-openai/gpt-4o"));
    expect(send.messages).toEqual([
      {
        type: "role_set",
        sessionId: "sess-live",
        role: "architect",
        provider: "openai",
        // modelId is now the FULL `provider/id` label, not the bare id.
        // This is what fixes the provider-info-loss bug downstream.
        modelId: "openai/gpt-4o",
      },
    ]);
  });

  describe("inferProviderForBareId (read-time migration)", () => {
    const liveModels = [
      { provider: "proxy", id: "deepseek-v4-flash" },
      { provider: "anthropic", id: "claude-3-7-sonnet" },
    ];

    it("passes through slash-form values unchanged", () => {
      expect(
        inferProviderForBareId("anthropic/claude-3-7-sonnet", liveModels),
      ).toBe("anthropic/claude-3-7-sonnet");
    });

    it("synthesises provider prefix when a live model id matches", () => {
      expect(inferProviderForBareId("deepseek-v4-flash", liveModels)).toBe(
        "proxy/deepseek-v4-flash",
      );
    });

    it("falls back to bare value when no live model matches", () => {
      expect(
        inferProviderForBareId("some-removed-model", liveModels),
      ).toBe("some-removed-model");
    });

    it("returns input unchanged when models list is empty", () => {
      expect(inferProviderForBareId("deepseek-v4-flash", [])).toBe(
        "deepseek-v4-flash",
      );
    });

    it("handles empty stored value", () => {
      expect(inferProviderForBareId("", liveModels)).toBe("");
    });
  });

  it("renders legacy bare-id role values with synthesised provider label", () => {
    seedConfig({
      roles: { planning: "deepseek-v4-flash" },
      models: [{ provider: "proxy", id: "deepseek-v4-flash" }],
    });
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />));
    const pill = getByTestId("roles-row-planning");
    // Pill title carries the full migrated label; pill body shows the short tail.
    expect(pill.getAttribute("title")).toBe("proxy/deepseek-v4-flash");
  });

  it("renders bare-id role values verbatim when no live match", () => {
    seedConfig({
      roles: { planning: "deepseek-v4-flash" },
      models: [],
    });
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />));
    const pill = getByTestId("roles-row-planning");
    expect(pill.getAttribute("title")).toBe("deepseek-v4-flash");
  });

  it("preset load dispatches role_preset_load with global session placeholder", () => {
    const send = makeSend();
    seedConfig(sampleConfig);
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />, send.fn));
    fireEvent.click(getByTestId("roles-preset-load-cheap"));
    expect(send.messages).toEqual([
      { type: "role_preset_load", sessionId: "sess-live", presetName: "cheap" },
    ]);
  });

  it("preset delete dispatches role_preset_delete with global session placeholder", () => {
    const send = makeSend();
    seedConfig(sampleConfig);
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />, send.fn));
    fireEvent.click(getByTestId("roles-preset-delete-cheap"));
    expect(send.messages).toEqual([
      { type: "role_preset_delete", sessionId: "sess-live", presetName: "cheap" },
    ]);
  });

  it("preset save dispatches role_preset_save with global session placeholder", () => {
    const send = makeSend();
    seedConfig(sampleConfig);
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />, send.fn));
    fireEvent.click(getByTestId("roles-preset-save-new"));
    const input = getByTestId("roles-preset-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "experiment" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send.messages).toEqual([
      { type: "role_preset_save", sessionId: "sess-live", presetName: "experiment" },
    ]);
  });
});
