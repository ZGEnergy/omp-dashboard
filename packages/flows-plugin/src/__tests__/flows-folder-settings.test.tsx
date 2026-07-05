/**
 * FlowsFolderSettings (folder-settings-section claim) — the per-cwd edit-mode
 * toggle. Fetch is mocked; the contract under test:
 *   - renders the EFFECTIVE value with an inherited-from-global hint
 *   - toggling PUTs the project scope, then POSTs the folder-scoped reload
 *   - no dashboard plugin-config write is involved anywhere
 * See change: flows-edit-mode-folder-settings.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowsFolderSettings } from "../client/FlowsFolderSettings.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type FetchCall = { url: string; method: string; body?: Record<string, unknown> };

function mockFetch(state: { project: boolean | null; global: boolean | null; effective: boolean }) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url: u, method, body });
    if (u.startsWith("/api/plugins/flows/edit-mode")) {
      if (method === "PUT" && body) {
        state = { project: body.enabled as boolean, global: state.global, effective: body.enabled as boolean };
      }
      return { json: async () => ({ success: true, data: state }) };
    }
    if (u.startsWith("/api/resources/reload")) {
      return { json: async () => ({ success: true, data: { reloaded: 1 } }) };
    }
    return { json: async () => ({ success: false }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("FlowsFolderSettings", () => {
  it("renders the effective value with the inherited hint when project is unset", async () => {
    mockFetch({ project: null, global: true, effective: true });
    render(<FlowsFolderSettings cwd="/repo/app" />);
    await waitFor(() => {
      const box = screen.getByTestId("flows-folder-edit-mode-toggle") as HTMLInputElement;
      expect(box.checked).toBe(true);
    });
    expect(screen.getByTestId("flows-edit-mode-inherited")).toBeTruthy();
  });

  it("hides the inherited hint when the project value is explicit", async () => {
    mockFetch({ project: false, global: true, effective: false });
    render(<FlowsFolderSettings cwd="/repo/app" />);
    await waitFor(() => {
      const box = screen.getByTestId("flows-folder-edit-mode-toggle") as HTMLInputElement;
      expect(box.disabled).toBe(false);
    });
    expect(screen.queryByTestId("flows-edit-mode-inherited")).toBeNull();
  });

  it("toggling PUTs the project scope then POSTs the folder-scoped reload", async () => {
    const calls = mockFetch({ project: null, global: null, effective: false });
    render(<FlowsFolderSettings cwd="/repo/app" />);
    await waitFor(() => {
      expect((screen.getByTestId("flows-folder-edit-mode-toggle") as HTMLInputElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId("flows-folder-edit-mode-toggle"));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url === "/api/resources/reload")).toBe(true);
    });

    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/plugins/flows/edit-mode");
    expect(put?.body).toEqual({ cwd: "/repo/app", scope: "project", enabled: true });

    const reload = calls.find((c) => c.method === "POST" && c.url === "/api/resources/reload");
    expect(reload?.body).toEqual({ scope: "local", cwd: "/repo/app" });

    // Ordering: write precedes reload so the reload re-reads the persisted value.
    expect(calls.findIndex((c) => c.method === "PUT")).toBeLessThan(
      calls.findIndex((c) => c.method === "POST" && c.url === "/api/resources/reload"),
    );

    // Toggle reflects the written value (from the PUT response read-back).
    expect((screen.getByTestId("flows-folder-edit-mode-toggle") as HTMLInputElement).checked).toBe(true);
  });

  it("never writes dashboard plugin config", async () => {
    const calls = mockFetch({ project: null, global: null, effective: false });
    render(<FlowsFolderSettings cwd="/repo/app" />);
    await waitFor(() => {
      expect((screen.getByTestId("flows-folder-edit-mode-toggle") as HTMLInputElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("flows-folder-edit-mode-toggle"));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    // All traffic goes to the edit-mode route + reload endpoint — nothing else.
    expect(
      calls.every((c) => c.url.startsWith("/api/plugins/flows/edit-mode") || c.url.startsWith("/api/resources/reload")),
    ).toBe(true);
  });
});
