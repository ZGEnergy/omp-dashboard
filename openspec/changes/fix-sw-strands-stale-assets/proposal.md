# fix-sw-strands-stale-assets

## Why

`public/sw.js` registers a `fetch` handler that intercepts every browser
request and forwards it via `fetch(event.request)`, returning a synthesised
`503 Offline` on any failure:

```js
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => new Response("Offline", { status: 503 }))
  );
});
```

This was added for PWA installability, but PWA installability requires
only a *registered* service worker — not one that intercepts requests.
The interception causes a class of failures the dashboard has no business
producing:

1. **Stale-asset 5xx after re-deploy.** Vite hashes asset filenames
   (`assets/index-<hash>.js`). When the user upgrades to a new build,
   the cached HTML in the browser references new hash names, but the
   service worker — which is itself cached — keeps trying the *old*
   hash names against `fetch(event.request)`. The server returns the
   SPA fallback (`index.html`) for unknown paths, but the browser
   expects JavaScript MIME types and refuses to execute. The service
   worker also synthesises non-2xx responses when fetches transiently
   fail, and Chrome reports those as `(from service worker)` 5xx
   responses with no source available.
2. **Service-worker survival across re-installs.** Service workers
   persist across page reloads, app re-installs, and even DMG
   re-installations. The user installed today's DMG on top of an
   older one and immediately saw Chrome's "This page isn't working"
   500 page. The actual server returned 200 to `curl`; the synthesised
   500 came from the previous DMG's `sw.js` still running in the
   browser. The fix to `resolveClientDir` correctly made the server
   serve `index.html`, but the browser never asked the server because
   the SW intercepted first.
3. **No correctness benefit.** The dashboard is real-time. Every
   resource it cares about is either (a) dynamic (`/api/*`, WebSocket
   upgrades) — caching is actively wrong, or (b) fingerprinted by Vite
   — the URL itself encodes the content version, so HTTP cache headers
   already do the right job. A pass-through SW provides zero benefit
   over no SW.

The fix: keep the SW registered (preserves PWA install-prompt
behaviour) but remove the fetch handler entirely, and add an `activate`
handler that drops every Cache Storage entry from older variants so
existing users get cleaned up on next visit. Add `skipWaiting()` +
`clients.claim()` so the new SW activates immediately rather than
waiting for every tab to close.

## What Changes

1. **Replace `public/sw.js` body**:
   - `install`: call `self.skipWaiting()`.
   - `activate`: clear all `caches.keys()` entries, then
     `self.clients.claim()`.
   - **NO `fetch` listener.** With no fetch listener, the browser
     bypasses the SW for every request, so the SW cannot synthesise
     responses or strand users on stale assets.
2. **Add a small lint test** in `packages/client/src/__tests__/` that
   reads `public/sw.js` and asserts:
   - `addEventListener("fetch"` is absent.
   - `addEventListener("install"` and `addEventListener("activate"` are present.
   - The file contains `self.skipWaiting()` and `caches.delete` (the
     cleanup contract that lets future fixes evict broken predecessors).
3. **No changes to** `packages/client/src/main.tsx` — the existing
   `navigator.serviceWorker.register("/sw.js")` is correct; PWA
   installability lives in the registration, not the body.

Out of scope:
- Removing PWA installability. The manifest + registered SW still
  satisfy Chrome's install criteria. This is a behaviour change inside
  the SW, not a removal.
- Versioning the SW URL. The browser automatically refetches `sw.js`
  on every navigation (24-hour max by default, but bypassed when the
  byte-for-byte content differs). Versioning the URL is unnecessary
  given the file change itself triggers re-install.
- A `/sw-killswitch.js` script for users who never re-open the page.
  Anyone running the dashboard has the page open; the next reload
  picks up the new SW.

## Capabilities

### Modified Capabilities

- `optional-static-serving`: the served `sw.js` no longer intercepts
  requests; it only performs PWA-registration + one-time cache cleanup
  on activation. Delta in
  `openspec/changes/fix-sw-strands-stale-assets/specs/optional-static-serving/spec.md`.

## Impact

- **Code:** `public/sw.js` (one file, ~15 lines).
- **Build:** Vite copies `public/*` to `dist/client/` unchanged; no
  bundler change needed.
- **Runtime behaviour:**
  - Existing users with the broken SW: on next page load, the new
    `sw.js` content differs → browser installs it → `activate` runs →
    caches cleared → `clients.claim()` takes over the open tab → page
    reload (manual or via prompt) loads cleanly from the server.
  - New users: SW is a no-op from day one. Same UX as no SW for every
    request, plus PWA installability.
- **Tests:** one new lint-style test pinning the fetch-handler-absent
  contract.
- **Docs:** `docs/file-index-client.md` row for `public/sw.js` notes the
  no-fetch-handler contract + activation-time cache cleanup.
- **Compat:** strict UX improvement. No API change. The `sw.js` URL
  and registration unchanged.
- **Cross-refs:** Surfaced by the live test of
  `fix-resolve-client-dir-prefers-durable-managed-path` — the server-side
  fix was correct but masked by the SW's synthesised 5xx response.
  Both changes are needed to get a clean install-and-load path.
