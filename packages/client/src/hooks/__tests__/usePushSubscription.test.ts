/**
 * Tests for usePushSubscription.
 *   1. unsupported → supported=false, no fetch.
 *   2. subscribe path → POSTs the subscription to /api/push/register.
 *   3. idempotent → an existing getSubscription() → status 'subscribed',
 *      no register POST issued on mount.
 * See change: add-server-push-notifications.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "../usePushSubscription.js";

const VAPID = "BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWC5cW8OCzVrOQRv-1npXRWtGb-lTFm4RRBEeQPQ8"; // base64url-ish

function mockServiceWorker(existingSub: unknown) {
  const subscribe = vi.fn(async () => ({ endpoint: "https://push.example/x", toJSON: () => ({}) }));
  const getSubscription = vi.fn(async () => existingSub);
  const ready = Promise.resolve({ pushManager: { subscribe, getSubscription } });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready },
  });
  (window as any).PushManager = function () {};
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

  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).Notification = { requestPermission: vi.fn(async () => "granted") };
    (global as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");
  });

  afterEach(() => {
    if (origSW) Object.defineProperty(navigator, "serviceWorker", origSW);
    else delete (navigator as any).serviceWorker;
    delete (window as any).PushManager;
  });

  it("reports unsupported and issues no fetch when SW/PushManager are absent", () => {
    delete (navigator as any).serviceWorker;
    delete (window as any).PushManager;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.supported).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("subscribe() POSTs the subscription to /api/push/register", async () => {
    mockServiceWorker(null);
    const fetchSpy = mockFetchOk();
    global.fetch = fetchSpy as any;

    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.supported).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("unsubscribed"));

    await act(async () => {
      await result.current.subscribe();
    });

    const registerCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes("/api/push/register"));
    expect(registerCall).toBeDefined();
    expect(registerCall?.[1]?.method).toBe("POST");
    const body = JSON.parse(registerCall?.[1]?.body as string);
    expect(body.transport).toBe("web-push");
    expect(typeof body.deviceToken).toBe("string");
    await waitFor(() => expect(result.current.status).toBe("subscribed"));
  });

  it("reflects an existing subscription as 'subscribed' without registering on mount", async () => {
    mockServiceWorker({ endpoint: "https://push.example/existing" });
    const fetchSpy = mockFetchOk();
    global.fetch = fetchSpy as any;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    const registerCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/api/push/register"));
    expect(registerCalls).toHaveLength(0);
  });
});
