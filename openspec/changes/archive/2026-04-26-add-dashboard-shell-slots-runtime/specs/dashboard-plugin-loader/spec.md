## ADDED Requirements

### Requirement: Plugin runtime is a separate workspace package

The plugin runtime SHALL live in its own monorepo workspace package `packages/dashboard-plugin-runtime/`. The package SHALL export at minimum the following entry points:

- `@blackbelt-technology/dashboard-plugin-runtime` — barrel exporting the loader, slot registry, slot consumer components, and `PluginContextProvider`.
- `@blackbelt-technology/dashboard-plugin-runtime/context` — client-side `PluginContext` API (`useSessionState`, `useAllSessions`, `usePluginConfig`, `send`, `pluginRouter`, `logger`).
- `@blackbelt-technology/dashboard-plugin-runtime/server` — server-side `ServerPluginContext` factory and `loadServerEntries`.
- `@blackbelt-technology/dashboard-plugin-runtime/vite-plugin` — Vite plugin used by `packages/client/vite.config.ts`.

Plugins SHALL import from these public entry points only. Plugins SHALL NOT import from `packages/server` or `packages/client` directly. The repo's lint suite SHALL fail when a plugin source file imports from any internal-only path.

#### Scenario: Plugin imports from public runtime entry point

- **WHEN** a plugin's client source declares `import { usePluginConfig } from "@blackbelt-technology/dashboard-plugin-runtime/context"`
- **THEN** the build SHALL resolve the import successfully and the lint suite SHALL pass.

#### Scenario: Plugin imports from internal path triggers lint failure

- **WHEN** a plugin's source contains `import { ... } from "@blackbelt-technology/pi-dashboard-client/App"`
- **THEN** the lint suite SHALL fail with an error directing the author to use `@blackbelt-technology/dashboard-plugin-runtime/context`.

### Requirement: Vite plugin generates a static plugin registry

The `vite-plugin-dashboard-plugins` SHALL generate `packages/client/src/generated/plugin-registry.tsx` at dev start and on every build. The generated file SHALL use **named imports** for each claimed component (not `import * as`) so that Vite tree-shakes unused exports from plugin packages.

The generated file SHALL be committed to source control under a `.gitignore` rule for the `generated/` directory and produced fresh on every build.

#### Scenario: Generated file uses named imports

- **WHEN** a plugin claims `{ "slot": "session-card-badge", "component": "OpenSpecBadge" }`
- **THEN** the generated `plugin-registry.tsx` SHALL contain a named import like `import { OpenSpecBadge } from "@blackbelt-technology/openspec-plugin/client"`, not a wildcard `import *`.

#### Scenario: Unused exports tree-shaken from production bundle

- **WHEN** a plugin's client entry exports `Foo` and `Bar`, and only `Foo` is claimed in the manifest
- **THEN** the production bundle SHALL contain `Foo` and SHALL NOT contain `Bar` (asserted by a build artifact scan in the test suite).

#### Scenario: Manifest change regenerates registry and triggers HMR

- **WHEN** a plugin's `package.json#pi-dashboard-plugin` field is edited during `vite dev`
- **THEN** the Vite plugin SHALL detect the change, regenerate `plugin-registry.tsx`, and trigger an HMR update so the client picks up the new manifest without a full reload.

#### Scenario: Plugin source change does not regenerate registry

- **WHEN** a file inside a plugin package's `src/` is edited (no manifest change)
- **THEN** the Vite plugin SHALL NOT regenerate `plugin-registry.tsx`; HMR SHALL flow through Vite's normal module graph.

### Requirement: `plugins` is a reserved top-level key in dashboard config

The dashboard config loader (`~/.pi/dashboard/config.json`) SHALL recognize `plugins` as a top-level reserved key. The loader SHALL parse `plugins.<id>` subtrees and expose them via `getPluginConfig<T>(id)` to the runtime.

The loader SHALL NOT touch other top-level keys (`port`, `auth`, `bypassHosts`, `openspec`, etc.). Existing plugin-shaped top-level keys (e.g. legacy `openspec.*`) remain at top-level until each `extract-*-as-plugin` change migrates them via its server entry's auto-migrator.

#### Scenario: Plugin config persists under plugins.<id>

- **WHEN** plugin "demo" calls `pluginContext.updatePluginConfig({ foo: 1 })`
- **THEN** `~/.pi/dashboard/config.json` SHALL contain `plugins: { demo: { foo: 1 } }` (atomically written via tmp + rename).

#### Scenario: Existing top-level keys preserved

- **WHEN** the config file already contains `{ "port": 8000, "openspec": { "pollIntervalSeconds": 30 } }` and plugin "demo" writes its config
- **THEN** the resulting file SHALL contain `{ "port": 8000, "openspec": {...}, "plugins": { "demo": {...} } }` with the legacy `openspec` key untouched.

### Requirement: REST endpoint for plugin config writes is auth-gated

The endpoint `POST /api/config/plugins/:id` SHALL go through the same Fastify auth chain as `POST /api/config`. The endpoint SHALL reject requests that fail the dashboard's `createNetworkGuard` or auth plugin.

#### Scenario: Unauthenticated request rejected

- **WHEN** a non-loopback, non-trusted-network client without auth credentials calls `POST /api/config/plugins/demo`
- **THEN** the server SHALL return 401 (or the same status the existing config endpoint returns for the same request).

#### Scenario: Authenticated request succeeds

- **WHEN** an authenticated client calls `POST /api/config/plugins/demo` with a valid body
- **THEN** the server SHALL persist the config, broadcast `plugin_config_update`, and return 200 with `{ success: true, config: <merged> }`.

### Requirement: `plugin_config_update` broadcast is added to the browser protocol union

The message type `plugin_config_update` SHALL appear in the `ServerToBrowserMessage` union in `packages/shared/src/browser-protocol.ts`. The payload SHALL be `{ type: "plugin_config_update"; id: string; config: unknown }`.

A test SHALL exist asserting that every message type used by the server-to-browser path appears in the union (preventing the recurring esbuild-strips-as-any-cases bug noted in AGENTS.md).

#### Scenario: Message type appears in protocol union

- **WHEN** the project's vitest suite runs the protocol-completeness test
- **THEN** the test SHALL assert that `"plugin_config_update"` is a member of the `ServerToBrowserMessage` union.

#### Scenario: Broadcast contains only the calling plugin's namespace

- **WHEN** plugin A writes to its config and the server broadcasts `plugin_config_update`
- **THEN** the broadcast payload `config` field SHALL contain only the `plugins.A.*` subtree, never any other plugin's namespace, and a unit test SHALL assert this property.

### Requirement: Bridge auto-register uses dashboard- key prefix

The plugin loader SHALL extend the existing `~/.pi/agent/settings.json` writer (currently `packages/shared/src/bridge-register.ts`) so that every plugin declaring a `bridge` entry is registered under a managed key with the prefix `dashboard-<plugin-id>`.

The loader SHALL NEVER write or delete entries that lack the `dashboard-` prefix. The loader SHALL detect when a `dashboard-<plugin-id>` entry already exists with a path that does not match the plugin's resolved bridge path; in that case the loader SHALL log a warning, skip the registration for that plugin, and surface the conflict via `/api/health.plugins[].error`.

The atomic write helper used by the existing dashboard-bridge entry SHALL be reused — the loader SHALL NOT re-implement file writes.

#### Scenario: Plugin bridge entry registered under managed key

- **WHEN** plugin "demo" declares `"bridge": "./dist/bridge/index.js"` and the dashboard starts
- **THEN** `~/.pi/agent/settings.json` `extensions[]` SHALL contain an entry whose key starts with `dashboard-demo` and whose path equals the absolute resolved path of the plugin's bridge entry.

#### Scenario: User-owned entries preserved

- **WHEN** the user has manually added an extension entry under a key like `my-custom-extension` and the dashboard starts
- **THEN** the loader SHALL leave that entry untouched and SHALL NOT delete it on plugin disable.

#### Scenario: Pre-existing dashboard- entry with mismatched path triggers warning

- **WHEN** `~/.pi/agent/settings.json` already contains `dashboard-demo` pointing at a stale path different from the plugin's current resolved path
- **THEN** the loader SHALL log a warning, leave the existing entry in place, mark plugin "demo" failed in `/api/health` with an error message identifying the path mismatch, and continue loading other plugins.

#### Scenario: Disable removes managed entry

- **WHEN** the user sets `plugins.demo.enabled = false` and restarts the dashboard
- **THEN** the loader SHALL remove the `dashboard-demo` entry from `settings.json`, atomic-write the file, and SHALL NOT touch any other entry.

### Requirement: Loader caches plugin discovery for both Vite and server startup

The loader SHALL implement a single discovery routine that globs `packages/*/package.json` once per process. The Vite plugin (build-time/dev-time) and the server-side `loadServerEntries` (runtime) SHALL both consume the same discovery output. The loader SHALL NOT glob the manifest set twice on a single startup.

#### Scenario: Discovery runs once per process

- **WHEN** the dashboard starts in dev mode (Vite + server in the same process)
- **THEN** the manifest glob SHALL execute exactly once and both consumers SHALL read the same in-memory result.

#### Scenario: Discovery is deterministic

- **WHEN** discovery runs twice with the same package set on disk
- **THEN** the resulting plugin order SHALL be identical (sorted by `priority` ascending, then `id` ascending).

### Requirement: `/api/health.plugins[]` field is populated with one entry per discovered plugin

The dashboard `GET /api/health` response SHALL include a `plugins` array. Each discovered plugin (regardless of enable state or load success) SHALL produce exactly one entry of the form `{ id, enabled, loaded, error?, claims }`.

The `claims` count SHALL reflect the number of slot claims the plugin manifest declares, not the number that successfully resolved at registration time. A failed plugin SHALL still report its declared `claims` count.

#### Scenario: Healthy plugin reports loaded:true

- **WHEN** plugin "demo" loads successfully with two slot claims
- **THEN** `/api/health` SHALL contain `{ id: "demo", enabled: true, loaded: true, claims: 2 }` and no `error` field.

#### Scenario: Failed plugin reports loaded:false with error

- **WHEN** plugin "demo"'s server entry throws on registration
- **THEN** `/api/health` SHALL contain `{ id: "demo", enabled: true, loaded: false, error: "<message>", claims: 2 }`.

#### Scenario: Disabled plugin reports loaded:false without error

- **WHEN** the user disables plugin "demo" via config
- **THEN** `/api/health` SHALL contain `{ id: "demo", enabled: false, loaded: false, claims: 2 }` and no `error` field.

### Requirement: Loader does not crash dashboard on plugin failure

A plugin throwing during manifest validation, server-side dynamic import, server-side `registerPlugin` execution, bridge auto-register, or client-side render SHALL NOT prevent the dashboard server from starting or the dashboard client from rendering its core UI.

The loader SHALL catch each failure individually, attribute it to the offending plugin, and continue loading the remaining plugins. The dashboard's core REST and WebSocket endpoints SHALL remain operational.

#### Scenario: Server entry throws during load

- **WHEN** plugin "demo"'s server entry throws synchronously on import
- **THEN** the dashboard server SHALL still complete startup, `/api/health` SHALL show plugin "demo" failed with the error, and core endpoints (`/api/sessions`, `/api/config`) SHALL respond 200.

#### Scenario: Manifest validation fails for one plugin

- **WHEN** plugin "demo"'s manifest references an unknown slot id
- **THEN** the dashboard SHALL log a fatal validation error naming the package and the unknown slot, mark the plugin as failed in `/api/health`, and continue loading all other plugins.

#### Scenario: Bridge auto-register fails for one plugin

- **WHEN** plugin "demo"'s bridge file path does not exist on disk
- **THEN** the loader SHALL log a warning, mark the plugin failed in `/api/health` with an error identifying the missing file, and SHALL still complete loading other plugins and start the server.
