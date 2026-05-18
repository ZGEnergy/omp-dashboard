// Service worker for PWA installability.
//
// Contract: this file MUST NOT register a `fetch` listener. The dashboard
// is real-time; every asset is fingerprinted by Vite (`assets/<name>-<hash>.js`),
// and every API/WebSocket response must reach the network without an SW
// interception layer. Earlier variants registered a pass-through `fetch`
// handler that synthesised 5xx responses on transient network failure,
// stranding users on the previous build whenever assets were re-hashed
// across an upgrade and producing "HTTP ERROR 500 (from service worker)"
// in Chrome with no server-side cause.
//
// On activation, drop every `Cache Storage` entry the previous SW
// variants may have populated, then `clients.claim()` so the no-op
// SW takes over open tabs immediately. After this point the SW is
// effectively inert — the browser bypasses it for every request.
//
// See change: fix-sw-strands-stale-assets.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// NO fetch listener. Browser falls through to network natively.
