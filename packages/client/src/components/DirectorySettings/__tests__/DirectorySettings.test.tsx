import { createSlotRegistry, PluginContextProvider } from "@blackbelt-technology/dashboard-plugin-runtime";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the heavy page components — this suite targets the hosting shell
// (nav + folder-settings-section slot), not the pages themselves.
vi.mock("../InstructionsPage.js", () => ({
  InstructionsPage: () => <div data-testid="page-instructions" />,
}));
vi.mock("../PackagesPage.js", () => ({
  PackagesPage: () => <div data-testid="page-packages" />,
}));
vi.mock("../ResourcesPage.js", () => ({
  ResourcesPage: () => <div data-testid="page-resources" />,
}));

import { DirectorySettings } from "../DirectorySettings.js";

afterEach(() => cleanup());

const noop = () => {};

function renderWithRegistry(
  registry: ReturnType<typeof createSlotRegistry>,
  page: Parameters<typeof DirectorySettings>[0]["page"],
) {
  return render(
    <PluginContextProvider registry={registry}>
      <DirectorySettings cwd="/repo/project" page={page} onBack={noop} onViewFile={noop} />
    </PluginContextProvider>,
  );
}

describe("DirectorySettings folder-settings-section hosting", () => {
  it("renders a claimed section with the folder's cwd on the plugins page", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "flows",
      priority: 100,
      slot: "folder-settings-section",
      Component: ({ cwd }: { cwd?: string }) => <div data-testid="flows-section">{cwd}</div>,
    });
    renderWithRegistry(registry, "plugins");
    expect(screen.getByTestId("flows-section").textContent).toBe("/repo/project");
  });

  it("shows the Plugins nav item only when a claim exists", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "flows",
      priority: 100,
      slot: "folder-settings-section",
      Component: () => <div />,
    });
    renderWithRegistry(registry, "instructions");
    expect(screen.getByTestId("directory-settings-nav-plugins")).toBeTruthy();
  });

  it("renders exactly as before when no claims exist (no Plugins nav item)", () => {
    renderWithRegistry(createSlotRegistry(), "instructions");
    expect(screen.queryByTestId("directory-settings-nav-plugins")).toBeNull();
    expect(screen.getByTestId("page-instructions")).toBeTruthy();
  });

  it("orders multiple claims by registry priority (ascending, matching compareClaims)", () => {
    const registry = createSlotRegistry();
    registry.addClaim({
      pluginId: "second",
      priority: 200,
      slot: "folder-settings-section",
      Component: () => <div data-testid="claim-second" />,
    });
    registry.addClaim({
      pluginId: "first",
      priority: 10,
      slot: "folder-settings-section",
      Component: () => <div data-testid="claim-first" />,
    });
    renderWithRegistry(registry, "plugins");
    const content = screen.getByTestId("directory-settings-content");
    const nodes = content.querySelectorAll('[data-testid^="claim-"]');
    expect(Array.from(nodes).map((n) => n.getAttribute("data-testid"))).toEqual([
      "claim-first",
      "claim-second",
    ]);
  });
});
