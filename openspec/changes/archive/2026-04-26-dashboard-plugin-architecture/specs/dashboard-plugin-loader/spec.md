## ADDED Requirements

### Requirement: Plugin manifest format

A first-party plugin SHALL be a monorepo package with a `pi-dashboard-plugin` field in its `package.json` (or, alternatively, a `dashboard-plugin.json` adjacent to `package.json`). The manifest SHALL conform to the following schema:

```ts
interface PluginManifest {
  id: string;                    // kebab-case, globally unique
  displayName: string;
  priority?: number;             // default 1000; first-party uses 100
  client?: string;               // path to bundled client entry (relative to package root)
  server?: string;               // optional path to server entry
  bridge?: string;               // optional path to pi-extension entry
  configSchema?: string;         // optional path to JSON Schema for config
  claims: PluginClaim[];
}

interface PluginClaim {
  slot: SlotId;                  // must match a known slot id
  component?: string;            // exported component name from client entry (for React slots)
  command?: string;              // for "command-route" slot
  trigger?: string;              // for "anchored-popover" slot
  config?: Record<string, unknown>; // slot-specific config
  predicate?: string;            // optional name of an exported predicate function
}
```

#### Scenario: Manifest read from package.json

- **WHEN** the loader scans `packages/openspec-plugin/package.json`
- **THEN** it SHALL parse the `pi-dashboard-plugin` field and treat it as the manifest.

#### Scenario: Adjacent dashboard-plugin.json takes precedence

- **WHEN** both `package.json#pi-dashboard-plugin` and `dashboard-plugin.json` exist in the same package
- **THEN** the loader SHALL use `dashboard-plugin.json` and log a warning about the duplication.

#### Scenario: Invalid manifest is rejected at load time

- **WHEN** a manifest references an unknown slot id, missing required fields, or an unparseable schema
- **THEN** the loader SHALL log a fatal validation error naming the package and the violation, mark the plugin as failed, and continue loading other plugins.

### Requirement: Plugin discovery scans monorepo packages on startup

On dashboard server startup, the loader SHALL glob `packages/*/package.json` (relative to the dashboard repo root, or to the resolved server install location for production builds) and identify every package that declares a `pi-dashboard-plugin` field.

#### Scenario: Package without manifest is skipped silently

- **WHEN** `packages/some-utility/package.json` has no `pi-dashboard-plugin` field
- **THEN** the loader SHALL not consider it a plugin and SHALL not produce any output.

#### Scenario: Disabled plugin is skipped

- **WHEN** `~/.pi/dashboard/config.json` contains `plugins.<id>.enabled = false`
- **THEN** the loader SHALL skip discovery, server-side load, client bundling, and bridge registration for that plugin, and log a single info-level message.

#### Scenario: Discovery is deterministic

- **WHEN** the loader runs twice with the same set of packages
- **THEN** the resulting plugin order SHALL be identical (by `priority` then alphabetical id).

### Requirement: Server-side plugin entry registration

If a plugin manifest declares a `server` entry, the loader SHALL dynamic-import that module after server bootstrap completes (after Fastify, session manager, and event store are ready). The module SHALL export at minimum a default registration function:

```ts
export default function registerPlugin(ctx: ServerPluginContext): void | Promise<void>;
```

The `ServerPluginContext` SHALL expose:

- `fastify: FastifyInstance` (for REST routes)
- `sessionManager`, `eventStore`, `broadcastToSubscribers`, `directoryService` (read or subscribe to existing dashboard state)
- `registerPiHandler(messageType, handler)` (for handling extension WebSocket messages)
- `registerBrowserHandler(messageType, handler)` (for handling browser WebSocket messages)
- `pluginConfig: T` (typed via plugin's `configSchema`)
- `logger: Logger` (namespaced to the plugin id)

The plugin SHALL register all routes, handlers, and polling within the registration function. The loader SHALL await the function (if async) before proceeding.

#### Scenario: Plugin registers REST routes

- **WHEN** OpenSpec's server entry calls `ctx.fastify.register(routes, { prefix: "/api/openspec" })`
- **THEN** routes SHALL be available at `/api/openspec/*` after server start.

#### Scenario: Plugin registration throws

- **WHEN** a plugin's `registerPlugin` throws or rejects
- **THEN** the loader SHALL log the error with plugin id, mark the plugin as failed, expose the failure via `/api/health`'s `plugins[]` field, and continue loading other plugins.

#### Scenario: Disabled plugin's server entry is not loaded

- **WHEN** `plugins.openspec.enabled = false`
- **THEN** the loader SHALL not import the server entry at all (no side effects, no module evaluation).

### Requirement: Client-side plugin entries are bundled by Vite

A custom Vite plugin (`vite-plugin-dashboard-plugins`) SHALL discover plugin manifests at build (and dev-server) time and generate `packages/client/src/generated/plugin-registry.tsx` containing static imports for each plugin's client entry plus a typed registry export. The Vite plugin SHALL run before the React plugin and the bundler SHALL tree-shake unused exports.

#### Scenario: Generated registry imports plugin clients

- **WHEN** `packages/openspec-plugin/dist/client/index.js` exists and is referenced in the manifest
- **THEN** the generated registry SHALL contain a static import of that path and a registry entry for the plugin.

#### Scenario: Disabled plugins still bundled but inert

- **WHEN** a plugin is disabled in config
- **THEN** the build SHALL still include its client bundle (the build cannot read runtime config), but the runtime registry SHALL filter it out before slot consumers see it.

#### Scenario: Hot reload regenerates on manifest change

- **WHEN** a plugin manifest changes during `vite dev`
- **THEN** the Vite plugin SHALL regenerate the registry and trigger HMR.

### Requirement: Bridge entries auto-register as pi extensions

If a plugin manifest declares a `bridge` entry, the dashboard server SHALL on startup write the plugin's bridge path into `~/.pi/agent/settings.json` under the `extensions[]` array (under a path it owns, like `dashboard-<plugin-id>`), so the bridge loads on every pi session start.

The dashboard SHALL remove the entry on plugin disable. The dashboard SHALL never overwrite extension entries owned by other tools or by the user.

#### Scenario: Plugin bridge appears in pi extensions

- **WHEN** OpenSpec plugin declares `"bridge": "./dist/bridge/index.js"` and the dashboard starts
- **THEN** `~/.pi/agent/settings.json` SHALL contain an entry pointing at the absolute resolved path of that file under a managed key like `dashboard-openspec`.

#### Scenario: Disabling plugin removes bridge entry

- **WHEN** the user disables OpenSpec plugin via settings
- **THEN** the dashboard SHALL remove the `dashboard-openspec` entry from `settings.json` on next restart.

#### Scenario: User-owned entries are preserved

- **WHEN** the user has manually added a different extension to `settings.json`
- **THEN** the dashboard SHALL only touch entries it manages (via the `dashboard-<plugin-id>` key prefix); user-owned entries SHALL remain untouched.

### Requirement: Plugin context API for read-only state and action dispatch

Plugins SHALL receive a typed `PluginContext` (client side) and `ServerPluginContext` (server side). Plugins MUST NOT import from internal dashboard paths (`App.tsx`, internal hooks, internal components). The plugin context is the contract; everything else is internal.

The client `PluginContext` SHALL provide at minimum:

- `useSessionState(sessionId): SessionState | undefined` — React hook for current session state.
- `useAllSessions(): DashboardSession[]` — React hook for the full session list.
- `usePluginConfig<T>(): T` — typed config from `~/.pi/dashboard/config.json` `plugins.<id>.*`.
- `send(message: BrowserToServerMessage)` — typed dispatcher.
- `pluginRouter: { open, close }` — open or close the current `content-view` route.
- `logger: Logger` — namespaced to the plugin id.

#### Scenario: Plugin reads session state

- **WHEN** a plugin's `session-card-badge` component calls `pluginContext.useSessionState(session.id)`
- **THEN** it SHALL receive the same reactive session state the shell uses.

#### Scenario: Plugin dispatches a browser-to-server message

- **WHEN** a plugin calls `pluginContext.send({ type: "ui_management", ... })`
- **THEN** the message SHALL be sent over the active WebSocket connection identical to the shell's own dispatches.

#### Scenario: Plugin imports from internal path triggers test failure

- **WHEN** a plugin's source imports from `packages/client/src/App.js` or any internal-only module
- **THEN** the repo's lint suite SHALL fail with an explicit error directing the author to use `pluginContext` instead.

### Requirement: Plugin settings persist under `plugins.<id>.*` namespace

Plugin settings SHALL be persisted in `~/.pi/dashboard/config.json` under the top-level key `plugins.<id>.*`. The dashboard core SHALL never write to or read from another plugin's namespace; only the owning plugin (matched by manifest `id`) may read or write its own subtree.

If a plugin manifest declares a `configSchema` (JSON Schema 7 file path), the loader SHALL:

1. On read: parse stored config, validate against the schema, apply defaults from the schema for any missing keys.
2. On write: validate the merged config against the schema before persistence; reject the write with a typed error if invalid.
3. On schema change between plugin versions: run any `configMigrations[]` declared in the manifest in order, atomically.

#### Scenario: Default values applied from schema

- **WHEN** a plugin declares `pollIntervalSeconds: { type: "number", default: 30 }` in its `configSchema` and the user has never written that key
- **THEN** `pluginContext.usePluginConfig<T>()` SHALL return `{ pollIntervalSeconds: 30, ... }`.

#### Scenario: Invalid write rejected

- **WHEN** a plugin calls `pluginContext.updatePluginConfig({ pollIntervalSeconds: "not a number" })`
- **THEN** the loader SHALL reject the promise with a `ValidationError`, the on-disk config SHALL remain unchanged, and no `plugin_config_update` SHALL broadcast.

#### Scenario: Cross-plugin namespace access denied

- **WHEN** plugin A attempts to write to `plugins.B.*`
- **THEN** the server SHALL reject with HTTP 403 and log a security warning identifying the offending plugin.

### Requirement: REST endpoint for plugin config writes

The dashboard server SHALL expose `POST /api/config/plugins/:id` accepting a partial config object. The endpoint SHALL:

1. Validate the `:id` matches an installed, enabled plugin.
2. Validate the body against that plugin's `configSchema`.
3. Read existing config, merge the partial, write atomically (tmp + rename).
4. Broadcast `plugin_config_update { id, config }` to all subscribers.
5. Return `{ success: true, config: <merged> }`.

Writes to core config (`auth`, `port`, `bypassHosts`, etc.) continue via the existing `POST /api/config`; the two endpoints are independent and SHALL NOT cross-update.

#### Scenario: Plugin config write succeeds

- **WHEN** a `POST /api/config/plugins/openspec` body `{ "pollIntervalSeconds": 60 }` arrives
- **THEN** the server SHALL persist `plugins.openspec.pollIntervalSeconds = 60`, return 200, and broadcast `plugin_config_update`.

#### Scenario: Unknown plugin id rejected

- **WHEN** `POST /api/config/plugins/no-such-plugin`
- **THEN** the server SHALL return HTTP 404.

#### Scenario: Disabled plugin write rejected

- **WHEN** `POST /api/config/plugins/openspec` arrives but `plugins.openspec.enabled = false`
- **THEN** the server SHALL return HTTP 409 with an explicit "plugin disabled" message.

### Requirement: Reactive plugin config broadcast

When any plugin's config changes (whether via REST endpoint or server-side `updatePluginConfig`), the dashboard server SHALL broadcast `plugin_config_update { id, config }` to all subscribed browsers. The client-side `pluginContext.usePluginConfig<T>()` hook SHALL subscribe to this event and re-render its consumers with the new config within one frame.

The broadcast payload SHALL contain only the calling plugin's namespace, never other plugins' configs.

#### Scenario: All clients receive the update

- **WHEN** plugin A writes its config and three browsers are subscribed
- **THEN** all three browsers SHALL receive `plugin_config_update { id: "A", config }`.

#### Scenario: Hook re-renders on update

- **WHEN** a `usePluginConfig<T>()` hook in plugin A's settings React component is mounted, and a config write happens
- **THEN** the component SHALL re-render with the new config; React state derived from old config SHALL be replaced.

#### Scenario: Cross-plugin config not exposed in broadcast

- **WHEN** plugin A writes its config
- **THEN** the broadcast payload SHALL NOT contain plugin B's namespace; clients can only learn other plugins' configs by subscribing to those plugins (which is not currently supported).

### Requirement: Plugin loader exposes status via `/api/health`

The dashboard `/api/health` endpoint SHALL include a `plugins` array with one entry per discovered plugin:

```ts
interface PluginStatus {
  id: string;
  enabled: boolean;
  loaded: boolean;
  error?: string;
  claims: number;        // count of slots claimed
}
```

#### Scenario: Healthy plugin

- **WHEN** OpenSpec plugin loaded successfully
- **THEN** `/api/health.plugins[].openspec` SHALL be `{ id: "openspec", enabled: true, loaded: true, claims: 7 }`.

#### Scenario: Failed plugin

- **WHEN** a plugin's server entry throws on registration
- **THEN** `/api/health.plugins[].<id>` SHALL be `{ id, enabled: true, loaded: false, error: "<message>", claims: 0 }`.

#### Scenario: Disabled plugin

- **WHEN** a plugin is disabled in config
- **THEN** the entry SHALL be `{ id, enabled: false, loaded: false, claims: 0 }`.

### Requirement: Plugin failure does not crash the shell

A plugin failing to load (server throw, client import error, missing entry) SHALL NOT prevent other plugins or the dashboard shell from working. Failures SHALL be logged with full context and surfaced via `/api/health`. The shell SHALL continue with the failed plugin's slots empty.

#### Scenario: Server-side load failure

- **WHEN** OpenSpec plugin's server entry throws
- **THEN** the dashboard server SHALL still start, OpenSpec slots SHALL render empty, and other plugins SHALL load normally.

#### Scenario: Client-side runtime failure

- **WHEN** a plugin's React component throws on first render
- **THEN** an error boundary in the slot consumer SHALL catch it, render nothing for that contribution, and log to console — the shell SHALL not white-screen.
