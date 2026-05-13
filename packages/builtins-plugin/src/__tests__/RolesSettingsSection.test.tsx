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
import { BuiltInRolesSettings } from "../RolesSettingsSection.js";

interface SendCapture {
  messages: unknown[];
  fn: (m: unknown) => void;
}

function makeSend(): SendCapture {
  const messages: unknown[] = [];
  return { messages, fn: (m: unknown) => messages.push(m) };
}

function wrap(children: React.ReactNode, send?: (m: unknown) => void) {
  return (
    <PluginContextProvider
      registry={createSlotRegistry()}
      sessions={[{ id: "sess-live", cwd: "/x", status: "idle" } as any]}
      send={send}
    >
      <CurrentPluginLayer pluginId="builtins">{children}</CurrentPluginLayer>
    </PluginContextProvider>
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
        modelId: "gpt-4o",
      },
    ]);
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
