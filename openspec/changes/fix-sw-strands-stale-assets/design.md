# Design: fix-sw-strands-stale-assets

## Context

PWA installability on Chromium requires three things:
1. A `manifest.json` with required fields (already present at
   `public/manifest.json`).
2. A service worker successfully registered for the origin.
3. HTTPS or `localhost`.

The minimum content of (2) for installability is `navigator.serviceWorker
.register("/sw.js")` succeeding — i.e. the file exists at the URL and
is a valid JS module. Chrome does NOT require the SW to do anything;
an empty file passes the install criterion.

The current `sw.js` does more than the minimum, and that "more" causes
harm:
- A `fetch` listener that intercepts every request and tries to
  forward it via `fetch(event.request)`.
- A catch arm that synthesises a 503 on any failure, BUT — and this is
  the operational footgun — Chrome shows synthesised non-200 responses
  with the `(from service worker)` parenthetical, and the developer
  sees a "500" or "503" in the Network tab that they cannot debug
  against the server because the request never left the browser.

The user lived through this today: server returned 200 to curl, but
the browser showed `HTTP ERROR 500 (Internal Server Error)` because the
SW was synthesising a 5xx from an old broken state.

## Goals / Non-Goals

**Goals:**
- Eliminate the failure mode where the SW intercepts a request,
  fails, and synthesises a 5xx that the user attributes to the server.
- Keep PWA install-prompt working (manifest + registered SW).
- Provide a clean eviction path so existing users on the broken SW
  get auto-fixed on next page load.

**Non-Goals:**
- Offline caching. The dashboard is real-time and depends on a live
  server / WebSocket connection. Caching dashboard pages for offline
  use makes no sense.
- Pre-cache + revalidate strategy. Same reason; the asset URLs are
  fingerprinted by Vite (`assets/index-<hash>.js`) so HTTP `Cache-Control`
  + `ETag` already do the job correctly.
- A separate kill-switch endpoint. The next-visit SW replacement
  pattern is sufficient.

## Decisions

### D1. Keep or remove the SW registration?
Two options:

- **(A) Keep the SW. Drop the fetch handler.** PWA installability
  preserved. SW is a no-op for every request.
- **(B) Remove the registration. Remove the SW file. Accept loss of
  PWA install prompt.**

**Chosen: A.** PWA installability is a feature; we don't want to
regress it. The cost is one empty SW file. Option B also has a
worse migration story: existing users who have the broken SW
registered would keep it until they manually unregister, because
"no registration" doesn't propagate to clients.

### D2. How to clean up existing users?
The browser fetches the SW URL on every navigation (default 24-hour
max age, but bypassed when the byte content differs). When the new
`sw.js` body differs from the cached one, the browser kicks off an
install. With `self.skipWaiting()` in `install` and `self.clients.claim()`
in `activate`, the new SW takes over the open tab immediately rather
than waiting for every tab to close.

The `activate` handler also iterates `caches.keys()` and deletes every
Cache Storage entry, which removes any pre-cached responses the
previous SW variants might have populated. (The current `sw.js` doesn't
populate caches, but older variants did during the SW's churn history.)

After activation the new SW has no fetch listener, so all subsequent
requests bypass the SW and go straight to the network.

The user should reload the page (`⌘R`) to re-fetch assets via the
non-SW path. The activation alone doesn't force a reload — the page
is already loaded with whatever the broken SW returned. The reload
button in Chrome's "500 Internal Server Error" page works fine.

### D3. SW file structure
The minimum viable content:

```js
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
```

Pros: 11 lines, clear intent, no fetch handler.
Cons: none material.

Header comment explains the no-fetch-handler contract so future
contributors don't "improve" it by adding caching.

### D4. Test strategy
The SW runs in a worker context, not the main page. Unit-testing its
runtime behaviour requires a `ServiceWorkerGlobalScope` mock, which is
overkill for a 15-line file.

Instead: lint-style test reads `public/sw.js` as text and asserts:
- No `addEventListener("fetch"` substring.
- `addEventListener("install"` substring present.
- `addEventListener("activate"` substring present.
- `self.skipWaiting()` substring present.
- `caches.delete` substring present.

This is the same pattern used by `no-direct-process-kill.test.ts` and
`no-dir-only-bundle-gate.test.ts` — a regex pin that catches
re-introduction of the offender. Future contributors who add a fetch
handler will fail this test and have to read its message, which
points at this openspec change.

### D5. Live verification path
After the new DMG installs:

```bash
# In a tab whose service worker is the OLD broken one:
# Open DevTools console, run:
navigator.serviceWorker.getRegistrations().then(rs =>
  Promise.all(rs.map(r => r.unregister()))
).then(() => caches.keys()).then(ks =>
  Promise.all(ks.map(k => caches.delete(k)))
).then(() => location.reload(true));
```

This is the one-time cleanup snippet from the diagnostic chat. After
that reload, the NEW `sw.js` is fetched, installs, activates, and
takes over — but at that point the user is already on a clean page so
they don't notice.

For future re-deploys, users will not need this snippet at all: the
new SW activates on next navigation and is a no-op from there on.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Some Chromium variant (Safari iOS?) requires a fetch handler for PWA install prompt. | Chrome / Edge / Brave all accept install prompts on SWs without fetch handlers as of Chrome 121+. Safari's PWA support is independent of SW fetch handlers. If a regression surfaces, we add an empty `fetch` listener that calls `event.respondWith(fetch(event.request))` — same as adding nothing, just satisfies any spec-lawyer browser. |
| Users who never reload an open tab keep the broken SW. | Trivial: open-tab service-workers receive `updatefound` events when the browser fetches a newer `sw.js` on subsequent navigations (every link click triggers a check). The realistic case is "the user reloads at some point in the next 24 hours", which is essentially always. |
| The `activate` handler `caches.delete` evicts something the user wanted. | The current SW doesn't populate caches (the codepath is `fetch(event.request).catch(...)`, no `event.respondWith(caches.match(...))`). Older variants may have populated caches; those are exactly what we want to evict. There is no scenario where a user benefits from holding onto stale Cache Storage entries on the dashboard. |
| `self.clients.claim()` causes a flicker in open tabs. | The new SW has no fetch handler, so claiming a client doesn't change the page's rendering. The flicker concern only applies to SWs that intercept rendering, which this one doesn't. |

## Open Questions

None block implementation.

- Should `public/sw.js` be replaced by deleting the file and adjusting
  the registration call? No — option D1.A is cleaner and preserves
  PWA install prompt.
- Should we add a SW-version constant + `console.log(SW_VERSION)` for
  ops visibility? Probably yes eventually, but a 15-line file with no
  logic doesn't need version tracking; the cleanup contract is the
  version.
