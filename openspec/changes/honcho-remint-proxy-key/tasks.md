## 1. Helper refactor — auto-mint module

- [ ] 1.1 Add `force?: boolean` parameter to `ensureIntegratedProxyKey(cfg, deps)` that bypasses `shouldSkipAutoMint` when true
- [ ] 1.2 Persist new key id into `selfHost.llm._autoKeyId` when minting; update `AutoMintResult.llm` type
- [ ] 1.3 Add IO wrapper `forceMintAndPersist(cfgPath, logger)` that calls `ensureIntegratedProxyKey` with `force: true`, revokes prior key (best-effort), persists, and re-reads config
- [ ] 1.4 Add `revokePriorKey(cfg, deps)` helper — POST `/api/model-proxy/api-keys/:id/revoke` for `cfg.selfHost.llm._autoKeyId`; non-fatal on failure (log + continue)
- [ ] 1.5 Add `probeIntegratedProxy(cfg, deps): Promise<"ok"|"unauthorized"|"unknown">` — single GET `/v1/models` with current `apiKey`; `200`→`ok`, `401|403`→`unauthorized`, anything else (timeout, 5xx, network)→`unknown`
- [ ] 1.6 Add `lookupAutoKey(autoKeyId, deps): Promise<{found:boolean, label?:string}>` — GET `/api/model-proxy/api-keys` and locate entry by id
- [ ] 1.7 Add `backfillAutoKeyId(cfg, deps)` — for upgraded installs missing `_autoKeyId`: hash the on-disk `apiKey` and locate matching `honcho-auto`-labelled entry; write id back into config

## 2. Lifecycle integration — auto-recovery

- [ ] 2.1 In `routes-lifecycle.ts startStack`, after `autoMintAndPersist`, call `backfillAutoKeyId` if `_autoKeyId` is unset
- [ ] 2.2 In `routes-lifecycle.ts startStack`, after backfill, call new `recoverIfRevoked(cfg, deps)`: if probe returns `unauthorized` AND `lookupAutoKey` confirms label `honcho-auto`, run `forceMintAndPersist` and re-read cfg; broadcast `plugin:honcho:status` with `lastEvent: "auto-remint"`
- [ ] 2.3 Mirror the recovery call in `index.ts runAutoStart`
- [ ] 2.4 Ensure recovery path triggers `regenerateComposeForChanges(cfg, composePath)` when re-mint changed the apiKey

## 3. Server route — manual re-mint

- [ ] 3.1 Add `mountLlmRoutes(fastify, deps)` (new file `packages/honcho-plugin/src/server/routes-llm.ts`) — exports `POST /api/plugins/honcho/llm/remint-proxy-key`
- [ ] 3.2 Route guards: respond `409 not-integrated-proxy` when `source !== "openai-compatible"` OR `baseUrl` host ∉ `{host.docker.internal, localhost, 127.0.0.1}`
- [ ] 3.3 Route body: `withMutex` → `forceMintAndPersist` → `regenerateComposeForChanges` → broadcast `plugin:honcho:status { lastEvent: "remint-success" }` → return `{ ok: true }`
- [ ] 3.4 On mint failure, return `502 { error: "mint-failed", detail: <message> }` and leave config unchanged
- [ ] 3.5 Wire `mountLlmRoutes` into `packages/honcho-plugin/src/server/index.ts registerPlugin`

## 4. Config redaction

- [ ] 4.1 Add `_autoKeyId` to the redaction strip-list in `packages/honcho-plugin/src/server/routes-config.ts` (or wherever the redacted GET is built) so it never appears in `GET /api/plugins/honcho/config`
- [ ] 4.2 Verify status-broadcast payloads also omit `_autoKeyId`; add explicit strip if needed

## 5. Client UI — re-mint button

- [ ] 5.1 In `packages/honcho-plugin/src/client/LlmSection.tsx`, add `isIntegratedProxy(config)` helper: `source === "openai-compatible"` AND parsed `baseUrl.hostname` ∈ `{host.docker.internal, localhost, 127.0.0.1}`
- [ ] 5.2 Render "Re-mint integrated-proxy key" inline action only when `isIntegratedProxy(config)` is true
- [ ] 5.3 Click handler: confirm dialog → `POST /api/plugins/honcho/llm/remint-proxy-key` → on `200`, reload models + show toast "Key re-minted. Restart Honcho to apply."
- [ ] 5.4 On `409 not-integrated-proxy`, hide the button (state out-of-sync — refetch config)
- [ ] 5.5 On `502 mint-failed`, show error toast with `detail`

## 6. Tests

- [ ] 6.1 Unit tests for `probeIntegratedProxy` — `200`, `401`, `403`, network throw, timeout, 5xx mapping
- [ ] 6.2 Unit tests for `revokePriorKey` — id missing, 204 path, 404 path, network throw all non-fatal
- [ ] 6.3 Unit tests for `lookupAutoKey` — match, label-mismatch, not-found
- [ ] 6.4 Unit tests for `backfillAutoKeyId` — hash-match writes id, no-match no-op
- [ ] 6.5 Unit tests for `ensureIntegratedProxyKey` `force: true` path — bypasses skip, calls revoke first, persists `_autoKeyId`
- [ ] 6.6 Integration test for `recoverIfRevoked` — feeds revoked key, asserts re-mint + persist + broadcast emitted
- [ ] 6.7 Route test for `POST /llm/remint-proxy-key` — `200`, `409` for non-integrated source, `409` for remote baseUrl, `502` on mint failure
- [ ] 6.8 Client test for `LlmSection` button visibility across the three baseUrl host classes
- [ ] 6.9 Client test for re-mint click → POST → toast + models reload

## 7. Docs

- [ ] 7.1 Update `docs/file-index-plugins.md` rows for `auto-mint-proxy-key.ts` (add `_autoKeyId`, `force`, `forceMintAndPersist`, `recoverIfRevoked`)
- [ ] 7.2 Add new row for `routes-llm.ts`
- [ ] 7.3 Add new row for `LlmSection.tsx` (or annotate existing) noting re-mint button
- [ ] 7.4 Note in `docs/architecture.md` (or appropriate topic doc) the auto-recovery behaviour and `_autoKeyId` lifecycle

## 8. Manual QA

- [ ] 8.1 Fresh install path: clear `~/.honcho/config.json`, start Honcho, verify auto-mint writes `_autoKeyId`
- [ ] 8.2 Revoke-then-restart: revoke `honcho-auto` key in Settings → Model Proxy, restart Honcho, verify silent re-mint + toast
- [ ] 8.3 Manual button: click "Re-mint integrated-proxy key", verify new key in keys list, prior key shows revoked
- [ ] 8.4 Negative: switch source to `anthropic` with key, verify button hidden and endpoint returns 409
- [ ] 8.5 Negative: switch baseUrl to `https://api.example.com/v1`, verify button hidden
- [ ] 8.6 Upgrade path: hand-craft a config with pre-existing `pi-proxy-…` key but no `_autoKeyId`, restart, verify back-fill writes id without re-mint
