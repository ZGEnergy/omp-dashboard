## Context

The dashboard's browser-gateway already handles all session control operations via WebSocket messages. The REST wrappers need to invoke the same logic without duplicating it. The skill must work across installations (local dev, npm global, tunneled remote).

## Goals / Non-Goals

- **Goals**: Full REST API coverage for all session operations; bundled skill usable from any pi session; auth-aware helper script; practical recipes
- **Non-Goals**: Real-time event streaming via REST (use WebSocket subscribe for that); replacing the browser WebSocket protocol; MCP server integration

## Decisions

### REST wrapper approach: Direct internal calls, not WebSocket relay

The REST endpoints will call the same internal methods that `browser-gateway.ts` calls (piGateway.send, sessionManager.update, processManager.spawn, etc.) rather than opening a WebSocket connection to itself. This avoids unnecessary indirection.

**Alternatives considered:**
- WebSocket relay (REST → internal WS message) — adds latency, complexity, error handling overhead
- Separate controller module — over-engineering for thin pass-through routes

### Route structure: `/api/session/:id/<action>`

Consistent RESTful pattern. The `:id` parameter is the session ID. Actions are verbs matching the WebSocket message types.

### Skill distribution: `pi.skills` in package.json

Pi discovers skills in packages via `pi.skills` entries. This means the skill auto-registers when the dashboard package is installed, no manual setup needed.

### Helper script: bash with jq dependency

The helper script uses `curl` + `jq` (both ubiquitous). It reads port from `~/.pi/dashboard/config.json` and handles auth token from cookies.

## Risks / Trade-offs

- **Auth token in skill**: The helper script reads JWT from a predictable location. This is fine for localhost but should warn when tunneled.
- **jq dependency**: Not installed everywhere. The script should gracefully degrade (raw JSON output without jq).
- **Stale session IDs**: Recipes that chain operations may reference sessions that have ended. Recipes should document polling patterns.

## Open Questions

- None — straightforward additive change.
