# DOX — public

Files in this directory. One row per file. Non-source area (migrated from `docs/file-index-skills-misc.md`; source of truth now here). See change: migrate-file-index-to-agents-tree.

| File | Purpose |
|------|---------|
| `icon-192.png` | PWA app icon 192x192. Referenced by manifest.json. |
| `icon-512.png` | PWA app icon 512x512. Referenced by manifest.json. |
| `manifest.json` | PWA web app manifest for installability |
| `sw.js` | Dependency-free PWA service worker: passes `/api/*` requests through to network and returns synthetic `503 "Offline"` only for non-API requests; handles Web Push `push` notifications and `notificationclick` deep-linking back to the dashboard. Keep its payload mapping aligned with `packages/client/src/lib/push-notification-payload.ts`. See change: add-server-push-notifications. |
