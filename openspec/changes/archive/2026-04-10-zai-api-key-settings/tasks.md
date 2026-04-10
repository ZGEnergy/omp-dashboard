## 1. Tests

- [x] 1.1 Add test: `getAuthStatus()` includes `zai` provider with `flowType: "api_key"`
- [x] 1.2 Add test: masking shows first 5 + `...` + last 3 for keys >= 12 chars
- [x] 1.3 Add test: masking returns `****` for keys < 12 chars
- [x] 1.4 Add test: empty key string results in `authenticated: false` with no `maskedKey`

## 2. Implementation

- [x] 2.1 Add `{ id: "zai", authJsonKey: "zai", name: "Z.ai" }` to `API_KEY_PROVIDERS` in `provider-auth-storage.ts`
- [x] 2.2 Update masking logic in `getAuthStatus()` to show first 5 + `...` + last 3 (or `****` if < 12 chars)

## 3. Documentation

- [x] 3.1 Update AGENTS.md key files table if needed (no new files — existing entry covers provider-auth-storage.ts)
