## Why

Currently, auth bypass is limited to localhost connections. There is no way to configure additional URL paths that should be publicly accessible without authentication — useful for health checks, webhooks, or other endpoints that need to be reachable from external systems without requiring a valid OAuth session.

## What Changes

- Add `bypassUrls` field to `AuthConfig` (array of URL path prefixes/patterns to bypass auth)
- Update `parseAuthConfig` in `shared/config.ts` to read and validate the new field
- Update the `onRequest` hook in `auth-plugin.ts` to check incoming request URLs against `bypassUrls` before enforcing auth
- Expose `bypassUrls` in the Settings UI so users can manage the list from the dashboard
- Update the config REST API to read/write the new field

## Capabilities

### New Capabilities
- `auth-bypass-url-list`: Configurable list of URL path prefixes that skip OAuth authentication, managed via config and the Settings UI

### Modified Capabilities
- `oauth-authentication`: The `AuthConfig` type gains a `bypassUrls?: string[]` field; the `onRequest` hook gains a bypass check for configured URL patterns
- `settings-panel`: Settings form gains a multi-value text input for managing `auth.bypassUrls`

## Impact

- `src/shared/config.ts` — `AuthConfig` interface + `parseAuthConfig` parser
- `src/server/auth-plugin.ts` — `onRequest` hook bypass logic
- `src/client/components/SettingsPanel.tsx` — new UI field for the URL list
- `src/shared/rest-api.ts` — no schema changes needed (existing partial-merge config API handles it)
- Tests: `auth-plugin` unit tests for the new bypass check; config parser tests for `bypassUrls`
