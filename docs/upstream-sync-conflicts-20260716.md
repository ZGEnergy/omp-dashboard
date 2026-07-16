# Upstream sync conflict resolutions (2026-07-16)

- Upstream tip: `upstream/develop@e75445fc`.
- Base: `origin/main@3b8d314d`.
- The merge started from a fresh `sync/upstream-develop` branch. Protected ZGE paths (deploy, Web Push, OMP config routes, agent-path/input-needed tools, and sync tooling) remain ZGE-owned.
- The 25 textual conflicts were resolved by retaining ZGE behavior at overlapping hunks while incorporating non-overlapping upstream changes. Shared server/extension event wiring and bridge hubs retain both push/OMP registrations and upstream registrations.
- Client conflicts retain mobile/chat controls and input-needed rendering while accepting unrelated upstream UI behavior. Package metadata/lockfile was resolved as valid JSON with both dependency-side changes where non-overlapping.
- No credentials, VAPID private keys, or full push endpoints are included here.
