import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PluginContextProvider } from "../plugin-context.js";
import {
  SessionCardBadgeSlot,
  SettingsSectionSlot,
  ToolRendererSlot,
} from "../slot-consumers.js";
import { createSlotRegistry } from "../slot-registry.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function makeSession(id = "s1"): DashboardSession {
  return { id, cwd: "/repo", source: "tui", status: "active", startedAt: 0 };
}

// ── Error boundary tests ──────────────────────────────────────────────────────

describe("SessionCardBadgeSlot error boundary", () => {
  it("three plugins: second throws, first and third still render", () => {
    const registry = createSlotRegistry();

    registry.addClaim({
      pluginId: "a-plugin",
      priority: 100,
      slot: "session-card-badge",
      Component: () => <span data-testid="badge-a">A</span>,
    });
    registry.addClaim({
      pluginId: "b-plugin",
      priority: 200,
      slot: "session-card-badge",
      Component: () => { throw new Error("b-plugin crash"); },
    });
    registry.addClaim({
      pluginId: "c-plugin",
      priority: 300,
      slot: "session-card-badge",
      Component: () => <span data-testid="badge-c">C</span>,
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <PluginContextProvider registry={registry}>
        <SessionCardBadgeSlot session={makeSession()} />
      </PluginContextProvider>,
    );

    expect(screen.getByTestId("badge-a")).toBeDefined();
    expect(screen.queryByTestId("badge-b")).toBeNull();
    expect(screen.getByTestId("badge-c")).toBeDefined();

    // Error was logged with plugin id and slot id
    const errorCalls = consoleSpy.mock.calls.map(c => c.join(" "));
    expect(errorCalls.some(s => s.includes("b-plugin") && s.includes("session-card-badge"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("slot with one throwing plugin renders nothing without propagating to parent", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "crash-plugin",
      priority: 100,
      slot: "session-card-badge",
      Component: () => { throw new Error("crash"); },
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw
    expect(() =>
      render(
        <PluginContextProvider registry={registry}>
          <div data-testid="parent">
            <SessionCardBadgeSlot session={makeSession()} />
          </div>
        </PluginContextProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId("parent")).toBeDefined();
    consoleSpy.mockRestore();
  });
});

// ── SettingsSectionSlot tab filtering ────────────────────────────────────────

describe("SettingsSectionSlot", () => {
  it("filters claims by tab", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "security-plugin",
      priority: 100,
      slot: "settings-section",
      tab: "security",
      Component: () => <div data-testid="security-section">Security</div>,
    });
    registry.addClaim({
      pluginId: "general-plugin",
      priority: 100,
      slot: "settings-section",
      tab: "general",
      Component: () => <div data-testid="general-section">General</div>,
    });

    render(
      <PluginContextProvider registry={registry}>
        <SettingsSectionSlot tab="security" />
      </PluginContextProvider>,
    );

    expect(screen.getByTestId("security-section")).toBeDefined();
    expect(screen.queryByTestId("general-section")).toBeNull();
  });

  it("claim without tab defaults to general", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "no-tab-plugin",
      priority: 100,
      slot: "settings-section",
      // no tab field → defaults to "general"
      Component: () => <div data-testid="no-tab-section">NoTab</div>,
    });

    render(
      <PluginContextProvider registry={registry}>
        <SettingsSectionSlot tab="general" />
      </PluginContextProvider>,
    );

    expect(screen.getByTestId("no-tab-section")).toBeDefined();
  });

  it("renders nothing when no claims match tab", () => {
    const registry = createSlotRegistry();
    const { container } = render(
      <PluginContextProvider registry={registry}>
        <SettingsSectionSlot tab="providers" />
      </PluginContextProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ── ToolRendererSlot ─────────────────────────────────────────────────────────

describe("ToolRendererSlot", () => {
  it("uses plugin component when toolName matches", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "demo",
      priority: 100,
      slot: "tool-renderer",
      toolName: "DashboardDemo",
      Component: () => <div data-testid="demo-renderer">Demo</div>,
    });

    render(
      <PluginContextProvider registry={registry}>
        <ToolRendererSlot toolName="DashboardDemo" toolInput={{}} sessionId="s1" />
      </PluginContextProvider>,
    );

    expect(screen.getByTestId("demo-renderer")).toBeDefined();
  });

  it("falls through to FallbackComponent when no claim matches", () => {
    const registry = createSlotRegistry();
    const Fallback = () => <div data-testid="fallback">Generic</div>;

    render(
      <PluginContextProvider registry={registry}>
        <ToolRendererSlot
          toolName="UnknownTool"
          toolInput={{}}
          sessionId="s1"
          FallbackComponent={Fallback}
        />
      </PluginContextProvider>,
    );

    expect(screen.getByTestId("fallback")).toBeDefined();
  });
});

// ── Outside provider: graceful degradation ───────────────────────────────────

describe("slot consumer outside PluginContextProvider", () => {
  it("renders nothing (no throw) when outside provider", () => {
    // Slot consumers gracefully render nothing when no provider is present
    // so existing component tests don't need wrapping.
    const { container } = render(<SessionCardBadgeSlot session={makeSession()} />);
    expect(container.firstChild).toBeNull();
  });
});
