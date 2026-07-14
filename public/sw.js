// Minimal service worker for PWA installability + Web Push.
// Cache version: v3 (skipWaiting + clients.claim so push handlers activate
// without a second visit — see change: add-server-push-notifications).
//
// Passes all requests through to the network — no caching.
//
// /api/* requests are forwarded untouched: a network failure propagates as a
// real fetch rejection so callers can distinguish it from a server response.
// Only navigation/asset requests get the synthetic "Offline" fallback.
// See change: fix-openspec-profile-load-race.

self.addEventListener("install", () => {
  // Activate the new SW immediately so push/notificationclick handlers land
  // without waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    // Pass through; do NOT mask failures as a fabricated 503.
    return; // let the browser perform the default network fetch
  }
  event.respondWith(
    fetch(event.request).catch(() => new Response("Offline", { status: 503 }))
  );
});

// ── Web Push ────────────────────────────────────────────────────────────────
// NOTE: this SW is dependency-free (cannot import bundled modules), so the
// payload→notification-args and click→url mapping below is INTENTIONALLY
// duplicated from `packages/client/src/lib/push-notification-payload.ts`, which
// holds the same logic under unit test. Keep the two in sync.
// See change: add-server-push-notifications.
self.addEventListener("push", (event) => {
  const data = event.data ? (() => { try { return event.data.json(); } catch { return {}; } })() : {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Pi Dashboard", {
      body: data.body ?? "",
      data: { url: data.url ?? "/", ...(data.sessionId ? { sessionId: data.sessionId } : {}) },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
