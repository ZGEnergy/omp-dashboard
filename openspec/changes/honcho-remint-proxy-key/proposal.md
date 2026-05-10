# Re-mint integrated-proxy key for Honcho on revoke

## Why

Change `honcho-auto-mint-proxy-key` auto-mints a `pi-proxy-*` key on first
Honcho install and writes it into `selfHost.llm`. If the user revokes that
key in **Settings → Model Proxy → Revoke**, the next Honcho start silently
breaks — the docker container 401s on every `/v1/messages` call and Honcho
falls into `offline` state with no actionable hint.

We need an explicit "re-mint key" affordance so the user can recover
without hand-editing `~/.honcho/config.json`.

## What changes

### 1. Detect revoked auto-key on Honcho start

`auto-mint-proxy-key.ts` adds `isLikelyRevoked(cfg, deps)`:
- when `cfg.selfHost.llm.source === "openai-compatible"`,
- AND `baseUrl` matches `http(s)?://(host\.docker\.internal|localhost)(:\d+)?/v1`,
- AND `apiKey` starts with `pi-proxy-`,
- AND a single `GET /v1/models` probe returns 401/403.

When detected and the failing key was auto-minted (label `honcho-auto`,
checked via `GET /api/model-proxy/api-keys`), re-mint and overwrite.

### 2. UI button: "Re-mint integrated-proxy key"

`packages/honcho-plugin/src/client/LlmSection.tsx` — add a small inline
action visible only when source = `openai-compatible` AND baseUrl host is
`host.docker.internal` or `localhost`. Click → `POST
/api/plugins/honcho/llm/remint-proxy-key` → confirm → reload models.

### 3. Server route

`POST /api/plugins/honcho/llm/remint-proxy-key`:
- runs `ensureIntegratedProxyKey({})` (force-skip `shouldSkipAutoMint`),
- writes `selfHost.llm`,
- best-effort revokes the previous key (if it was `honcho-auto`-labelled),
- returns redacted config + `key` cleartext for one-shot display? No — caller doesn't need cleartext.

### 4. Docs row

`docs/file-index-plugins.md` — annotate `auto-mint-proxy-key.ts` row with
`isLikelyRevoked` + new force flag.

## Impact

- Affected specs: `honcho-memory-plugin` (LLM section + lifecycle)
- Affected code: `auto-mint-proxy-key.ts`, `LlmSection.tsx`,
  `routes-config.ts` or new `routes-llm.ts`, plugin status surface
- Migration: none — new feature, idempotent
- Risk: re-mint on every start if probe is flaky → use 1× retry + 5s
  timeout, only re-mint on confirmed 401/403 (not network error)

## Out of scope

- Auto-revoke any orphaned `honcho-auto` keys on dashboard restart
  (separate housekeeping change)
- Surface a "Honcho self-test" button that round-trips a /v1/messages
  call (separate diagnostic change)
