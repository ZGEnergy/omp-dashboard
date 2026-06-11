/**
 * Tests for OpenSpecProfileSection — change: add-openspec-profile-settings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const api = {
  saveOpenSpecConfig: vi.fn<(...a: any[]) => Promise<void>>(async () => {}),
  runOpenSpecUpdate: vi.fn<(...a: any[]) => Promise<any[]>>(async () => []),
  fetchUpdateStatus: vi.fn<(...a: any[]) => Promise<any[]>>(async () => [
    { cwd: "/proj/stale", status: "needs-update" },
    { cwd: "/proj/fresh", status: "up-to-date" },
  ]),
};

vi.mock("../../lib/openspec-config-api.js", () => ({
  saveOpenSpecConfig: (...a: any[]) => api.saveOpenSpecConfig(...a),
  runOpenSpecUpdate: (...a: any[]) => api.runOpenSpecUpdate(...a),
  fetchUpdateStatus: (...a: any[]) => api.fetchUpdateStatus(...a),
}));

import { OpenSpecProfileSection } from "../OpenSpecProfileSection.js";

beforeEach(() => {
  api.saveOpenSpecConfig.mockClear();
  api.runOpenSpecUpdate.mockClear();
  api.fetchUpdateStatus.mockClear();
});
afterEach(cleanup);

describe("OpenSpecProfileSection", () => {
  it("defaults to core and the workflow multiselect is disabled", () => {
    render(<OpenSpecProfileSection />);
    expect(screen.getByTestId("profile-option-core").dataset.selected).toBe("true");
    expect(screen.getByTestId("workflow-multiselect").className).toContain("pointer-events-none");
  });

  it("selecting Custom enables the multiselect", () => {
    render(<OpenSpecProfileSection />);
    fireEvent.click(screen.getByTestId("profile-option-custom"));
    expect(screen.getByTestId("workflow-multiselect").className).not.toContain("pointer-events-none");
  });

  it("Save posts the selected profile + workflows", async () => {
    render(<OpenSpecProfileSection />);
    fireEvent.click(screen.getByTestId("profile-option-expanded"));
    fireEvent.click(screen.getByTestId("save-profile-btn"));
    await waitFor(() => expect(api.saveOpenSpecConfig).toHaveBeenCalled());
    const [profile, workflows] = api.saveOpenSpecConfig.mock.calls[0];
    expect(profile).toBe("expanded");
    expect(workflows).toContain("verify");
    expect(workflows).toHaveLength(11);
  });

  it("custom toggling chips changes the saved set", async () => {
    render(<OpenSpecProfileSection />);
    fireEvent.click(screen.getByTestId("profile-option-custom"));
    // core seed → toggle off 'apply', toggle on 'verify'
    fireEvent.click(screen.getByTestId("wf-chip-apply"));
    fireEvent.click(screen.getByTestId("wf-chip-verify"));
    fireEvent.click(screen.getByTestId("save-profile-btn"));
    await waitFor(() => expect(api.saveOpenSpecConfig).toHaveBeenCalled());
    const [profile, workflows] = api.saveOpenSpecConfig.mock.calls[0];
    expect(profile).toBe("custom");
    expect(workflows).not.toContain("apply");
    expect(workflows).toContain("verify");
  });

  it("per-cwd list starts collapsed and expands on toggle", async () => {
    render(<OpenSpecProfileSection />);
    await waitFor(() => expect(api.fetchUpdateStatus).toHaveBeenCalled());
    expect(screen.queryByTestId("cwd-list")).toBeNull();
    fireEvent.click(screen.getByTestId("collapse-toggle"));
    expect(screen.getByTestId("cwd-list")).toBeTruthy();
  });

  it("shows staleness badges and gates the per-cwd Update button", async () => {
    render(<OpenSpecProfileSection />);
    await waitFor(() => expect(api.fetchUpdateStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("collapse-toggle"));
    expect(screen.getByTestId("status-badge-/proj/stale").textContent).toContain("needs update");
    expect(screen.getByTestId("status-badge-/proj/fresh").textContent).toContain("up to date");
    // fresh project's Update button disabled; stale one enabled
    expect((screen.getByTestId("update-btn-/proj/fresh") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("update-btn-/proj/stale") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Update all triggers a bulk update", async () => {
    render(<OpenSpecProfileSection />);
    fireEvent.click(screen.getByTestId("update-all-btn"));
    await waitFor(() => expect(api.runOpenSpecUpdate).toHaveBeenCalledWith({ all: true }));
  });

  it("per-cwd Update posts that cwd", async () => {
    render(<OpenSpecProfileSection />);
    await waitFor(() => expect(api.fetchUpdateStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("collapse-toggle"));
    fireEvent.click(screen.getByTestId("update-btn-/proj/stale"));
    await waitFor(() => expect(api.runOpenSpecUpdate).toHaveBeenCalledWith({ cwd: "/proj/stale" }));
  });
});
