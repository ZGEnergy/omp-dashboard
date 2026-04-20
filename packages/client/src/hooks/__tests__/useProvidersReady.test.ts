import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useProvidersReady } from "../useProvidersReady.js";

/**
 * Build a fetch mock that routes by URL:
 *   - /api/providers          → { success, providers }
 *   - /api/provider-auth/status → array of { authenticated }
 */
function mockFetch(opts: {
  providers?: Record<string, { apiKey?: string }>;
  authStatus?: Array<{ authenticated: boolean }>;
  providersFails?: boolean;
  authStatusFails?: boolean;
}) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/provider-auth/status")) {
      if (opts.authStatusFails) return Promise.reject(new Error("fail"));
      return Promise.resolve({
        ok: true,
        json: async () => opts.authStatus ?? [],
      } as any);
    }
    if (url.includes("/api/providers")) {
      if (opts.providersFails) return Promise.reject(new Error("fail"));
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, providers: opts.providers ?? {} }),
      } as any);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useProvidersReady", () => {
  it("starts with loading=true, ready=false, count=0", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any;
    const { result } = renderHook(() => useProvidersReady());
    expect(result.current.loading).toBe(true);
    expect(result.current.ready).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("returns ready=true when any /api/providers entry has non-empty apiKey", async () => {
    global.fetch = mockFetch({
      providers: { anthropic: { apiKey: "sk-abc" }, openai: { apiKey: "" } },
      authStatus: [],
    }) as any;
    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it("returns ready=true when /api/provider-auth/status has an authenticated OAuth provider", async () => {
    global.fetch = mockFetch({
      providers: {},
      authStatus: [
        { authenticated: true } as any,
        { authenticated: false } as any,
      ],
    }) as any;
    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it("counts both sources when both have credentials", async () => {
    global.fetch = mockFetch({
      providers: { openai: { apiKey: "sk-xyz" } },
      authStatus: [{ authenticated: true } as any],
    }) as any;
    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(2);
    expect(result.current.ready).toBe(true);
  });

  it("returns ready=false when neither source has credentials", async () => {
    global.fetch = mockFetch({
      providers: { anthropic: { apiKey: "" } },
      authStatus: [{ authenticated: false } as any],
    }) as any;
    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("returns ready=false when both endpoints fail", async () => {
    global.fetch = mockFetch({ providersFails: true, authStatusFails: true }) as any;
    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);
  });

  it("still reports ready when one endpoint fails but the other has creds", async () => {
    global.fetch = mockFetch({
      providersFails: true,
      authStatus: [{ authenticated: true } as any],
    }) as any;
    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(true);
  });

  it("refetches on provider-auth-event", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      call++;
      if (url.includes("/api/provider-auth/status")) {
        // first call returns empty, later calls return authenticated
        return Promise.resolve({
          ok: true,
          json: async () => (call <= 2 ? [] : [{ authenticated: true }]),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, providers: {} }),
      } as any);
    }) as any;

    const { result } = renderHook(() => useProvidersReady());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);

    act(() => {
      window.dispatchEvent(new CustomEvent("provider-auth-event"));
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});
