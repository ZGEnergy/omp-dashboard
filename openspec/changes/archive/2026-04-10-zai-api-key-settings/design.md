## Context

The dashboard manages LLM provider credentials via `~/.pi/agent/auth.json`. API key providers are defined in a hardcoded `API_KEY_PROVIDERS` array in `src/server/provider-auth-storage.ts`. The client renders rows dynamically from `GET /api/provider-auth/status` u2014 no client changes are needed to add a new provider.

The current masking logic (line 176-179) extracts a prefix up to the first hyphen and appends `...` + last 4 chars. This works for keys like `sk-...abcd` but doesn't show the beginning of the key body, making it harder to identify which key is configured when multiple are similar.

## Goals / Non-Goals

**Goals:**
- Add Z.ai to the API key provider registry
- Improve masked key display to show beginning + `...` + end for all providers

**Non-Goals:**
- No OAuth flow for Z.ai (API key only)
- No changes to `providers.json` (the Z.ai extension handles provider registration)
- No client-side changes

## Decisions

### D1: Registry entry for Z.ai

Add `{ id: "zai", authJsonKey: "zai", name: "Z.ai" }` to the `API_KEY_PROVIDERS` array. The `id` and `authJsonKey` are the same since there's no OAuth variant to conflict with.

### D2: New masking format

Change from prefix-to-hyphen masking to a fixed-width reveal of beginning and end:

| Key | Current | New |
|-----|---------|-----|
| `sk-abc123xyz789` | `sk-...9789` | `sk-ab...789` |
| `gsk_longapikey1234` | `gsk_...1234` | `gsk_l...234` |
| `zai-keyvalue` | `zai-...alue` | `zai-k...lue` |
| `shortkey` | `...tkey` | `sho...key` |

Approach: Show first 5 chars + `...` + last 3 chars. For keys shorter than 12 chars, show `****` to avoid revealing too much. This balances identifiability with security.

## Risks / Trade-offs

- **[Existing key display changes]** u2192 All providers get the new mask format. Users who memorized the old format may need a moment to adjust. Low impact since the masked key is just a visual hint.
- **[Short key handling]** u2192 Keys under 12 chars get fully masked (`****`) to prevent revealing a significant portion of a short key.
