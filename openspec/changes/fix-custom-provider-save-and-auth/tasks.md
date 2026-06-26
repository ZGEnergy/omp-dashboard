## 1. apiKey resolution (extension)

- [ ] 1.1 Write a failing test for `resolveApiKeyEnvName`: literal key input → returns a `$`-prefixed reference whose env var is set to the literal; `$ENV` input → returns the `$`-reference unchanged; never returns a bare non-`$` name.
- [ ] 1.2 Update `resolveApiKeyEnvName` in `packages/extension/src/provider-register.ts` to return `"$JUDO_<NAME>_KEY"` (with `$`) while setting `process.env.JUDO_<NAME>_KEY`, and to keep the `$` on user `$ENV` input.
- [ ] 1.3 Add a test asserting the value passed to `pi.registerProvider(...).apiKey` for a literal-key provider resolves (via pi-ai config-value semantics / a stubbed resolver) to the real secret, not the env-var name.

## 2. Catalogue configured status (extension)

- [ ] 2.1 Write a failing test for `_buildProviderCatalogue`: a custom provider whose key is known only to `getProviderAuthStatus` (not `authStorage`) yields `configured: true`.
- [ ] 2.2 Update `_buildProviderCatalogue` to read `modelRegistry.getProviderAuthStatus(id)` for `configured`/`source`, falling back to `authStorage.getAuthStatus(id)` / `authStorage.has(id)` when the method is absent.
- [ ] 2.3 Verify built-in/OAuth/env-var/ambient scenarios from the spec still produce the documented `configured`/`source` values (regression tests).

## 3. Save-path guards

- [ ] 3.1 Write a failing test (client) for the LLM-providers save task: a blank/whitespace provider name produces an error and leaves the source dirty (not silently dropped).
- [ ] 3.2 Update the LLM-providers save task in `packages/client/src/components/SettingsPanel.tsx` to reject blank names with a visible error before building the PUT body.
- [ ] 3.3 Write a failing test (server) for `PUT /api/providers`: `apiKey === "***"` with no existing entry for that name does NOT persist `"***"` as the key.
- [ ] 3.4 Update the merge in `packages/server/src/routes/provider-routes.ts` to reject (or drop the key for) `***`-without-existing instead of writing the sentinel; preserve the existing-key path.

## 4. Verify & integrate

- [ ] 4.1 `npm test 2>&1 | tee /tmp/pi-test.log` and confirm no failures (`grep -nE 'FAIL|Error|✗' /tmp/pi-test.log`).
- [ ] 4.2 Manual end-to-end: add a `proxy` provider with a literal key in Settings → Save → confirm it reports configured (no "no API key setup") and a prompt to the proxy model authenticates upstream. Inspect `~/.pi/agent/providers.json` to confirm the stored key is the real value (not `***`).
- [ ] 4.3 Rebuild + reload per the project workflow: `npm run build`, restart the server, `npm run reload`.
