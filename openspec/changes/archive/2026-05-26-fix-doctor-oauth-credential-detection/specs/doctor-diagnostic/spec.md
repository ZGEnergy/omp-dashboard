# doctor-diagnostic — delta

## ADDED Requirements

### Requirement: API key check inspects both settings.json and auth.json
The Doctor's `API key` check SHALL report `status: "ok"` whenever at least one provider credential is configured in either `~/.pi/agent/settings.json` (legacy API-key fields: `anthropicApiKey`, `openaiApiKey`, `apiKey`, or any `providers[*].apiKey`) OR in `~/.pi/agent/auth.json` (any top-level provider entry with a non-empty trimmed `key`, `access`, or `refresh` field). The check SHALL report `status: "warning"` only when neither file yields a non-empty credential. Empty strings, whitespace-only strings, `null`, and `undefined` SHALL NOT count as configured.

The detector SHALL be implemented in a single shared helper (`packages/shared/src/credential-detect.ts`) and consumed by both the server's `/api/doctor` route and the Electron first-run wizard, so the two surfaces cannot drift.

The check's `detail` field SHALL name the inspected file paths but SHALL NOT echo, log, hash, or otherwise leak any credential value, provider key name, or token shape.

#### Scenario: OAuth-only install reports configured
- **WHEN** `~/.pi/agent/auth.json` contains at least one provider entry whose `access` or `refresh` field is a non-empty string AND `~/.pi/agent/settings.json` contains no API-key field
- **THEN** the `API key` check SHALL have `status: "ok"`
- **AND** the check's `suggestion` field SHALL be omitted

#### Scenario: API-key-only install still reports configured
- **WHEN** `~/.pi/agent/settings.json` has `anthropicApiKey` set to a non-empty string AND `~/.pi/agent/auth.json` is absent
- **THEN** the `API key` check SHALL have `status: "ok"` (no regression vs. pre-change behaviour)

#### Scenario: Neither file yields a credential
- **WHEN** both `~/.pi/agent/settings.json` and `~/.pi/agent/auth.json` are absent, OR both are present but neither contains a non-empty credential field
- **THEN** the `API key` check SHALL have `status: "warning"`
- **AND** the check's `suggestion` SHALL direct the user to **Settings → Providers** and mention BOTH OAuth sign-in AND API-key configuration as valid resolutions
- **AND** the check's `detail` SHALL list both inspected file paths

#### Scenario: Empty credential strings do not count
- **WHEN** `~/.pi/agent/auth.json` contains a provider entry like `{ "anthropic": { "type": "oauth", "access": "", "refresh": "   " } }` AND no other credential exists anywhere
- **THEN** the `API key` check SHALL have `status: "warning"`

#### Scenario: Malformed auth.json falls back to settings.json
- **WHEN** `~/.pi/agent/auth.json` is present but not valid JSON AND `~/.pi/agent/settings.json` contains a valid `anthropicApiKey`
- **THEN** the `API key` check SHALL have `status: "ok"` (the detector treats per-file parse failure as "no credential from that file" without throwing)

#### Scenario: Detail does not leak credentials
- **WHEN** the `API key` check is rendered in any state (ok or warning)
- **THEN** the `detail` field text SHALL NOT contain any substring of any credential value present in either inspected file
- **AND** the `detail` SHALL NOT name which specific provider entry matched (only that the file was inspected)
