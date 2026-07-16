/**
 * Web Push subscription lifecycle for the PWA.
 *
 * Feature-detects Service Worker + Push support. On mount, when supported,
 * fetches the VAPID public key and reflects any existing subscription. An
 * already-subscribed browser still POSTs `/api/push/register` so `tokenId`
 * is recovered after refresh (idempotent server-side by deviceToken).
 * `subscribe` requests permission, subscribes via `pushManager`, and POSTs
 * the subscription. `unsubscribe` tears it down; `sendTest` pings
 * `/api/push/test` for this device's tokenId when known.
 * See change: add-server-push-notifications.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "../lib/api-context.js";

export type PushStatus = "unknown" | "unsubscribed" | "subscribed" | "denied";

export interface PushSubscriptionState {
  supported: boolean;
  status: PushStatus;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTest: () => Promise<void>;
}

/** VAPID base64url → Uint8Array, per the Web Push spec. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function detectSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function currentNotificationPermission(): NotificationPermission | "default" {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

async function registerDeviceToken(deviceToken: string): Promise<string | null> {
  const res = await fetch(`${getApiBase()}/api/push/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceToken, transport: "web-push" }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return typeof body.tokenId === "string" ? body.tokenId : null;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  const res = await fetch(`${getApiBase()}/api/push/vapid-public-key`);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { publicKey?: unknown } | null;
  const publicKey = typeof body?.publicKey === "string" ? body.publicKey.trim() : "";
  return publicKey || null;
}

interface PushInitializationResult {
  status: Exclude<PushStatus, "unknown">;
  tokenId: string | null;
}

async function initializePushSubscription(): Promise<PushInitializationResult> {
  if (currentNotificationPermission() === "denied") return { status: "denied", tokenId: null };
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (!existing) return { status: "unsubscribed", tokenId: null };
  const id = await registerDeviceToken(JSON.stringify(existing));
  return id ? { status: "subscribed", tokenId: id } : { status: "unsubscribed", tokenId: null };
}

export function usePushSubscription(): PushSubscriptionState {
  const supported = detectSupported();
  const [status, setStatus] = useState<PushStatus>("unknown");
  const vapidKey = useRef<string | null>(null);
  const tokenId = useRef<string | null>(null);

  // On mount: fetch the VAPID key + reflect any existing subscription.
  // When a browser subscription already exists, re-POST register so tokenId
  // is recovered after a page refresh (server is idempotent on deviceToken).
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    vapidKey.current = null;
    tokenId.current = null;
    (async () => {
      try {
        const publicKey = await fetchVapidPublicKey();
        if (cancelled || !publicKey) return;
        vapidKey.current = publicKey;
        try {
          const initialization = await initializePushSubscription();
          if (cancelled) return;
          tokenId.current = initialization.tokenId;
          setStatus(initialization.status);
        } catch {
          // Existing browser sub + register network failure: leave VAPID so
          // Enable can retry; do not stick on unknown (toggle disabled forever).
          if (cancelled) return;
          tokenId.current = null;
          setStatus("unsubscribed");
        }
      } catch {
        // Push not enabled on this server (404) — stay unknown.
        vapidKey.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    // No-op while VAPID key is still loading (status stays "unknown") or
    // push is unsupported — avoids a silent enable click.
    if (!supported || !vapidKey.current) return;
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      setStatus("denied");
      return;
    }
    // Dismissed prompt leaves permission at "default" — keep unsubscribed so
    // the user can try Enable again without a permanent denied state.
    if (permission !== "granted") {
      setStatus("unsubscribed");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // `Uint8Array` is a valid BufferSource; cast satisfies stricter DOM lib types.
        applicationServerKey: urlBase64ToUint8Array(vapidKey.current) as BufferSource,
      });
      const id = await registerDeviceToken(JSON.stringify(sub));
      if (!id) {
        tokenId.current = null;
        setStatus("unsubscribed");
        return;
      }
      tokenId.current = id;
      setStatus("subscribed");
    } catch (error) {
      tokenId.current = null;
      setStatus("unsubscribed");
      throw error;
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const currentTokenId = tokenId.current;
    if (currentTokenId) {
      let response: Response;
      try {
        response = await fetch(`${getApiBase()}/api/push/register/${currentTokenId}`, { method: "DELETE" });
      } catch {
        throw new Error("Could not unregister push subscription.");
      }
      if (!response.ok) throw new Error("Could not unregister push subscription.");
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && !(await sub.unsubscribe())) throw new Error("Could not unsubscribe this device.");
    tokenId.current = null;
    setStatus("unsubscribed");
  }, [supported]);

  const sendTest = useCallback(async () => {
    if (!supported) throw new Error("Push notifications are not supported in this browser.");
    const currentTokenId = tokenId.current;
    if (!currentTokenId) throw new Error("Push subscription is not registered on this server.");
    const res = await fetch(`${getApiBase()}/api/push/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenId: currentTokenId }),
    });
    if (!res.ok) throw new Error("Could not send a test notification.");
    const body = (await res.json().catch(() => null)) as { results?: Array<{ ok?: unknown }> } | null;
    if (!Array.isArray(body?.results) || body.results.length === 0 || body.results.some((result) => result.ok !== true)) {
      throw new Error("Could not send a test notification.");
    }
  }, [supported]);


  return { supported, status, subscribe, unsubscribe, sendTest };
}
