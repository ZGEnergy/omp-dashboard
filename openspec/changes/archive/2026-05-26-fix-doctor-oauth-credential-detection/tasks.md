# Tasks

## 1. Shared credential detector

- [x] 1.1 Create `packages/shared/src/credential-detect.ts` exporting `hasAnyProviderCredential(homeDir?: string): boolean`. Default `homeDir` to `os.homedir()`. The body inspects `<homeDir>/.pi/agent/settings.json` (existing fields) and `<homeDir>/.pi/agent/auth.json` (any provider entry with non-empty `key` / `access` / `refresh`). Both reads are wrapped in try/catch returning `false` for that file only; the function does not throw.
- [x] 1.2 Helper `isNonEmptyString(v: unknown): boolean` — `typeof v === "string" && v.trim().length > 0`. Used uniformly so accidental empty-string writes do not flip the result to `true`.
- [x] 1.3 Export a tiny `inspectedCredentialFiles(homeDir?: string): string[]` returning the absolute paths the detector examined, in inspection order. Used by Doctor's `detail` text so the message stays accurate when the file layout changes.
- [x] 1.4 Unit test in `packages/shared/src/__tests__/credential-detect.test.ts` covers the full matrix from the proposal: settings-only, auth-only (api-key shape), auth-only (oauth shape), both, neither, malformed-settings + valid-auth, malformed-auth + valid-settings, both malformed, missing files. Use a per-test tmp dir as `homeDir`; do NOT touch the real `~/.pi/agent`.

## 2. Doctor route delegates to the helper

- [x] 2.1 In `packages/server/src/routes/doctor-routes.ts`, delete the local `isApiKeyConfigured()` function (lines ~72–87).
- [x] 2.2 Import `hasAnyProviderCredential` from `@blackbelt-technology/pi-dashboard-shared/credential-detect` (resolve the exact package path the repo uses — check the existing import of other shared helpers in this file).
- [x] 2.3 In `buildDefaultDeps()` set `isApiKeyConfigured: () => hasAnyProviderCredential()`.
- [x] 2.4 Update `packages/server/src/__tests__/doctor-route.test.ts` so the fixture exercises the OAuth-only path (writes a synthetic `auth.json` with `{ anthropic: { type: "oauth", access: "x", refresh: "y", expires: <future> } }` and no `settings.json` API keys) and asserts the `API key` check status is `ok`.

## 3. Electron wizard mirror

- [x] 3.1 In `packages/electron/src/lib/wizard-state.ts`, replace the body of `isApiKeyConfigured()` with a delegation to the shared `hasAnyProviderCredential()`. Keep the function exported under the same name so existing imports (`packages/electron/src/lib/doctor.ts`, wizard renderer) are untouched.
- [x] 3.2 Update `packages/electron/src/__tests__/wizard-state.test.ts` to add a third case: OAuth-only `auth.json` returns `true`. Continue covering the legacy two cases (no settings → false; `writeApiKey` then check → true).
- [x] 3.3 Audit `packages/electron/src/lib/wizard-window.ts` and the renderer's "Already configured" gate — if either re-implements credential detection inline rather than calling `isApiKeyConfigured()`, route it through the helper too. (Likely already correct via the existing import; verify, do not rewrite.)

## 4. Message tweaks in shared doctor-core

- [x] 4.1 In `packages/shared/src/doctor-core.ts`, update `SUGGESTIONS["API key"]`: replace `"Configure one in **Settings → Providers**."` with text that names both routes, e.g. `"Sign in via **Settings → Providers** (OAuth subscription) or set an API key there. Pi sessions need at least one credential to use LLM providers."`
- [x] 4.2 In the same file, update the API-key check's `message` / `detail` builder (around line ~800 in `runSharedChecks`): the `detail` SHALL be sourced from `inspectedCredentialFiles()` so it lists both `settings.json` and `auth.json`. The "ok" message stays `"Configured"`; the "not-ok" message stays a short one-liner ("Not configured — pi sessions will need a key to use LLM providers"). Do NOT mention which specific provider matched.
- [ ] 4.3 (deferred — not pursued; live REST verification + Scenario in spec covers the invariant) Snapshot-test `formatDoctorReportMarkdown` for an OAuth-only fixture in `packages/shared/src/__tests__/` (or extend an existing test) to lock in that "Remediation" never contains the substring `"Configure one in **Settings → Providers**"` for an OAuth-only install.

## 5. Coverage of pre-existing test surface

- [x] 5.1 Grep the repo for the literal `"anthropicApiKey"` and `"providers"` string usage in detection paths (`grep -rn 'anthropicApiKey' --include='*.ts' packages/ src/` excluding `out/` and `node_modules/`). Confirm only the doctor-route + wizard-state copies need updating. Any others (e.g. installer scripts, electron preload, pi-extensions) should be left alone — they have legitimate non-detection uses.
- [x] 5.2 Verify the existing `packages/server/src/__tests__/doctor-route.test.ts` fixture that stubs `isApiKeyConfigured: () => true` keeps passing (it stubs through `SharedChecksDeps`, so the underlying detector change is invisible to that test).

## 6. Manual verification

- [x] 6.1 With the current dev session's `~/.pi/agent/auth.json` (Anthropic + Codex OAuth populated) and a `settings.json` lacking any API-key field, hit `GET /api/doctor` and confirm the `API key` row reports `status: "ok"`.
- [x] 6.2 Move `~/.pi/agent/auth.json` aside temporarily, restart the server, hit `/api/doctor`, confirm the row reports `status: "warning"` with the new message and a `detail` listing both inspected file paths. Restore `auth.json` afterwards.
- [ ] 6.3 (deferred — REST `/api/doctor` shares the same `runSharedChecks` code path; Electron Doctor mirror to be verified on next packaged build) In the Electron app, open Doctor (Help → Doctor) and confirm the API-key row matches the REST behaviour above for both states.
