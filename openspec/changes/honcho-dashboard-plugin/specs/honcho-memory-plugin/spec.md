## ADDED Requirements

### Requirement: Plugin discovered as external npm package

The system SHALL be packaged as `pi-memory-honcho-dashboard`, an external npm package containing a `pi-dashboard-plugin` manifest with `id: "honcho"` and a discoverable client + server entry. The package SHALL be loaded by the existing dashboard plugin loader without changes to the loader itself.

#### Scenario: Manifest discovery

- **WHEN** the dashboard server boots and `pi-memory-honcho-dashboard` is present in the dashboard's `node_modules`
- **THEN** the plugin loader reads its `pi-dashboard-plugin` manifest, validates it against the manifest schema, and registers its slot claims
- **AND** the plugin appears in `GET /api/health.plugins[]`

#### Scenario: Plugin missing from node_modules

- **WHEN** the dashboard server boots and `pi-memory-honcho-dashboard` is not installed
- **THEN** the loader does not register any honcho slot claims
- **AND** no honcho-related routes are mounted under `/api/plugins/honcho/`

### Requirement: Extension-install gate on settings page

The plugin SHALL probe `GET /api/packages/installed` for a package id of `pi-memory-honcho` on every settings-section mount. If the extension is not installed, the settings panel SHALL render only an "Install pi-memory-honcho" call-to-action and SHALL hide all configuration controls.

#### Scenario: Extension not installed

- **WHEN** the user opens Settings → General and `/api/packages/installed` does not include `pi-memory-honcho`
- **THEN** the Honcho settings section renders a single card titled "Honcho memory not installed"
- **AND** the card contains an "Install pi-memory-honcho" button

#### Scenario: Install button click

- **WHEN** the user clicks "Install pi-memory-honcho" on the gate card
- **THEN** the plugin calls `POST /api/packages/install` with `{ source: "npm:pi-memory-honcho" }`
- **AND** on success, the gate card is replaced by the full settings panel after a refresh of `/api/packages/installed`
- **AND** a toast informs the user that running pi sessions must reload to register the extension

#### Scenario: Extension already installed

- **WHEN** the user opens Settings → General and `/api/packages/installed` includes `pi-memory-honcho`
- **THEN** the gate card is not rendered
- **AND** the full Honcho settings panel is visible

### Requirement: Per-session-card slot claims gated on extension

The plugin SHALL contribute two claims on the `session-card-memory` slot (introduced by `redesign-session-card-subcards`): `HonchoBadge` (status pill) and `HonchoCardActions` (Interview / Sync / Map-name buttons). Both contributions SHALL render `null` when `pi-memory-honcho` is not installed.

When at least one Honcho contribution is rendered for a session, the dashboard's `MemorySubcard` (consumer of `session-card-memory`) SHALL render a `MEMORY` titled subcard around them. When the contributions return `null`, the subcard SHALL stay hidden.

#### Scenario: Badge shows current status

- **WHEN** the extension is installed and the plugin status is `connected`
- **THEN** every session card renders a `🧠 connected` badge

#### Scenario: Badge reflects syncing state

- **WHEN** the plugin status transitions from `connected` to `syncing` (e.g., during conversation upload)
- **THEN** the badge text updates to `🧠 syncing` within one render cycle

#### Scenario: Action bar hidden when extension uninstalled

- **WHEN** the extension is not installed
- **THEN** session cards render no honcho action buttons in the action bar

#### Scenario: Action bar buttons render when installed

- **WHEN** the extension is installed
- **THEN** every session card renders three honcho buttons: `[🧠 Interview]`, `[🔄 Sync]`, `[🏷️ Map name]`

### Requirement: Settings panel mirrors TUI commands

The plugin SHALL render a settings section (tab `general`) that exposes equivalents to `/honcho:setup`, `/honcho:status`, `/honcho:doctor`, `/honcho:sync`, `/honcho:mode`, and `/honcho:interview`, plus a collapsible "Advanced" section for the Phase-1 env-var flags.

#### Scenario: Setup form fields

- **WHEN** the user opens the Honcho settings panel with the extension installed
- **THEN** a Connection section is visible with fields: `apiKey` (masked, with reveal toggle), `peerName`, `workspace`, `aiPeer`, `endpoint`, `linkedHosts` (CSV input), `sessionStrategy` (select: `per-directory` / `git-branch` / `pi-session` / `per-repo` / `global`)
- **AND** a Recall section is visible with a radio for `recallMode` (`hybrid` / `context` / `tools`)

#### Scenario: Status header renders live state

- **WHEN** the settings panel is mounted
- **THEN** a header above the form displays `mode`, `state`, `endpoint`, `cacheChars`, and `sessionKey` from the plugin status broadcast

#### Scenario: Doctor button runs preflight

- **WHEN** the user clicks "Run preflight"
- **THEN** the plugin calls `POST /api/plugins/honcho/doctor`
- **AND** the response `{ checks: Array<{ id, status, detail }> }` is rendered as an inline check list with green/red icons

#### Scenario: Sync button forwards to bridge

- **WHEN** the user clicks "Force refresh"
- **THEN** the plugin calls `POST /api/plugins/honcho/sync`
- **AND** the request triggers a context-cache clear and refresh in any active pi session running the extension

#### Scenario: Interview submission

- **WHEN** the user enters a preference into the "Save a preference" field and submits
- **THEN** the plugin calls `POST /api/plugins/honcho/interview` with `{ content }`
- **AND** the server creates a conclusion via `aiPeer.conclusionsOf(userPeer).create(...)` against the configured workspace
- **AND** a confirmation toast is shown on success

#### Scenario: Advanced section flags

- **WHEN** the user expands the "Advanced" details block
- **THEN** inputs are visible for: `writeFrequency`, `dialecticDynamic`, `dialecticMaxChars`, `dialecticMaxInputChars`, `reasoningLevel`, `reasoningLevelCap`, `contextCadence`, `dialecticCadence`, `sessionPeerPrefix`, `observationMode`, `contextTokens`, `contextRefreshTtlSeconds`, `maxMessageLength`, `searchLimit`, `saveMessages`, `injectionFrequency`, `environment`, `logging`
- **AND** each input persists to `~/.honcho/config.json` `hosts.pi.<field>` on save

### Requirement: REST API surface scoped under `/api/plugins/honcho/`

The plugin server entry SHALL register routes under `/api/plugins/honcho/` through the dashboard plugin runtime's standard server-context API. All routes SHALL be auth-gated through the dashboard auth plugin.

#### Scenario: GET /config returns redacted view

- **WHEN** an authenticated client calls `GET /api/plugins/honcho/config`
- **THEN** the response includes `apiKeySet: boolean` and `apiKeyMasked: string` (e.g., `"hch-..."`) but never the raw API key
- **AND** all other config fields are returned in plain form

#### Scenario: POST /config preserves stored secret on empty key

- **WHEN** an authenticated client calls `POST /api/plugins/honcho/config` with body `{ apiKey: "" }` and other fields
- **THEN** the stored `apiKey` is not modified
- **AND** other fields are deep-merged into `~/.honcho/config.json`

#### Scenario: POST /config writes new key when provided

- **WHEN** an authenticated client calls `POST /api/plugins/honcho/config` with body `{ apiKey: "hch-v3-newvalue" }`
- **THEN** the new key is persisted to `~/.honcho/config.json`
- **AND** subsequent `GET /config` returns `apiKeySet: true` with the new key masked

#### Scenario: Unauthenticated request rejected

- **WHEN** a request without valid auth credentials is made to any `/api/plugins/honcho/*` route
- **THEN** the dashboard auth plugin returns 401
- **AND** no plugin handler is invoked

### Requirement: Atomic write to `~/.honcho/config.json`

The plugin SHALL persist all configuration changes to `~/.honcho/config.json` using a temp-file + rename atomic-write pattern. The plugin SHALL deep-merge the partial update into the existing file so that keys not owned by the plugin (e.g., honcho-cli writes, future extension fields) are preserved.

#### Scenario: Partial update preserves unrelated keys

- **WHEN** `~/.honcho/config.json` contains `{ apiKey, peerName, hosts: { pi: {...}, claude_code: {...} } }`
- **AND** the plugin writes `{ hosts: { pi: { recallMode: "tools" } } }`
- **THEN** after the write, `claude_code` and other top-level fields are unchanged
- **AND** `hosts.pi.recallMode === "tools"` while other `hosts.pi.*` fields are unchanged

#### Scenario: Crash mid-write does not corrupt file

- **WHEN** the plugin writes config and the dashboard process is killed during the write
- **THEN** `~/.honcho/config.json` is either the pre-write state or the post-write state, never a torn intermediate

### Requirement: Per-card "Map name" popover

The plugin SHALL contribute an `anchored-popover` slot rendering an inline editor for the per-cwd Honcho session name. The button on the session card SHALL anchor the popover. Save SHALL upsert `hosts.pi.sessions[cwd] = name`. Clear SHALL remove the mapping.

#### Scenario: Open popover with current value

- **WHEN** the user clicks `[🏷️ Map name]` on a session card with `cwd=/path/to/project` and `~/.honcho/config.json` contains `hosts.pi.sessions["/path/to/project"] = "my-project"`
- **THEN** the popover opens with the input pre-filled with `my-project`

#### Scenario: Open popover without existing mapping

- **WHEN** the user clicks `[🏷️ Map name]` on a session card with no existing mapping
- **THEN** the popover opens with the input pre-filled with the derived default per the configured `sessionStrategy`

#### Scenario: Save creates mapping

- **WHEN** the user enters `custom-name` and clicks Save
- **THEN** the plugin calls `POST /api/plugins/honcho/sessions` with `{ cwd, name: "custom-name" }`
- **AND** the server upserts `hosts.pi.sessions[cwd] = "custom-name"`

#### Scenario: Clear removes mapping

- **WHEN** the user clears the input and clicks Save (or clicks an explicit "Clear mapping")
- **THEN** the plugin calls `DELETE /api/plugins/honcho/sessions` with `{ cwd }`
- **AND** the server removes the key from `hosts.pi.sessions`

#### Scenario: Only one popover open at a time

- **WHEN** a popover is open for session A and the user clicks `[🏷️ Map name]` on session B
- **THEN** the popover for A unmounts before the popover for B mounts

### Requirement: Plugin status broadcast

The plugin SHALL publish a `HonchoPluginStatus` payload through the dashboard plugin runtime's status channel. The payload SHALL include `id`, `state`, `mode`, `endpoint`, `cacheChars`, `sessionKey`, and optional `lastError`.

#### Scenario: Status appears in /api/health

- **WHEN** the dashboard's `GET /api/health` endpoint is called and the plugin is loaded
- **THEN** the response `plugins[]` array contains an entry with `id: "honcho"` and the current state object

#### Scenario: Status updates propagate to subscribers

- **WHEN** the plugin transitions from `connected` to `offline` due to a server-side error
- **THEN** the new status is broadcast to subscribed plugin clients within one event-loop tick
- **AND** the settings header and per-card badges re-render with the new state

### Requirement: Cloud-mode and self-host-mode switching

The settings panel SHALL expose a `mode` selector with values `cloud` and `self-host`. Switching to `self-host` SHALL auto-write `hosts.pi.endpoint = http://localhost:<selfHost.apiPort>` (default `8765`) while preserving `apiKey`. Switching back to `cloud` SHALL clear `hosts.pi.endpoint` so the Honcho SDK falls back to the cloud default.

#### Scenario: Switch cloud → self-host

- **WHEN** the user changes `mode` from `cloud` to `self-host`
- **THEN** `hosts.pi.endpoint` is set to `http://localhost:<selfHost.apiPort>` (default `http://localhost:8765`)
- **AND** the previously stored `apiKey` is unchanged
- **AND** the Server section becomes visible in the settings panel

#### Scenario: Switch self-host → cloud

- **WHEN** the user changes `mode` from `self-host` to `cloud`
- **THEN** `hosts.pi.endpoint` is cleared from `~/.honcho/config.json`
- **AND** the running Docker stack (if any) is not stopped automatically
- **AND** the Server section is hidden

### Requirement: TUI commands remain functional

The existing `pi-memory-honcho` TUI slash-commands SHALL continue to operate without modification. The dashboard plugin SHALL NOT remove, replace, or shadow `/honcho:setup`, `/honcho:status`, `/honcho:config`, `/honcho:doctor`, `/honcho:interview`, `/honcho:mode`, `/honcho:sync`, or `/honcho:map`.

#### Scenario: Slash command after dashboard write

- **WHEN** the dashboard plugin has updated `hosts.pi.recallMode` to `tools` via `POST /config`
- **AND** the user runs `/honcho:status` in a TUI session
- **THEN** the command succeeds and reports `recall mode: tools`
