## ADDED Requirements

### Requirement: Build-time manifest hash embedded in client bundle

The Vite plugin SHALL compute a SHA-256 hash of the discovered plugin set at registry-generation time and emit it as a named export `PLUGIN_REGISTRY_HASH` alongside `PLUGIN_REGISTRY` in the generated `plugin-registry.tsx`. The hash input SHALL be a deterministic JSON serialization (sorted keys, lexicographic plugin order) of `{id, version, claims: [{slot, component, predicate?, shouldRender?, command?}]}` for each plugin.

#### Scenario: Hash is deterministic across rebuilds

- **WHEN** discovery runs twice over the same package set on disk
- **THEN** `PLUGIN_REGISTRY_HASH` SHALL be identical in both generated files

#### Scenario: Hash changes when a claim is added

- **WHEN** a plugin gains a new claim entry in its manifest and the bundle is rebuilt
- **THEN** `PLUGIN_REGISTRY_HASH` SHALL differ from the previous value

### Requirement: Server exposes live plugin manifest with current hash

The dashboard server SHALL expose `GET /api/plugins/manifest` returning `{ hash, plugins: [{id, version, claims}] }`. The endpoint SHALL be public (no auth gate) so that any client connected to the server — including remote browsers via tunnel — can probe staleness.

The endpoint hash SHALL be computed by the same deterministic serialization used at build time.

#### Scenario: Endpoint returns live discovery

- **WHEN** a plugin is installed and the server is restarted
- **THEN** `GET /api/plugins/manifest` SHALL return the new plugin in `plugins[]` and a hash matching the new set

#### Scenario: Endpoint hash matches build-time hash when bundle is up to date

- **WHEN** the server is running the same plugin set used to build the client
- **THEN** `GET /api/plugins/manifest`'s `hash` field SHALL equal `PLUGIN_REGISTRY_HASH` exported by the client bundle

### Requirement: Client detects staleness on mount and renders banner

The client SHALL fetch `/api/plugins/manifest` on every connection (initial mount and reconnect) and compare the returned hash to the embedded `PLUGIN_REGISTRY_HASH`. When the hashes differ, the client SHALL render a non-blocking banner at the top of the shell with text "Dashboard plugins were updated. Refresh to load the latest contributions." and a "Refresh" button that triggers `window.location.reload()`.

The banner SHALL be dismissible (per-session) and SHALL re-appear on next reconnect if staleness persists.

#### Scenario: Up-to-date bundle hides banner

- **WHEN** client mounts and server hash equals embedded hash
- **THEN** no staleness banner is rendered

#### Scenario: Stale bundle shows banner

- **WHEN** client mounts and server hash differs from embedded hash
- **THEN** the staleness banner is rendered with a "Refresh" button

#### Scenario: Refresh button reloads page

- **WHEN** the user clicks the banner's "Refresh" button
- **THEN** the client SHALL call `window.location.reload()` and the freshly-loaded page SHALL embed the new hash

### Requirement: Server broadcasts manifest changes over WebSocket

When server-side plugin discovery runs after process start (e.g. after `/api/plugins/install` succeeds, or any code path that calls `refreshPluginDiscovery()`) AND the new hash differs from the previous one, the server SHALL broadcast `{ type: "plugin_manifest_changed", hash: string }` to every subscribed browser client over the existing WebSocket.

The client SHALL update its banner state from the broadcast without needing to refetch `/api/plugins/manifest`.

#### Scenario: Plugin install triggers broadcast

- **WHEN** a plugin is installed via `POST /api/plugins/install` and the server completes rescan
- **THEN** every connected client SHALL receive `plugin_manifest_changed` with the new hash and SHALL render the staleness banner without a manual refetch
