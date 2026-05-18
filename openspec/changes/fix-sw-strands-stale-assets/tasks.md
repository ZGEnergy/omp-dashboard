## 1. Service worker body

- [x] 1.1 Rewrite `public/sw.js`:
  - `install` listener: call `self.skipWaiting()`.
  - `activate` listener: `event.waitUntil` an async block that calls `caches.keys()`, deletes every key, then `self.clients.claim()`.
  - **NO** `addEventListener("fetch", ...)`. Add a header comment explaining why and pointing at this openspec change.

## 2. Tests

- [x] 2.1 Add `packages/client/src/__tests__/sw-no-fetch-handler.test.ts`. Lint-style: read `public/sw.js` as text and assert:
  - Absent: `addEventListener("fetch"`
  - Present: `addEventListener("install"`
  - Present: `addEventListener("activate"`
  - Present: `self.skipWaiting()`
  - Present: `caches.delete`

## 3. Build + smoke

- [x] 3.1 `npm run build:local` in `packages/electron/`. The bundle-staleness gate from `fix-build-installer-stale-server-bundle` SHALL detect the changed `public/sw.js` and re-bundle (`reason=source-newer`).
- [ ] 3.2 Install the new DMG. Quit any running PI Dashboard. Relaunch.
- [ ] 3.3 In a browser still holding the OLD broken SW, reload `http://localhost:8000/`. The page SHALL load cleanly within at most one additional reload.
- [ ] 3.4 In a fresh private/incognito window, navigate to `http://localhost:8000/`. DevTools → Network: every request SHALL show status from the server (no `(from service worker)` parenthetical).

## 4. Docs

- [ ] 4.1 `docs/file-index-client.md` row for `public/sw.js` extended with: "No fetch listener \u2014 PWA install only. Activate handler clears `Cache Storage` on upgrade so stale-asset 5xx synthesised by older SW variants are evicted. See change: fix-sw-strands-stale-assets." Caveman style per AGENTS.md (delegate to subagent).
