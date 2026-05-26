# Doctor "API key" check recognises OAuth credentials in auth.json

## Why

Doctor's `API key` check (and the Electron first-run wizard's equivalent gate) only inspects `~/.pi/agent/settings.json` for the legacy API-key fields `anthropicApiKey`, `openaiApiKey`, `apiKey`, or `providers[].apiKey`. It is blind to `~/.pi/agent/auth.json`, which is where pi stores OAuth credentials for **Subscriptions** providers (Anthropic Claude Pro/Max, ChatGPT Plus/Pro via Codex, GitHub Copilot, Gemini CLI, Antigravity) and API-key entries written by `Settings → Providers → API Keys`.

Result: a user who signs in via the Providers tab — `Connected ✓ expires in 5h` shown in the UI — still sees `Diagnostics: No API key configured. Configure one in Settings → Providers.` That message is wrong twice over:

1. The user did configure one, in the exact place the message tells them to go.
2. Pi sessions will work fine: the bridge picks up `auth.json` credentials through pi's normal auth resolution path.

The check is the only thing lying. We also mirror the same broken detector in `packages/electron/src/lib/wizard-state.ts` (`isApiKeyConfigured()` used by the first-run wizard's "Already configured" gate), so OAuth-only users hit the same false negative there.

## What Changes

- **New shared helper** `hasAnyProviderCredential(homeDir = os.homedir())` in `packages/shared/src/credential-detect.ts`. Returns `true` if EITHER:
  - `~/.pi/agent/settings.json` has any of `anthropicApiKey`, `openaiApiKey`, `apiKey`, or `providers[*].apiKey` non-empty (existing behaviour), OR
  - `~/.pi/agent/auth.json` has at least one provider entry with a non-empty `key`, `access`, or `refresh` field. (Empty strings, `null`, `undefined`, or whitespace-only do NOT count.)
- **Doctor route uses the helper**. `packages/server/src/routes/doctor-routes.ts` replaces its local `isApiKeyConfigured()` with `hasAnyProviderCredential()` and wires it into `buildDefaultDeps()`.
- **Electron wizard uses the helper**. `packages/electron/src/lib/wizard-state.ts` `isApiKeyConfigured()` delegates to the shared helper so the wizard's "Already configured" pre-fill and skip behaviour both honour OAuth.
- **Message text refinement**. The Doctor suggestion in `packages/shared/src/doctor-core.ts` (`SUGGESTIONS["API key"]`) and the check's `message` / `detail` strings are updated so the "missing" case mentions both routes (API key OR OAuth sign-in) and the `detail` lists both `settings.json` and `auth.json` as inspected files. The "ok" case message stays generic ("Configured").
- **No change to the OAuth flow itself, to `provider-auth-storage.ts`, or to `auth.json` schema**. The change is purely in detection.
- **No fallback to live token-validity probing**. We only check for non-empty credentials, not for "OAuth token not expired". An expired-but-refreshable token still counts as configured — refreshing is pi's job at session start, not Doctor's job. (Out of scope: a separate "Credentials freshness" check that surfaces expired-and-unrefreshable tokens.)
- **Tests**: unit tests for the helper cover the matrix below. Doctor route test and wizard-state test are updated to use a fixture `auth.json` and assert the new positive case.

## Detection matrix

| settings.json has API key | auth.json has any credential | helper returns |
|---|---|---|
| yes | yes | `true` (existing) |
| yes | no  | `true` (existing) |
| no  | yes | `true` (NEW — fixes the bug) |
| no  | no  | `false` (unchanged) |
| (file missing) | (file missing) | `false` (unchanged) |
| (file present, malformed JSON) | (any) | falls back to other file; `false` only if both fail |

"Non-empty credential" in `auth.json` = at least one provider object `{ type, ... }` has at least one of `key`, `access`, `refresh` whose value is a non-empty trimmed string. The shape mirrors what `provider-auth-storage.ts` writes today (API-key entries: `{type, key}`; OAuth entries: `{type, refresh, access, expires, ...}`).

## Capabilities

### Modified Capabilities

- `doctor-diagnostic`: adds a Requirement covering credential-source inspection so future renderers / Electron-side mirrors stay consistent. The existing "Setup checks are tagged setup" Scenario for `API key` remains unchanged.

## Impact

- **User-visible**: OAuth-only users (Subscriptions-only setups) no longer see a phantom warning in Diagnostics. The wizard's "Already configured" pill now also lights up for OAuth-only sign-ins, so re-running the wizard does not show a misleading "Skip / Save" choice that suggests the user must type a key.
- **Code impact**: ~60 LOC. One new file (`credential-detect.ts` + test), two call-site deletions (route + wizard), three message string tweaks in `doctor-core.ts`.
- **Backwards compatibility**: pre-OAuth `settings.json`-only installs keep working identically. The detector is a strictly-broader OR; anything that returned `true` before still returns `true`.
- **Rollback**: revert the call sites in `doctor-routes.ts` and `wizard-state.ts` to their local implementations. The new shared helper file can stay or be deleted; nothing depends on it long-term.
- **Migration**: none. No file format changes, no data writes.
- **Privacy**: the helper only inspects existence/non-emptiness of credential fields. It NEVER returns, logs, or hashes credential values. Doctor's `detail` field SHALL only mention which files were inspected, never which fields matched.
- **Out of scope**:
  - Validating that OAuth tokens are not expired beyond refresh.
  - Reaching into pi-ai or pi's own auth resolver to ask "would this session actually authenticate?".
  - Surfacing per-provider status ("Anthropic OK, Codex expired") — Settings → Providers already does that.
  - Touching the "Setup wizard" Doctor check, which has a separate completion-file detector.
