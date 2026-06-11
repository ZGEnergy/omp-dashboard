/**
 * Tests for the profile write/update API helpers added in
 * change: add-openspec-profile-settings.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveOpenSpecConfig,
  runOpenSpecUpdate,
  fetchUpdateStatus,
} from "../openspec-config-api.js";

function mockFetchOnce(body: any, ok = true, status = 200) {
  (globalThis.fetch as any) = vi.fn(async () => ({
    ok, status, json: async () => body,
  }));
}

describe("openspec-config-api write helpers", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("saveOpenSpecConfig POSTs profile + workflows", async () => {
    mockFetchOnce({ success: true });
    await saveOpenSpecConfig("expanded", ["propose", "verify"]);
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain("/api/openspec/config");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(init.body);
    expect(sent.profile).toBe("expanded");
    expect(sent.workflows).toEqual(["propose", "verify"]);
  });

  it("saveOpenSpecConfig throws on non-success body", async () => {
    mockFetchOnce({ success: false, error: "boom" });
    await expect(saveOpenSpecConfig("custom", [])).rejects.toThrow("boom");
  });

  it("runOpenSpecUpdate posts { all: true } and returns results", async () => {
    mockFetchOnce({ success: true, data: { results: [{ cwd: "/x", success: true }] } });
    const results = await runOpenSpecUpdate({ all: true });
    expect(results).toEqual([{ cwd: "/x", success: true }]);
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual({ all: true });
  });

  it("fetchUpdateStatus returns the statuses array", async () => {
    mockFetchOnce({ success: true, data: { statuses: [{ cwd: "/x", status: "unknown" }] } });
    const statuses = await fetchUpdateStatus();
    expect(statuses).toEqual([{ cwd: "/x", status: "unknown" }]);
  });
});
