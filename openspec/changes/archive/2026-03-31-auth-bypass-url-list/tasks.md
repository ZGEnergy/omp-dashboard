## 1. Config Type & Parser

- [x] 1.1 Add `bypassUrls?: string[]` to `AuthConfig` interface in `src/shared/config.ts`
- [x] 1.2 Update `parseAuthConfig` to read and validate `bypassUrls` (must be a string array; default to `[]` when absent)

## 2. Auth Plugin — onRequest Hook

- [x] 2.1 Update `onRequest` hook in `src/server/auth-plugin.ts` to check `authConfig.bypassUrls` before enforcing auth (prefix match via `startsWith`)
- [x] 2.2 Pass `bypassUrls` into the hook (read from the mutable `authState` so runtime reloads pick it up)
- [x] 2.3 Update `_reloadAuth` handler to refresh `authState.bypassUrls` when config is reloaded

## 3. Tests

- [x] 3.1 Write unit tests for `parseAuthConfig`: verifies `bypassUrls` is parsed, defaults to `[]`, and ignores non-array values
- [x] 3.2 Write unit tests for `onRequest` bypass logic: request matching a prefix is allowed; request not matching is blocked; empty list = no extra bypasses
- [x] 3.3 Verify existing auth tests still pass

## 4. Settings UI

- [x] 4.1 Add `bypassUrls` state to `SettingsPanel.tsx`, initialised from `config.auth?.bypassUrls ?? []`
- [x] 4.2 Render a `<textarea>` labelled "Bypass URLs" in the Authentication group (one URL prefix per line)
- [x] 4.3 On save, convert textarea lines to a trimmed, non-empty string array and include in the PATCH payload as `auth.bypassUrls`
- [x] 4.4 Verify the Settings panel works end-to-end: changes persist to config and are applied on next request
