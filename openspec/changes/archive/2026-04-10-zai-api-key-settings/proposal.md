## Why

The pi agent now supports Z.ai as an LLM provider via extension, but the dashboard has no way to store its API key. Users must manually edit `auth.json`. Additionally, the current API key masking only shows a prefix and last 4 characters — showing both the beginning and end would make it easier to identify which key is configured.

## What Changes

- Add Z.ai (`zai`) to the `API_KEY_PROVIDERS` registry so it appears in Settings → Providers
- Change API key masking logic to show beginning + `...` + end for all providers (currently shows prefix-to-first-hyphen + `...` + last 4)

## Capabilities

### New Capabilities

_None — this extends existing capabilities._

### Modified Capabilities

- `provider-auth-server`: Add `zai` to the API key provider registry; change masked key format
- `provider-auth-ui`: Updated mask display (no code changes needed — driven by server response)

## Impact

- `src/server/provider-auth-storage.ts` — add registry entry, update masking logic
- `GET /api/provider-auth/status` response gains a new `zai` provider entry
- `~/.pi/agent/auth.json` will accept `"zai": { "type": "api_key", "key": "..." }`
- All existing providers will show updated masked key format
