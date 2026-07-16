import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import {
  SettingsDraftProvider,
  type RegisteredSource,
} from "@blackbelt-technology/dashboard-plugin-runtime";

const api = {
  fetchOmpConfig: vi.fn(),
  setOmpConfig: vi.fn(),
  resetOmpConfig: vi.fn(),
};

vi.mock("../../lib/omp-config-api.js", () => ({
  fetchOmpConfig: (...args: unknown[]) => api.fetchOmpConfig(...args),
  setOmpConfig: (...args: unknown[]) => api.setOmpConfig(...args),
  resetOmpConfig: (...args: unknown[]) => api.resetOmpConfig(...args),
  OmpConfigApiError: class OmpConfigApiError extends Error {
    status = 500;
  },
}));

import { OmpSettingsPage } from "../OmpSettingsPage.js";

const snapshot = () => ({
  agentDir: "/tmp/omp-agent",
  ompVersion: "16.5.0",
  ompBin: "/home/joe/.bun/bin/omp",
  settings: {
    defaultThinkingLevel: {
      key: "defaultThinkingLevel",
      value: "medium",
      type: "enum",
      description: "Default thinking level",
    },
    enabled: {
      key: "enabled",
      value: false,
      type: "boolean",
      description: "Enable the agent",
    },
    retries: {
      key: "retries",
      value: 2,
      type: "number",
      description: "Maximum retries",
    },
    theme: {
      key: "theme",
      value: "dark",
      type: "string",
      description: "Color theme",
    },
    "advisor.syncBacklog": {
      key: "advisor.syncBacklog",
      value: "off",
      type: "enum",
      description: "Advisor backlog sync",
      values: ["off", "1", "3"],
    },
    modelRoles: {
      key: "modelRoles",
      value: { default: "model-id" },
      type: "record",
      description: "Model role assignments",
    },
  },
});

function renderWithDraft() {
  const sources = new Map<string, RegisteredSource>();
  const registry = {
    upsert: (id: string, source: RegisteredSource) => sources.set(id, source),
    remove: (id: string) => sources.delete(id),
  };
  render(
    <SettingsDraftProvider registry={registry}>
      <OmpSettingsPage />
    </SettingsDraftProvider>,
  );
  return sources;
}

beforeEach(() => {
  api.fetchOmpConfig.mockReset().mockResolvedValue(snapshot());
  api.setOmpConfig.mockReset().mockImplementation(async (key: string, value: unknown) => ({
    ...snapshot().settings[key as keyof ReturnType<typeof snapshot>["settings"]],
    key,
    value,
  }));
  api.resetOmpConfig.mockReset().mockImplementation(async (key: string) => snapshot().settings[key as keyof ReturnType<typeof snapshot>["settings"]]);
});

afterEach(cleanup);

describe("OmpSettingsPage", () => {
  it("hides the modelRoles row", async () => {
    renderWithDraft();

    await waitFor(() => expect(screen.getByTestId("omp-setting-row-enabled")).toBeTruthy());
    expect(screen.queryByTestId("omp-setting-row-modelRoles")).toBeNull();
  });

  it("renders boolean checkbox, number input, and known enum select controls", async () => {
    renderWithDraft();

    await waitFor(() => expect(screen.getByTestId("omp-setting-control-enabled")).toBeTruthy());
    expect((screen.getByTestId("omp-setting-control-enabled") as HTMLInputElement).type).toBe("checkbox");
    expect((screen.getByTestId("omp-setting-control-retries") as HTMLInputElement).type).toBe("number");
    expect(screen.getByTestId("omp-setting-control-defaultThinkingLevel").tagName).toBe("SELECT");
    expect(screen.getByTestId("omp-setting-control-defaultThinkingLevel").textContent).toContain("medium");
  });

  it("filters rows by key and description", async () => {
    renderWithDraft();
    await waitFor(() => expect(screen.getByTestId("omp-setting-row-theme")).toBeTruthy());

    fireEvent.change(screen.getByTestId("omp-settings-search"), { target: { value: "backlog" } });
    expect(screen.getByTestId("omp-setting-row-advisor.syncBacklog")).toBeTruthy();
    expect(screen.queryByTestId("omp-setting-row-theme")).toBeNull();
    expect(screen.queryByTestId("omp-setting-row-enabled")).toBeNull();
  });

  it("commits only dirty keys", async () => {
    const sources = renderWithDraft();
    await waitFor(() => expect(screen.getByTestId("omp-setting-control-enabled")).toBeTruthy());

    fireEvent.click(screen.getByTestId("omp-setting-control-enabled"));
    await waitFor(() => expect(sources.get("omp-config")?.isDirty).toBe(true));
    await sources.get("omp-config")!.commit();

    expect(api.setOmpConfig).toHaveBeenCalledTimes(1);
    expect(api.setOmpConfig).toHaveBeenCalledWith("enabled", true);
  });

  it("per-row Reset removes only that row's draft", async () => {
    const sources = renderWithDraft();
    await waitFor(() => expect(screen.getByTestId("omp-setting-control-enabled")).toBeTruthy());

    fireEvent.click(screen.getByTestId("omp-setting-control-enabled"));
    fireEvent.change(screen.getByTestId("omp-setting-control-theme"), { target: { value: "light" } });
    await waitFor(() => expect(sources.get("omp-config")?.isDirty).toBe(true));

    fireEvent.click(within(screen.getByTestId("omp-setting-row-enabled")).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(api.resetOmpConfig).toHaveBeenCalledWith("enabled"));
    expect(sources.get("omp-config")?.isDirty).toBe(true);
    expect((screen.getByTestId("omp-setting-control-theme") as HTMLInputElement).value).toBe("light");
  });

  it("surfaces a failed save on the row and keeps its draft dirty", async () => {
    const sources = renderWithDraft();
    await waitFor(() => expect(screen.getByTestId("omp-setting-control-enabled")).toBeTruthy());
    api.setOmpConfig.mockRejectedValueOnce(new Error("permission denied"));

    fireEvent.click(screen.getByTestId("omp-setting-control-enabled"));
    await waitFor(() => expect(sources.get("omp-config")?.isDirty).toBe(true));
    await expect(sources.get("omp-config")!.commit()).rejects.toThrow("Failed to save OMP settings");

    await waitFor(() => expect(screen.getByTestId("omp-setting-error-enabled").textContent).toContain("permission denied"));
    expect(sources.get("omp-config")?.isDirty).toBe(true);
    expect((screen.getByTestId("omp-setting-control-enabled") as HTMLInputElement).checked).toBe(true);
  });

  it("rejects commit when any of several dirty keys fails", async () => {
    const sources = renderWithDraft();
    await waitFor(() => expect(screen.getByTestId("omp-setting-control-enabled")).toBeTruthy());

    api.setOmpConfig.mockImplementation(async (key: string, value: unknown) => {
      if (key === "theme") throw new Error("theme blocked");
      return {
        ...snapshot().settings[key as keyof ReturnType<typeof snapshot>["settings"]],
        key,
        value,
      };
    });

    fireEvent.click(screen.getByTestId("omp-setting-control-enabled"));
    fireEvent.change(screen.getByTestId("omp-setting-control-theme"), { target: { value: "light" } });
    await waitFor(() => expect(sources.get("omp-config")?.isDirty).toBe(true));

    await expect(sources.get("omp-config")!.commit()).rejects.toThrow(/Failed to save/);

    await waitFor(() =>
      expect(screen.getByTestId("omp-setting-error-theme").textContent).toContain("theme blocked"),
    );
    expect(sources.get("omp-config")?.isDirty).toBe(true);
    expect((screen.getByTestId("omp-setting-control-theme") as HTMLInputElement).value).toBe("light");
  });

  it("preserves a draft edit made while a save is in flight", async () => {
    const sources = renderWithDraft();
    await waitFor(() => expect(screen.getByTestId("omp-setting-control-theme")).toBeTruthy());

    let releaseSave: (() => void) | undefined;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    api.setOmpConfig.mockImplementation(async (key: string, value: unknown) => {
      await saveGate;
      return {
        ...snapshot().settings[key as keyof ReturnType<typeof snapshot>["settings"]],
        key,
        value,
      };
    });

    fireEvent.change(screen.getByTestId("omp-setting-control-theme"), { target: { value: "light" } });
    await waitFor(() => expect(sources.get("omp-config")?.isDirty).toBe(true));

    const commitPromise = sources.get("omp-config")!.commit();
    // Concurrent edit while first value is still writing.
    fireEvent.change(screen.getByTestId("omp-setting-control-theme"), { target: { value: "solarized" } });
    releaseSave?.();
    await commitPromise;

    await waitFor(() =>
      expect((screen.getByTestId("omp-setting-control-theme") as HTMLInputElement).value).toBe(
        "solarized",
      ),
    );
    expect(sources.get("omp-config")?.isDirty).toBe(true);
  });
});
