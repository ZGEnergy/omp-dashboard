## Context

Change `honcho-auto-mint-proxy-key` (just landed) auto-mints a `pi-proxy-*`
key labelled `honcho-auto` on first Honcho install, writes it into
`selfHost.llm.{source,baseUrl,apiKey,model}`, and the docker stack uses it
to call the dashboard's integrated `/v1/*` proxy via `host.docker.internal`.

If the user later revokes that key in **Settings → Model Proxy**, the
Honcho container starts 401-ing on every Anthropic / OpenAI call. Today
the failure surfaces as `state=offline` with a generic `lastError` from
`pollHealth` — no actionable hint, no recovery path short of editing
`~/.honcho/config.json` by hand.

This change adds two recovery paths:

1. **Silent auto-recovery** at lifecycle entry (`runAutoStart`,
   `/server/start`) — detect a revoked auto-key, re-mint, persist, broadcast.
2. **Explicit user action** — a "Re-mint integrated-proxy key" button in
   Honcho's `LlmSection` that hits a new server route.

## Goals / Non-Goals

**Goals:**
- Recover automatically when the user revokes the auto-minted key, with no
  hand-editing.
- Give the user a one-click recovery affordance even when auto-detect
  doesn't fire (e.g. key still active but compromised).
- Best-effort revoke the prior auto-key during re-mint (don't pile up
  `honcho-auto` keys in the manage-keys list).
- Stay strictly idempotent on the happy path — never re-mint when the
  current key still works.

**Non-Goals:**
- Sweep all orphaned `honcho-auto` keys on dashboard restart (separate
  housekeeping change).
- Add a "Honcho self-test" round-trip that calls `/v1/messages` (separate
  diagnostic change).
- Replace the underlying auto-mint helper — we extend it, not rewrite.
- Handle non-`honcho-auto`-labelled keys (user-supplied keys remain the
  user's problem).

## Decisions

### D1. Probe `/v1/models` to detect revoked, not the management API

Auto-detect uses **`GET /v1/models` with the current `apiKey` as `Bearer`**
and treats `401` or `403` as "revoked-or-broken". Alternatives:

- *List all keys via `/api/model-proxy/api-keys` and look for our id* —
  rejected because (a) it requires JWT auth (proxy-key auth doesn't apply
  to `/api/*`), and (b) it conflates "revoked" with "scope mismatch" or
  "expired" — the probe nails the actual failure mode.

Network errors are **not** treated as revoked — only confirmed `401`/`403`.
Anything else (timeout, ECONNREFUSED, 5xx) leaves the existing config
alone and lets `pollHealth` surface the original error.

### D2. Re-mint only when the failing key is ours (`label === "honcho-auto"`)

Before re-mint we look up the key by id (`GET /api/model-proxy/api-keys`,
filter by `keys[].label === "honcho-auto"` matching our id). The id is
discoverable: it isn't stored in `selfHost.llm`, so we cross-reference by
prefix or hash. Approach:

- On every successful auto-mint, write the new key's `id` into
  `selfHost.llm._autoKeyId` (underscore prefix → opaque, not user-facing,
  not redacted by the existing config-redaction pass).
- Re-mint only when `_autoKeyId` is set AND the listed key with that id
  has label `honcho-auto`. If the user replaced our key with their own,
  `_autoKeyId` will not match and we leave it alone.

Alternative considered: *match by `label` only* — rejected because users
can rename keys; matching by id is unambiguous.

### D3. UI gate: source = `openai-compatible` AND baseUrl host ∈ `{host.docker.internal, localhost, 127.0.0.1}`

The "Re-mint integrated-proxy key" button only renders when the current
config visibly points at the integrated proxy. Anything else means the
user is on a third-party `openai-compatible` endpoint and re-minting would
silently swap providers.

### D4. New helper `forceMintProxyKey(cfg, deps)` reuses `ensureIntegratedProxyKey`

Don't duplicate the mint+probe path. Refactor `ensureIntegratedProxyKey`
to take an explicit `force?: boolean`; when `force=true` the
`shouldSkipAutoMint` gate is bypassed. The IO wrapper exposes:

- `autoMintAndPersist(cfgPath, logger)` — current behaviour, idempotent.
- `forceMintAndPersist(cfgPath, logger)` — for the manual button + the
  silent-auto-recovery path.

Both call `revokePriorKey(cfg, deps)` first when `cfg.selfHost.llm._autoKeyId`
is set; failure is logged but non-fatal.

### D5. Server route `POST /api/plugins/honcho/llm/remint-proxy-key`

Lives alongside `routes-config.ts` lifecycle/llm endpoints. Behaviour:

1. `withMutex` (same single-flight as `/server/start`).
2. `forceMintAndPersist` — surfaces error in HTTP 502 if mint fails.
3. Triggers `regenerateComposeForChanges(cfg, composePath)` so the next
   `/server/restart` picks up the new env block. Does **not** restart
   the container — caller's choice (button copy: "Re-mint key — restart
   Honcho to apply").
4. Broadcasts `plugin:honcho:status` with a `lastEvent: "remint-success"`
   marker so the UI can toast.

Returns `{ ok: true }` (cleartext key never returned — caller doesn't
need it; redacted config is already broadcast).

### D6. Status broadcast on auto-recovery

When `runAutoStart` / `startStack` detects-and-re-mints, push a
`plugin:honcho:status` event with `lastEvent: "auto-remint"` so the UI
shows a one-time "Honcho's integrated-proxy key was re-minted because the
prior key was revoked." toast. Persisting an "auto-remint count" is out
of scope.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Probe is flaky on cold start (proxy not yet listening) → false-positive re-mint | 1× retry with 1s delay; only re-mint on confirmed `401`/`403`, never network errors / timeouts / 5xx |
| Two concurrent `/server/start`s race on re-mint | `withMutex` serialises lifecycle; new endpoint also `withMutex`-wrapped |
| `_autoKeyId` leaks to client via redacted config GET | Config redactor already strips `apiKey`; add `_autoKeyId` to its allowlist of internal fields (or just to the redaction strip list, since it's not user-facing) |
| Orphan `honcho-auto` keys pile up if best-effort revoke fails | Documented; sweeper is a follow-up change |
| User revokes key while `selfHost.autoStart=false` and never starts → next start re-mints invisibly | Fine — desired behaviour |
| Re-mint without container restart leaves Honcho still 401-ing | Button copy explicitly says "restart Honcho to apply"; auto-recovery path triggers a `composeUp --force-recreate` since it's already in lifecycle flow |

## Migration Plan

Additive — no schema migration.

Existing installs without `_autoKeyId` (already-minted before this
change): on first `/server/start` after upgrade, look up the key by
prefix-match (`apiKey.startsWith("pi-proxy-")`) against the manage-keys
list, find the entry with label `honcho-auto`, and back-fill `_autoKeyId`
into the config. One-shot. If no match found (key was rotated or revoked
between upgrade and start), proceed as if `_autoKeyId` was unset and skip
the prior-key revoke.

## Open Questions

1. **Should the "Re-mint" button auto-restart Honcho?** Current decision:
   no — explicit user action. Worth revisiting if user testing shows
   confusion.
2. **Should we also re-mint when label was changed away from `honcho-auto`
   (user renamed it)?** Current decision: no — treat as user-owned, leave
   alone.
