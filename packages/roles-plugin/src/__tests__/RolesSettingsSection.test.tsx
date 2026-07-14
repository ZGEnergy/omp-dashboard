/**
 * Tests for BuiltInRolesSettings — OMP modelRoles via /api/omp-config.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import {
import {
  PluginContextProvider,
  CurrentPluginLayer,
} from "@blackbelt-technology/dashboard-plugin-runtime/context";
  SettingsDraftProvider,
  type RegisteredSource,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import { withUiPrimitiveProvider } from "@blackbelt-technology/dashboard-plugin-runtime/test-support";
import type { UiModelSelectorProps } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import {
  BuiltInRolesSettings,
  inferProviderForBareId,
  computeEffectiveRoles,
  computeDirtyRoles,
  OMP_BUILTIN_ROLES,
} from "../RolesSettingsSection.js";

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
      <button
        data-testid="roles-model-option-xai/grok-test"
        onClick={() => onSelect("xai/grok-test")}
      >
        xai/grok-test
      </button>
    </div>
  );
}

function wrap(
  children: React.ReactNode,
  sources?: Map<string, RegisteredSource>,
) {
  const draft = {
    upsert: (id: string, s: RegisteredSource) => {
      sources?.set(id, s);
    },
    remove: (id: string) => {
      sources?.delete(id);
    },
  };
  return withUiPrimitiveProvider(
    { "ui:model-selector": MockModelSelector },
    <PluginContextProvider
      registry={createSlotRegistry()}
      sessions={[{ id: "sess-live", cwd: "/x", status: "idle" } as never]}
      send={() => {}}
    >
      <CurrentPluginLayer pluginId="roles">
        <SettingsDraftProvider registry={draft}>{children}</SettingsDraftProvider>
      </CurrentPluginLayer>
    </PluginContextProvider>,
  );
}

function mockFetchRoles(roles: Record<string, string>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/omp-config") && (!init || !init.method || init.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            agentDir: "/tmp/agent",
            settings: {
              modelRoles: {
                key: "modelRoles",
                type: "record",
                value: roles,
                description: "",
              },
            },
          },
        }),
      } as Response;
    }
    if (url.includes("/api/omp-config") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body ?? "{}")) as {
        key?: string;
        value?: Record<string, string>;
      };
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            key: body.key ?? "modelRoles",
            type: "record",
            value: body.value ?? {},
            description: "",
          },
        }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
}

describe("helpers", () => {
  it("inferProviderForBareId leaves provider/id alone", () => {
    expect(inferProviderForBareId("a/b", [])).toBe("a/b");
  });

  it("computeEffectiveRoles / computeDirtyRoles", () => {
    expect(computeEffectiveRoles({ a: "1" }, { b: "2" })).toEqual({ a: "1", b: "2" });
    expect(computeDirtyRoles({ a: "1" }, { a: "1", b: "2" })).toEqual(["b"]);
  });

  it("exports OMP builtin roles", () => {
    expect(OMP_BUILTIN_ROLES).toContain("default");
    expect(OMP_BUILTIN_ROLES).toContain("smol");
  });
});

describe("BuiltInRolesSettings", () => {
  let sources: Map<string, RegisteredSource>;

  beforeEach(() => {
    sources = new Map();
    vi.stubGlobal("fetch", mockFetchRoles({ default: "xai/grok", smol: "openrouter/mini" }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders OMP roles from /api/omp-config", async () => {
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />, sources));
    await waitFor(() => {
      expect(getByTestId("roles-row-default")).toBeTruthy();
      expect(getByTestId("roles-row-smol")).toBeTruthy();
    });
  });

  it("stages a pick and commits via setOmpConfig modelRoles", async () => {
    const fetchMock = mockFetchRoles({ default: "xai/grok" });
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId } = render(wrap(<BuiltInRolesSettings />, sources));
    await waitFor(() => expect(getByTestId("roles-row-smol")).toBeTruthy());

    await act(async () => {
      fireEvent.click(getByTestId("roles-row-smol"));
    });
    await act(async () => {
      fireEvent.click(getByTestId("roles-model-option-xai/grok-test"));
    });

    const src = sources.get("plugin:roles");
    expect(src?.isDirty).toBe(true);
    await act(async () => {
      await src?.commit();
    });

    const putCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/api/omp-config") && c[1]?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse(String(putCall?.[1]?.body ?? "{}")) as {
      key: string;
      value: Record<string, string>;
    };
    expect(body.key).toBe("modelRoles");
    expect(body.value.smol).toBe("xai/grok-test");
    expect(body.value.default).toBe("xai/grok");
  });

  it("has no preset UI", async () => {
    const { queryByTestId } = render(wrap(<BuiltInRolesSettings />, sources));
    await waitFor(() => expect(queryByTestId("roles-settings")).toBeTruthy());
    expect(queryByTestId("roles-preset-save-new")).toBeNull();
  });
});
