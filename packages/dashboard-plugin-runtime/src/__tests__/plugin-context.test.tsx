import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import {
  PluginContextProvider,
  CurrentPluginLayer,
  usePluginConfig,
  useAllSessions,
  usePluginLogger,
  applyPluginConfigUpdate,
  initPluginConfigs,
} from "../plugin-context.js";
import { createSlotRegistry } from "../slot-registry.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

// Helper: render a component that calls a hook, capture the result
function renderHook<T>(hookFn: () => T, wrapper: React.FC<{ children: React.ReactNode }>) {
  let result: T;
  function TestComponent() {
    result = hookFn();
    return null;
  }
  render(
    React.createElement(wrapper, { children: React.createElement(TestComponent) }),
  );
  return { get: () => result! };
}

describe("usePluginConfig", () => {
  it("throws when called outside any plugin context", () => {
    // Render without PluginContextProvider
    let error: Error | null = null;
    function Comp() {
      try {
        usePluginConfig();
      } catch (e) {
        error = e as Error;
      }
      return null;
    }
    // We need PluginContextProvider but NOT CurrentPluginContext layer
    render(
      <PluginContextProvider registry={createSlotRegistry()}>
        <Comp />
      </PluginContextProvider>,
    );
    expect(error).not.toBeNull();
    expect(error!.message).toContain("usePluginConfig must be called from a plugin slot contribution");
  });

  it("throws when rendered outside PluginContextProvider", () => {
    let error: Error | null = null;
    function Comp() {
      try {
        usePluginConfig();
      } catch (e) {
        error = e as Error;
      }
      return null;
    }
    render(
      <CurrentPluginLayer pluginId="demo">
        <Comp />
      </CurrentPluginLayer>,
    );
    expect(error).not.toBeNull();
    expect(error!.message).toContain("PluginContextProvider");
  });

  it("returns plugin's own config from CurrentPluginContext", () => {
    const registry = createSlotRegistry();
    let config: Record<string, unknown> | null = null;

    function Comp() {
      config = usePluginConfig<Record<string, unknown>>() as Record<string, unknown>;
      return null;
    }

    // Initialize config before render
    act(() => {
      applyPluginConfigUpdate({ type: "plugin_config_update", id: "demo", config: { foo: 42 } });
    });

    render(
      <PluginContextProvider registry={registry}>
        <CurrentPluginLayer pluginId="demo">
          <Comp />
        </CurrentPluginLayer>
      </PluginContextProvider>,
    );

    expect(config).toBeTruthy();
    expect((config as unknown as Record<string, unknown>).foo).toBe(42);
  });

  it("re-renders on plugin_config_update", async () => {
    const registry = createSlotRegistry();
    let renderCount = 0;
    let lastConfig: Record<string, unknown> = {};

    function Comp() {
      renderCount++;
      lastConfig = usePluginConfig<Record<string, unknown>>();
      return null;
    }

    render(
      <PluginContextProvider registry={registry}>
        <CurrentPluginLayer pluginId="live-plugin">
          <Comp />
        </CurrentPluginLayer>
      </PluginContextProvider>,
    );

    const countBefore = renderCount;

    await act(async () => {
      applyPluginConfigUpdate({
        type: "plugin_config_update",
        id: "live-plugin",
        config: { bar: 99 },
      });
    });

    expect(renderCount).toBeGreaterThan(countBefore);
    expect(lastConfig.bar).toBe(99);
  });

  it("hydrates from initPluginConfigs and notifies already-mounted subscribers (reload path)", async () => {
    const registry = createSlotRegistry();
    let lastConfig: Record<string, unknown> = {};

    function Comp() {
      lastConfig = usePluginConfig<Record<string, unknown>>();
      return null;
    }

    // Component mounts BEFORE the /api/config seed arrives (post-render effect).
    render(
      <PluginContextProvider registry={registry}>
        <CurrentPluginLayer pluginId="hydrate-plugin">
          <Comp />
        </CurrentPluginLayer>
      </PluginContextProvider>,
    );
    expect(lastConfig.editFlow).toBeUndefined();

    // Simulate the boot /api/config fetch seeding the persisted plugins block.
    await act(async () => {
      initPluginConfigs({ "hydrate-plugin": { enabled: true, editFlow: true } });
    });

    expect(lastConfig.editFlow).toBe(true);
    expect(lastConfig.enabled).toBe(true);
  });
});

describe("usePluginLogger", () => {
  it("emits log with [plugin:<id>] prefix", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    function Comp() {
      const logger = usePluginLogger();
      logger.warn("test-message");
      return null;
    }
    render(
      <PluginContextProvider registry={createSlotRegistry()}>
        <CurrentPluginLayer pluginId="my-plugin">
          <Comp />
        </CurrentPluginLayer>
      </PluginContextProvider>,
    );
    expect(warnSpy).toHaveBeenCalledWith("[plugin:my-plugin]", "test-message");
    warnSpy.mockRestore();
  });
});

describe("useAllSessions", () => {
  it("returns the sessions array passed to the provider", () => {
    const sessions: DashboardSession[] = [
      { id: "s1", cwd: "/", source: "tui", status: "active", startedAt: 0 },
    ];
    let result: DashboardSession[] = [];
    function Comp() {
      result = useAllSessions();
      return null;
    }
    render(
      <PluginContextProvider registry={createSlotRegistry()} sessions={sessions}>
        <Comp />
      </PluginContextProvider>,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });
});
