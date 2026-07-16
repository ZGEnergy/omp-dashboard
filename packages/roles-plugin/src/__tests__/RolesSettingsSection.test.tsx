/**
 * Tests for BuiltInRolesSettings — OMP modelRoles via /api/omp-config.
 */

import {
  createSlotRegistry,
  type RegisteredSource,
  SettingsDraftProvider,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import {
  CurrentPluginLayer,
  PluginContextProvider,
} from "@blackbelt-technology/dashboard-plugin-runtime/context";
import { withUiPrimitiveProvider } from "@blackbelt-technology/dashboard-plugin-runtime/test-support";
import type { UiModelSelectorProps } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BuiltInRolesSettings,
  computeDirtyRoles,
  computeEffectiveRoles,
  inferProviderForBareId,
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
    if (url.includes("/api/omp-config/model-roles") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body ?? "{}")) as {
        patch?: Record<string, string | null>;
      };
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            key: "modelRoles",
            type: "record",
            value: { ...roles, ...body.patch },
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

  it("stages a pick and commits via the serialized modelRoles patch", async () => {
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

    const patchCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/api/omp-config/model-roles") && c[1]?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse(String(patchCall?.[1]?.body ?? "{}")) as {
      patch: Record<string, string | null>;
    };
    expect(body.patch).toEqual({ smol: "xai/grok-test" });
  });

  it("keeps a role edit made while commit reload is in flight", async () => {
    let releaseGet: (() => void) | undefined;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    let getCount = 0;
    const roles: Record<string, string> = { default: "xai/grok" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/omp-config/model-roles") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}")) as {
          patch?: Record<string, string | null>;
        };
        Object.assign(roles, body.patch ?? {});
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              key: "modelRoles",
              type: "record",
              value: { ...roles },
              description: "",
            },
          }),
        } as Response;
      }
      if (url.includes("/api/omp-config") && (!init || !init.method || init.method === "GET")) {
        getCount += 1;
        // Second GET is post-commit reload — delay so we can stage another edit.
        if (getCount >= 2) await getGate;
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
                  value: { ...roles },
                  description: "",
                },
              },
            },
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
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

    let commitDone = false;
    const commitPromise = act(async () => {
      await src?.commit();
      commitDone = true;
    });

    // Wait until reload GET is blocked, then stage another role edit.
    await waitFor(() => expect(getCount).toBeGreaterThanOrEqual(2));
    await act(async () => {
      fireEvent.click(getByTestId("roles-row-default"));
    });
    await act(async () => {
      fireEvent.click(getByTestId("roles-model-option-xai/grok-test"));
    });

    releaseGet?.();
    await commitPromise;
    expect(commitDone).toBe(true);

    // Concurrent default edit should still be dirty after reload.
    await waitFor(() => expect(sources.get("plugin:roles")?.isDirty).toBe(true));
  });

  it("has no preset UI", async () => {
    const { queryByTestId } = render(wrap(<BuiltInRolesSettings />, sources));
    await waitFor(() => expect(queryByTestId("roles-settings")).toBeTruthy());
    expect(queryByTestId("roles-preset-save-new")).toBeNull();
  });
});
