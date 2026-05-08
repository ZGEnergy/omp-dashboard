## 1. Override table + helper

- [ ] 1.1 Create `packages/server/src/model-proxy/oauth-compat.ts` exporting `OAUTH_INCOMPATIBLE: Record<string, ReadonlySet<string>>` and `isOauthIncompatible(provider, modelId): boolean`.
- [ ] 1.2 Populate Anthropic entry with the legacy snapshots currently failing on OAuth: `claude-3-5-haiku-20241022`, `claude-3-5-haiku-latest`, `claude-3-5-sonnet-20240620`, `claude-3-5-sonnet-20241022`, `claude-3-5-sonnet-latest`, `claude-3-7-sonnet-20250219`, `claude-3-7-sonnet-latest`, `claude-3-opus-20240229`, `claude-3-opus-latest`, `claude-3-haiku-20240307`, `claude-3-sonnet-20240229`. Leave `openai` slot empty for now (commented).
- [ ] 1.3 Add `oauth-compat.test.ts` covering: known incompat id returns true; unknown id returns false; unknown provider returns false; case-sensitive id match.

## 2. Registry filter

- [ ] 2.1 Extend `CustomModelEntry` (and the model-shape JSDoc in `internal-registry.ts`) with optional `oauthCompatible?: boolean`.
- [ ] 2.2 In `getAllModels()`, when pushing built-in pi-ai models, set `oauthCompatible = !isOauthIncompatible(provider, model.id)`.
- [ ] 2.3 In `getAllModels()`, when materializing custom models, propagate `cm.oauthCompatible` (default `true` when absent).
- [ ] 2.4 Add private `canRouteModel(model, cred): boolean` implementing rules from design D1 (api_key true; oauth iff `oauthCompatible !== false`; otherwise false).
- [ ] 2.5 Replace `hasAuth(provider, auth)` call in `getAvailable()` with `canRouteModel(model, auth[model.provider])`. Keep result caching semantics.

## 3. Diagnostic surface

- [ ] 3.1 Add `getAllAnnotated(): Array<{ model, excludedReason: null | "no-credential" | "oauth-incompatible" }>` to `InternalRegistry`. Reuse `getAllModels()` + same auth check; do not bypass cache invalidation.
- [ ] 3.2 Update `/api/model-proxy/diagnostics` route handler in `packages/server/src/routes/model-proxy-routes.ts` to include `excludedReason` per entry.

## 4. Tests

- [ ] 4.1 Extend `packages/server/src/model-proxy/__tests__/internal-registry.test.ts` with cases mirroring spec scenarios: OAuth-only excludes legacy, OAuth-only includes current, api_key includes everything, mixed creds include everything, no-credential excludes provider, custom model `oauthCompatible: false` honored.
- [ ] 4.2 Add a regression case pinning the current Claude-Code allowlist (`claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5`, plus `*-4-6` family if present in pi-ai) as `oauthCompatible !== false` so they never get accidentally added to `OAUTH_INCOMPATIBLE`.
- [ ] 4.3 Add a route-level test against the diagnostics endpoint asserting `excludedReason` shape.

## 5. Documentation

- [ ] 5.1 Update `docs/architecture.md` model-proxy section: document the credential-routing filter, the override table location, and the "review when Anthropic ships a new model" note.
- [ ] 5.2 Add a CHANGELOG entry under `## [Unreleased]` → "Fixed" describing the listing change for OAuth-only setups.
- [ ] 5.3 Add row(s) for `oauth-compat.ts` and the diagnostic helper to `docs/file-index-server.md` (path-alphabetical, caveman style).

## 6. Verify

- [ ] 6.1 `npm test` green.
- [ ] 6.2 Manual smoke: with only Anthropic OAuth, `GET /v1/models` no longer lists legacy snapshots; `claude-haiku-4-5` still listed and routable.
- [ ] 6.3 Manual smoke: legacy id sent to `/v1/chat/completions` returns proxy `404` (clean failure) instead of upstream `500/404` mid-stream.
