/**
 * Pure mapping helpers for the service worker's push + notificationclick logic.
 *
 * The service worker (`public/sw.js`) is dependency-free (it cannot import
 * bundled modules), so it inlines the SAME tiny logic these helpers express.
 * This module exists so that logic is unit-testable in vitest — keep the two
 * in sync (the sw.js copy is intentional duplication, documented there).
 * See change: add-server-push-notifications.
 */

/** Shape of the push payload sent by the server (`PushPayload`). */
export interface PushNotificationData {
  title?: string;
  body?: string;
  url?: string;
  sessionId?: string;
}

/** Options passed to `showNotification(title, options)`. */
export interface NotificationOptionsResult {
  title: string;
  options: {
    body: string;
    data: { url: string; sessionId?: string };
    icon: string;
    badge: string;
  };
}

/** Map a push payload → `showNotification` args. Tolerates missing fields. */
export function notificationOptionsFromPayload(data: PushNotificationData): NotificationOptionsResult {
  return {
    title: data.title ?? "Pi Dashboard",
    options: {
      body: data.body ?? "",
      data: { url: data.url ?? "/", ...(data.sessionId ? { sessionId: data.sessionId } : {}) },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    },
  };
}

/** Resolve the URL a notification click should open. Falls back to "/". */
export function clickTargetUrl(notificationData: { url?: string } | undefined | null): string {
  return notificationData?.url || "/";
}
