## Why

The dashboard has a rich API surface but no way for AI agents to programmatically interact with it. Many critical operations (send prompt, abort, spawn, resume, rename, flow control) are WebSocket-only, making them inaccessible from skills that use `bash`/`curl`. A bundled skill + REST wrappers would let any pi session monitor and control the dashboard — enabling orchestration recipes, health checks, and cross-session coordination.

## What Changes

1. **REST wrappers for WebSocket-only operations** — Add REST endpoints that proxy to the browser-gateway's existing WebSocket message handlers:
   - `POST /api/session/:id/prompt` — send prompt to a session
   - `POST /api/session/:id/abort` — abort a session
   - `POST /api/session/:id/shutdown` — shutdown a pi session
   - `POST /api/session/:id/rename` — rename a session
   - `POST /api/session/:id/hide` — hide a session
   - `POST /api/session/:id/unhide` — unhide a session
   - `POST /api/session/spawn` — spawn a new session
   - `POST /api/session/:id/resume` — resume/fork an ended session
   - `POST /api/session/:id/flow-control` — abort flow or toggle autonomous
   - `POST /api/session/:id/model` — set model
   - `POST /api/session/:id/thinking-level` — set thinking level
   - `POST /api/session/:id/attach-proposal` — attach OpenSpec proposal
   - `POST /api/session/:id/detach-proposal` — detach OpenSpec proposal

2. **Bundled `pi-dashboard` skill** — A skill directory shipped with the npm package containing:
   - `SKILL.md` — main instructions with auto-discovery, capability overview, auth handling
   - `references/api-reference.md` — complete REST API reference
   - `references/recipes.md` — orchestration recipes (spawn→prompt→monitor, health checks, batch operations)
   - `scripts/dashboard-api.sh` — helper script with port auto-detection, auth, JSON formatting

3. **Package integration** — Add `skills/` to `files` in package.json and register via `pi.skills`

## Impact

- Affected specs: `dashboard-server` (new REST endpoints), new `pi-dashboard-skill` capability
- Affected code: `src/server/server.ts` (new routes), `skills/pi-dashboard/` (new directory), `package.json`
- No breaking changes — all additions
