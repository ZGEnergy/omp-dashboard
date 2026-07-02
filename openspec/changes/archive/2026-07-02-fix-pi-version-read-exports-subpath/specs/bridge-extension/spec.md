## MODIFIED Requirements

### Requirement: Bridge reports its session's pi version

The bridge SHALL report the pi-coding-agent version of the process it runs inside, per session, via a `{ type: "pi_version_update", sessionId, version }` message to the server. The version SHALL be read from inside the bridge's own process using an `exports`-safe resolution: resolve the package **entry** (`@earendil-works/pi-coding-agent`, the always-exported `"."` specifier) via the ESM resolver `import.meta.resolve` (which honours the `import` condition), then walk up from the resolved file to the nearest `package.json` whose `name` equals `@earendil-works/pi-coding-agent` and read its `version`. The bridge SHALL NOT resolve the `./package.json` subpath directly (a package whose `exports` omits that subpath makes it unresolvable), NOR use the CJS `createRequire().resolve` on the entry (pi's `"."` export defines only `import`/`types`, so the CJS `require` condition finds no target and also throws `ERR_PACKAGE_PATH_NOT_EXPORTED`). This per-session read is the ground-truth pi for that session — distinct from the server-side `readCurrentPiVersion()` read that drives the global `/api/health.compatibility` advisory.

The bridge SHALL send the message once when the session registers, and again whenever a later read yields a version different from the last value sent (including after an out-of-band pi upgrade). A module-scoped `lastPiVersion` SHALL suppress redundant sends, including across reconnect. The version re-read SHALL piggyback on the existing git/model poll tick (`runGitPollTick`, 30s) — no dedicated timer.

A read failure SHALL log a warning and skip the send without crashing the bridge or interrupting the heartbeat; the next tick retries. A version that cannot be located (entry unresolvable, or no matching `package.json` found while walking up) SHALL yield `undefined` and be skipped silently, NOT raise a recurring error.

#### Scenario: Push at session register
- **WHEN** the bridge registers a session against pi 0.80.2
- **THEN** the bridge SHALL send `{ type: "pi_version_update", sessionId, version: "0.80.2" }`

#### Scenario: Restrictive exports map still yields version
- **WHEN** the installed `@earendil-works/pi-coding-agent` declares `exports` that omit `./package.json` (e.g. only `"."` is exported)
- **THEN** the bridge SHALL still read the version by resolving the `"."` entry and walking up to the matching `package.json`
- **AND** SHALL NOT throw `ERR_PACKAGE_PATH_NOT_EXPORTED`
- **AND** SHALL NOT emit a recurring "pi version read failed" warning on every poll tick

#### Scenario: No push when version unchanged
- **WHEN** a poll tick re-reads the same version already sent
- **THEN** no `pi_version_update` SHALL be sent

#### Scenario: Push after out-of-band upgrade
- **WHEN** the user runs `pi update --self` so the bridge's process now resolves to a newer pi version
- **AND** the next poll tick fires
- **THEN** the bridge SHALL send `pi_version_update` with the new version

#### Scenario: Read failure is silent
- **WHEN** the pi version read throws
- **THEN** the bridge SHALL log a warning, skip the send, and keep the poll loop running

#### Scenario: Reconnect does not redundantly push
- **WHEN** the bridge reconnects against the same pi version it last sent
- **THEN** no `pi_version_update` SHALL be sent because `lastPiVersion` is unchanged
