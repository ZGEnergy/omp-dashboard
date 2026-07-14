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
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/push/vapid-public-key`);
        if (!res.ok) return;
        const { publicKey } = await res.json();
        if (cancelled) return;
        vapidKey.current = publicKey;

        if (currentNotificationPermission() === "denied") {
          setStatus("denied");
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (existing) {
          const id = await registerDeviceToken(JSON.stringify(existing));
          if (cancelled) return;
          if (id) tokenId.current = id;
          setStatus("subscribed");
        } else {
          setStatus("unsubscribed");
        }
      } catch {
        // Push not enabled on this server (404) or transient — stay unknown.
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
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // `Uint8Array` is a valid BufferSource; cast satisfies stricter DOM lib types.
      applicationServerKey: urlBase64ToUint8Array(vapidKey.current) as BufferSource,
    });
    const id = await registerDeviceToken(JSON.stringify(sub));
    if (id) {
      tokenId.current = id;
      setStatus("subscribed");
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (tokenId.current) {
      await fetch(`${getApiBase()}/api/push/register/${tokenId.current}`, { method: "DELETE" }).catch(() => {});
      tokenId.current = null;
    }
    setStatus("unsubscribed");
  }, [supported]);

  const sendTest = useCallback(async () => {
    if (!supported) return;
    await fetch(`${getApiBase()}/api/push/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenId.current ? { tokenId: tokenId.current } : {}),
    }).catch(() => {});
  }, [supported]);

  return { supported, status, subscribe, unsubscribe, sendTest };
}
