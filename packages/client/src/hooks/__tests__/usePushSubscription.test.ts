/**
 * Tests for usePushSubscription.
 *   1. unsupported → supported=false, no fetch.
 *   2. subscribe path → POSTs the subscription to /api/push/register.
 *   3. existing getSubscription() on mount → status 'subscribed' AND
 *      re-POSTs register so tokenId is recovered after refresh.
 *   4. dismissed permission prompt stays unsubscribed (not denied).
 * See change: add-server-push-notifications.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "../usePushSubscription.js";

const VAPID = "BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWC5cW8OCzVrOQRv-1npXRWtGb-lTFm4RRBEeQPQ8"; // base64url-ish

function mockServiceWorker(existingSub: PushSubscription | null) {
  const subscribe = vi.fn(async () => ({
    endpoint: "https://push.example/x",
    toJSON: () => ({ endpoint: "https://push.example/x" }),
  }));
  const getSubscription = vi.fn(async () => existingSub);
  const ready = Promise.resolve({ pushManager: { subscribe, getSubscription } });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  return { subscribe, getSubscription };
}

function mockFetchOk() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/push/vapid-public-key")) {
      return Promise.resolve({ ok: true, json: async () => ({ publicKey: VAPID }) });
    }
    if (url.includes("/api/push/register")) {
      return Promise.resolve({ ok: true, json: async () => ({ tokenId: "tok-1" }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe("usePushSubscription", () => {
  const origSW = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  const origPushManager = Object.getOwnPropertyDescriptor(window, "PushManager");

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "default" as NotificationPermission,
        requestPermission: vi.fn(async () => "granted" as NotificationPermission),
      },
    });
    // atob polyfill for Node vitest
    if (typeof globalThis.atob !== "function") {
      globalThis.atob = (s: string) => Buffer.from(s, "base64").toString("binary");
    }
  });

  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, "serviceWorker", origSW);
    else Reflect.deleteProperty(navigator, "serviceWorker");
    if (origPushManager) Object.defineProperty(window, "PushManager", origPushManager);
    else Reflect.deleteProperty(window, "PushManager");
  });

  it("reports unsupported and issues no fetch when SW/PushManager are absent", () => {
    Reflect.deleteProperty(navigator, "serviceWorker");
    Reflect.deleteProperty(window, "PushManager");
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.supported).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("subscribe() POSTs the subscription to /api/push/register", async () => {
    mockServiceWorker(null);
    const fetchSpy = mockFetchOk();
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.supported).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

    await act(async () => {
      await result.current.subscribe();
    });

    const registerCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/api/push/register"));
    expect(registerCall).toBeDefined();
    expect(registerCall?.[1]?.method).toBe("POST");
    const body = JSON.parse(String(registerCall?.[1]?.body));
    expect(body.transport).toBe("web-push");
    expect(typeof body.deviceToken).toBe("string");
    await waitFor(() => expect(result.current.status).toBe("subscribed"));
  });

  it("re-registers an existing subscription on mount to recover tokenId", async () => {
    const existing = {
      endpoint: "https://push.example/existing",
      toJSON: () => ({ endpoint: "https://push.example/existing" }),
    } as PushSubscription;
    mockServiceWorker(existing);
    const fetchSpy = mockFetchOk();
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    const registerCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/api/push/register"));
    expect(registerCalls.length).toBeGreaterThanOrEqual(1);
    expect(registerCalls[0]?.[1]?.method).toBe("POST");
  });

  it("maps denied Notification.permission on mount to denied status", async () => {
    mockServiceWorker(null);
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "denied" as NotificationPermission,
        requestPermission: vi.fn(async () => "denied" as NotificationPermission),
      },
    });
    const fetchSpy = mockFetchOk();
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("denied"));
  });

  it("dismissed permission prompt stays unsubscribed (not denied)", async () => {
    mockServiceWorker(null);
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "default" as NotificationPermission,
        requestPermission: vi.fn(async () => "default" as NotificationPermission),
      },
    });
    const fetchSpy = mockFetchOk();
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

    await act(async () => {
      await result.current.subscribe();
    });
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));
  });

  it("does not send a test push without a registered tokenId", async () => {
    mockServiceWorker(null);
    const fetchSpy = mockFetchOk();
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

    await expect(result.current.sendTest()).rejects.toThrow(/not registered/i);
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/push/test"))).toBe(false);
  });
  it("keeps push unavailable when the VAPID public key is empty", async () => {
    const serviceWorker = mockServiceWorker(null);
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "default" as NotificationPermission, requestPermission },
    });
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/api/push/vapid-public-key")) {
        return { ok: true, json: async () => ({ publicKey: "   " }) };
      }
      return { ok: true, json: async () => ({ tokenId: "tok-1" }) };
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(result.current.status).toBe("unknown");

    await act(async () => {
      await result.current.subscribe();
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(serviceWorker.subscribe).not.toHaveBeenCalled();
  });

  it("does not mark an existing subscription as subscribed when register fails", async () => {
    const existing = {
      endpoint: "https://push.example/existing",
      toJSON: () => ({ endpoint: "https://push.example/existing" }),
    } as PushSubscription;
    mockServiceWorker(existing);
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/api/push/vapid-public-key")) {
        return { ok: true, json: async () => ({ publicKey: VAPID }) };
      }
      if (url.includes("/api/push/register")) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({}) };
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/push/register"))).toBe(true);
  });

  it("keeps local subscription state when unregister DELETE fails", async () => {
    const unsubscribe = vi.fn(async () => true);
    const existing = {
      endpoint: "https://push.example/existing",
      toJSON: () => ({ endpoint: "https://push.example/existing" }),
      unsubscribe,
    } as unknown as PushSubscription;
    mockServiceWorker(existing);
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/api/push/vapid-public-key")) {
        return { ok: true, json: async () => ({ publicKey: VAPID }) };
      }
      if (url.includes("/api/push/register/") && url.includes("tok-1")) {
        return { ok: false, json: async () => ({}) };
      }
      if (url.includes("/api/push/register")) {
        return { ok: true, json: async () => ({ tokenId: "tok-1" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    await expect(result.current.unsubscribe()).rejects.toThrow(/unregister/i);
    expect(result.current.status).toBe("subscribed");
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
