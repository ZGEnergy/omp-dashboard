## Purpose

**DEPRECATED** — OpenSpec polling has moved from the bridge extension to the dashboard server. See `server-openspec-polling` for the replacement capability.

Previously, the bridge extension polled the openspec CLI every 30s and sent results to the server per-session. This was replaced by server-side per-directory polling via `DirectoryService` to eliminate redundancy and enable zero-session directory visibility.
