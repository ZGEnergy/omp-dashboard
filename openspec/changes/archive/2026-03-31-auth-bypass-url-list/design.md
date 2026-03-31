## Context

The `onRequest` hook in `auth-plugin.ts` already has two hard-coded bypass rules: loopback addresses and `/auth/` routes. The `AuthConfig` type in `shared/config.ts` has no support for user-defined bypass patterns. Users who deploy the dashboard externally (via tunnel or reverse proxy) cannot whitelist specific paths for unauthenticated access without modifying source code.

## Goals / Non-Goals

**Goals:**
- Add `bypassUrls: string[]` to `AuthConfig` — a list of URL path prefixes that skip OAuth enforcement
- Parse and validate the field in `parseAuthConfig`
- Apply the check in the `onRequest` hook (HTTP) and document the WS limitation
- Expose the list as an editable field in the Settings UI
- Keep changes minimal and fully backward-compatible (empty list = current behavior)

**Non-Goals:**
- Glob/regex pattern matching — prefix matching is sufficient for v1
- Per-method bypass (e.g., only GET requests bypass)
- Bypass for WebSocket upgrades (already covered by `validateWsUpgrade`; loopback is the only bypass there; extending it is out of scope)

## Decisions

### 1. Prefix matching over exact / regex matching
**Decision**: Use `request.url.startsWith(prefix)` for each entry.  
**Rationale**: Simple, deterministic, zero dependencies. Covers the common cases (`/api/health`, `/webhooks/`). Regex would add attack surface (ReDoS) and complexity that isn't warranted at this stage.  
**Alternative considered**: Micromatch glob patterns — rejected as overkill for URL paths.

### 2. `bypassUrls` lives inside `AuthConfig`, not at the top level
**Decision**: `auth.bypassUrls` in config JSON.  
**Rationale**: Bypass URLs are only meaningful when auth is active. Putting them inside `auth` keeps the config semantics cohesive and avoids a dangling field when auth is disabled.

### 3. Settings UI — tag/chip input rendered as a newline-separated textarea
**Decision**: Render the bypass URL list as a `<textarea>` (one URL per line) in the Settings panel, converting to/from `string[]` on save/load.  
**Rationale**: The existing Settings panel uses simple controlled inputs. A textarea requires no new dependencies and is familiar to users. A tag-chip component would need a new UI primitive.

### 4. No migration needed
**Decision**: `bypassUrls` defaults to `[]` when absent from the config file.  
**Rationale**: Empty array produces identical behavior to the current code. Existing configs remain valid without modification.

## Risks / Trade-offs

- [Risk] A misconfigured broad prefix (e.g., `/`) would bypass auth for all routes → Mitigation: document that entries are path prefixes; no server-side validation beyond "must be a string array" (user responsibility).
- [Risk] The settings textarea UX is less polished than a chip input → Acceptable for v1; can be improved later without spec changes.

## Migration Plan

1. Update `AuthConfig` type and `parseAuthConfig` — backward-compatible, no migration
2. Update `onRequest` hook — additive check, no behavior change when list is empty
3. Update Settings UI — new optional field, no breaking UI changes
4. Restart server to pick up config changes (standard restart workflow)

**Rollback**: Remove `bypassUrls` from config JSON and restart — system falls back to current behavior immediately.

## Open Questions

- None at this time.
