# dashboard-plugin-loader Specification

## Purpose

This capability covers the **plugin loader runtime**: monorepo manifest discovery, server-side dynamic-import bootstrap, client-side static-registry generation (Vite plugin), bridge entry auto-register/deregister into pi's `~/.pi/agent/settings.json`, plugin context API (`PluginContext` / `ServerPluginContext`), the `plugins.<id>.*` config namespace with JSON-Schema validation and reactive broadcast, and `/api/health.plugins[]` status reporting.

The requirements below are layered: the design-level (contract) requirements come from change `dashboard-plugin-architecture`, and the implementation-level (runtime) requirements come from change `add-dashboard-shell-slots-runtime`. The motivating design notes live in `openspec/changes/dashboard-plugin-architecture/design.md`.
## Requirements
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

`packages/client/vite.config.ts` SHALL invoke `viteDashboardPluginsPlugin()` and include its result in the `plugins[]` array. Failure to do so means the generated file is never produced, regardless of the plugin's correctness. The invocation SHALL use a deferred / dynamic import so a fresh checkout (where `dashboard-plugin-runtime` is not yet built) does not break vite startup; in that fallback state the plugin is skipped and the registry stays at its committed-stub initial value.

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

#### Scenario: vite.config.ts must invoke the plugin

- **WHEN** a workspace plugin manifest exists under `packages/<pkg>/package.json#pi-dashboard-plugin` AND `vite.config.ts` does not register `viteDashboardPluginsPlugin` in `plugins[]`
- **THEN** the generated `plugin-registry.tsx` SHALL remain at its committed-stub state with `PLUGIN_REGISTRY = []` after `vite build`
- **AND** the regression test `packages/client/src/__tests__/plugin-registry-populated.test.ts` SHALL fail (post-build) with a clear message identifying the missing wiring.

#### Scenario: Fresh checkout without runtime built

- **WHEN** `vite dev` is invoked on a clone where `packages/dashboard-plugin-runtime/dist/` does not exist yet
- **THEN** the dynamic import of `viteDashboardPluginsPlugin` SHALL fail silently and vite SHALL start with the committed-stub registry
- **AND** no error SHALL be logged to stderr beyond a single `[plugin-registry] runtime not built — registry empty` info message.

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
                                 // — answers "does this claim apply to this target?"
                                 //   (filters claims at registry level)
  shouldRender?: string;         // optional name of an exported sync function
                                 // — answers "will this claim's component produce
                                 //   visible output for this target?"
                                 //   Used by useSlotHasClaimsForSession (and
                                 //   sibling helpers) to gate the wrapper subcard
                                 //   without speculative rendering.
}
```

The `predicate` and `shouldRender` fields differ in intent:

- `predicate(props): boolean` filters claims at the registry level. Use it when the claim is structurally inapplicable to a target (e.g. wrong cwd, wrong source). A claim that fails its predicate is removed from the slot's claim list entirely and never mounted.
- `shouldRender(props): boolean` runs alongside `predicate` but at the wrapper-gate layer. Use it when the claim's component conditionally returns `null` based on dynamic state (e.g. "extension not installed", "user not authenticated"). A claim whose `shouldRender` returns `false` is NOT mounted inside the slot, AND counts as absent for the purposes of `useSlotHasClaimsForSession` (so the wrapper hides).

Both functions MUST be synchronous. Plugins requiring async state SHALL maintain a sync-readable cache and return a closed-by-default value while the cache is unpopulated.

#### Scenario: Manifest read from package.json

- **WHEN** the loader scans `packages/openspec-plugin/package.json`
- **THEN** it SHALL parse the `pi-dashboard-plugin` field and treat it as the manifest.

#### Scenario: Adjacent dashboard-plugin.json takes precedence

- **WHEN** both `package.json#pi-dashboard-plugin` and `dashboard-plugin.json` exist in the same package
- **THEN** the loader SHALL use `dashboard-plugin.json` and log a warning about the duplication.

#### Scenario: Invalid manifest is rejected at load time

- **WHEN** a manifest references an unknown slot id, missing required fields, or an unparseable schema
- **THEN** the loader SHALL log a fatal validation error naming the package and the violation, mark the plugin as failed, and continue loading other plugins.

#### Scenario: Manifest with shouldRender field is accepted

- **WHEN** a manifest contains a claim with `"shouldRender": "shouldRenderHonchoMemory"`
- **AND** the named function is exported from the plugin's client entry
- **THEN** the loader SHALL resolve the string to the function reference and store it on the resolved `ClaimEntry.shouldRender`

#### Scenario: Manifest with shouldRender referencing missing export is rejected

- **WHEN** a manifest contains `"shouldRender": "nonExistent"` and no such export exists on the client entry
- **THEN** the loader SHALL log a validation error and mark the plugin as failed (same severity as missing `component` export)

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

### Requirement: Plugin context exposes per-session event stream

`PluginContextValue` SHALL provide a hook
`useSessionEvents(sessionId: string): readonly DashboardEvent[]` that
returns every event observed for the given session in arrival order.
The hook SHALL be reactive: when a new event arrives for the
subscribed session, the consuming component SHALL re-render with the
extended event list.

The returned array SHALL be referentially stable across renders that
do not change the event list. Plugins MAY use it as a `useMemo`
dependency to recompute derived state only when new events arrive.

The dashboard shell SHALL accumulate per-session events in a parallel
in-memory store sourced from the existing `case "event"` handler in
`useMessageHandler.ts`. The accumulator SHALL be initialized empty on
`session_register`, appended to on each `event`, and cleared on
session unregister.

#### Scenario: Plugin derives state from events

- **GIVEN** a plugin contribution is rendered for session `S`
- **AND** events `[e1, e2, e3]` have been received for session `S`
- **WHEN** the contribution calls `useSessionEvents("S")`
- **THEN** the hook SHALL return an array containing `[e1, e2, e3]` in
  arrival order
- **AND** the array reference SHALL be the same on subsequent renders
  until a new event arrives

#### Scenario: New event triggers re-render

- **GIVEN** a plugin contribution rendered with `useSessionEvents("S")`
  returning `[e1, e2]`
- **WHEN** event `e3` arrives via the `case "event"` handler
- **THEN** the contribution SHALL re-render
- **AND** the hook SHALL return `[e1, e2, e3]` on the new render

#### Scenario: Hook is per-session

- **GIVEN** events `[a1, a2]` for session `A` and `[b1]` for session `B`
- **WHEN** a contribution calls `useSessionEvents("A")`
- **THEN** the hook SHALL return only `[a1, a2]`
- **AND** SHALL NOT include any event from session `B`

### Requirement: ContentViewSlot SHALL filter competing claims by predicate

`ContentViewSlot` SHALL select among multiple `content-view` claims by
invoking each claim's optional `predicate` function and rendering the
first claim (by priority order) whose predicate returns `true`. If no
claim's predicate returns `true`, `ContentViewSlot` SHALL render
nothing (return `null`), allowing the shell's fallback (`??
sessionDetail`) to render the default chat view. The slot is
`multiplicity: "one-active"`, so at most one claim renders at a time.

The `predicate` field on `PluginClaim` is the SAME field used by
session-card-badge and other session-scoped slots. It is a free
JavaScript function name resolved at build time by the vite plugin
against the plugin's client entry exports. The function's body MAY
read any state its module exposes (including plugin-internal
stores); the `session` argument is informational.

The SDK SHALL NOT add a parallel discriminator mechanism (such as a
`route?` field). Plugins compose with the existing predicate slot
field. (Earlier drafts of this change added a `route?` field; it was
removed — see the `pluginize-flows-via-registry` design.md
Decision 3 RECONSIDERED.)

#### Scenario: ContentViewSlot picks the predicate-true claim

- **GIVEN** two `content-view` claims registered:
  - Claim A: `{ component: "FlowAgentDetail", predicate: "isFlowAgentDetailActive" }`
  - Claim B: `{ component: "FlowArchitectDetail", predicate: "isFlowArchitectDetailActive" }`
- **AND** `isFlowAgentDetailActive` returns `true`
- **AND** `isFlowArchitectDetailActive` returns `false`
- **WHEN** the shell mounts `<ContentViewSlot>`
- **THEN** only Claim A SHALL render
- **AND** Claim B SHALL NOT render

#### Scenario: ContentViewSlot renders nothing when all predicates are false

- **GIVEN** content-view claims whose predicates all return `false`
- **WHEN** the shell mounts `<ContentViewSlot>`
- **THEN** the slot SHALL render nothing
- **AND** the shell's `?? sessionDetail` fallback SHALL render the
  chat view

#### Scenario: Multiple true predicates resolve by priority

- **GIVEN** two content-view claims whose predicates both return
  `true`, one at priority 40 and one at priority 60
- **WHEN** the shell mounts `<ContentViewSlot>`
- **THEN** only the lower-priority-value (priority 40) claim SHALL
  render (existing slot `(priority asc, pluginId asc)` ordering)

#### Scenario: Predicate can read plugin-internal state via closure

- **GIVEN** a content-view claim's predicate function is defined in
  the plugin's client entry and closes over a module-level state
  store
- **WHEN** the user triggers a plugin action that updates the store
  (e.g. `setFlowDetailAgent(name)`)
- **THEN** the predicate's next invocation SHALL reflect the new
  state
- **AND** the slot consumer SHALL pick up the change on next render

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

### Requirement: Shell consumes the generated plugin registry

The dashboard shell (`packages/client/src/App.tsx` or its successor entry component) SHALL import `PLUGIN_REGISTRY` from `./generated/plugin-registry` and populate the `SlotRegistry` instance passed to `<PluginContextProvider>` with every claim from every entry. Failure to do so means slot consumers in the shell render zero contributions even when the generated registry is populated.

#### Scenario: Empty registry produces empty slot consumers

- **WHEN** `PLUGIN_REGISTRY` is `[]` (committed stub state, fresh checkout, or runtime not built)
- **THEN** `<PluginContextProvider registry={_pluginRegistry}>` SHALL receive an empty registry
- **AND** every slot consumer (`<SettingsSectionSlot>`, `<SessionCardBadgeSlot>`, etc.) SHALL render zero contributions
- **AND** the shell SHALL render normally with all legacy direct imports intact (no error, no fallback UI required).

#### Scenario: Populated registry threads claims to slot consumers

- **WHEN** `PLUGIN_REGISTRY` contains `[{ manifest: { id: "demo", … }, claims: [{ slot: "settings-section", component: DemoSettings, tab: "general" }] }]`
- **THEN** `<SettingsSectionSlot tab="general">` SHALL render `<DemoSettings>` wrapped in the runtime's `SlotErrorBoundary`
- **AND** `<SettingsSectionSlot tab="servers">` SHALL render zero contributions (no claim for `tab: "servers"`).

#### Scenario: Co-tenancy with legacy direct imports

- **WHEN** the shell renders `<SessionCardBadgeSlot session={s}/>` AND a plugin claims `session-card-badge` for a component that the shell **also** imports directly via legacy JSX
- **THEN** the result is duplicate rendering of that component
- **AND** the migration plan SHALL remove the legacy direct import in the same change that populates the registry, OR keep the slot empty until the legacy import is removed in a follow-up
- **AND** a regression test SHALL verify no double-render exists for the four migrated cases (`FlowActivityBadge`, `SessionFlowActions`, `JjWorkspaceBadge`, `JjActionBar`).

#### Scenario: Registry populated only at module load

- **WHEN** the shell module first loads
- **THEN** the `_pluginRegistry` SHALL be populated synchronously from `PLUGIN_REGISTRY`
- **AND** subsequent edits to plugin source code during `vite dev` SHALL trigger HMR through vite's normal module graph (not via registry mutation)
- **AND** subsequent edits to plugin manifests SHALL trigger registry regeneration via the vite plugin, which produces a new `generated/plugin-registry.tsx` and HMR-replaces the App module.

### Requirement: `useSlotHasClaimsForSession` consults `shouldRender`

The runtime helper `useSlotHasClaimsForSession(slotId, session): boolean` (exported from `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`) SHALL return `true` only when at least one claim:

1. matches `slotId`,
2. passes its optional `predicate(session)` (existing behavior), AND
3. passes its optional `shouldRender(session)` (new behavior; claims without `shouldRender` are treated as if `() => true`).

Sibling helpers for other targets (folder, command, etc.) SHALL apply the same rule when introduced.

#### Scenario: Hook returns false when only claim's shouldRender returns false
- **WHEN** a session-card-memory claim is registered with `shouldRender: () => false`
- **AND** no other session-card-memory claim exists
- **THEN** `useSlotHasClaimsForSession("session-card-memory", session)` SHALL return `false`

#### Scenario: Hook returns true when at least one claim's shouldRender returns true
- **WHEN** two session-card-memory claims exist, one with `shouldRender: () => false` and one with `shouldRender: () => true`
- **THEN** `useSlotHasClaimsForSession("session-card-memory", session)` SHALL return `true`

#### Scenario: Hook treats absent shouldRender as pass-through
- **WHEN** a claim has no `shouldRender` declared and passes its predicate
- **THEN** the claim SHALL count toward the hook's `true` result

### Requirement: Slot consumers skip claims whose `shouldRender` returns false

The slot consumer components in `slot-consumers.tsx` (`SessionCardMemorySlot`, `SessionCardBadgeSlot`, `WorkspaceActionBarSlot`, `SessionCardActionBarSlot`, etc. — all session-scoped consumers) SHALL filter the claim list with `shouldRender(session)` (when declared) before rendering. A claim whose `shouldRender` returns `false` SHALL NOT be mounted at all (no `SlotErrorBoundary`, no `CurrentPluginLayer`, no `Component`).

#### Scenario: Slot consumer mounts only claims whose shouldRender returns true
- **WHEN** a slot has two claims, one with `shouldRender: () => false` and one without `shouldRender`
- **AND** the slot consumer renders for a session
- **THEN** only the second claim's component SHALL be mounted in the rendered output

#### Scenario: Slot consumer renders nothing when all claims gated out
- **WHEN** every claim for the slot has `shouldRender: () => false`
- **THEN** the slot consumer SHALL render nothing (no fragment, no boundary)

### Requirement: `ClaimEntry` is generic over `SlotId` with strong predicate input typing

The plugin runtime's `ClaimEntry` interface (in `packages/dashboard-plugin-runtime/src/slot-registry.ts`) SHALL be parameterised by slot id, with `predicate` and `shouldRender` declared using **method-shorthand syntax** so their parameter types are bivariant under TypeScript's `strictFunctionTypes`:

```ts
export interface ClaimEntry<S extends SlotId = SlotId> {
  pluginId: string;
  priority: number;
  slot: S;
  predicate?(input: SlotPredicateInput<S>): boolean;
  shouldRender?(input: SlotPredicateInput<S>): boolean;
  // … remaining fields unchanged
}
```

The method-shorthand syntax SHALL be used (rather than arrow-property syntax `predicate?: (input) => boolean`) because the static-registry generator emits each entry as a `ClaimEntry<"literal-slot-id">` specialization that must be assignable back into a mixed-slot `ClaimEntry[]` array. With arrow-property syntax, parameter contravariance forbids the narrow-to-wide direction. Method shorthand is TypeScript's documented bivariance escape hatch and is sound here because the registry's filter helpers pre-filter claims by slot id before invoking any predicate.

The default type argument `S extends SlotId = SlotId` SHALL be preserved so that existing untyped usages — including `SlotRegistry.getClaims(slotId): ClaimEntry[]`, every filter helper signature, and external `ClaimEntry[]` consumers — continue to compile without source changes.

The change SHALL be non-breaking for external plugins:

- A plugin's predicate previously typed as `(input: unknown) => boolean` SHALL remain assignable to the new method-shape contract for every concrete `S`, by parameter bivariance.
- A plugin's predicate typed narrowly (e.g. `(session: DashboardSession | null | undefined) => boolean`) SHALL be accepted at registration when the entry's `slot` is a session-scoped slot id, and SHALL be rejected by the type-checker when the `slot` is folder-scoped (mismatched concrete input types).
- Predicate registration on a slot whose `SlotPredicateInput<S>` is `never` (e.g. `settings-section`, `tool-renderer`, descriptor-only slots) SHALL compile because of method-shorthand bivariance, but the registered predicate is dead code: filter helpers only invoke predicates on session- and folder-scoped slots.

#### Scenario: Registering a session-shaped predicate on a session slot type-checks

- **WHEN** a registry entry declares `{ slot: "session-card-badge", predicate: (s: DashboardSession | null | undefined) => boolean(s) }`
- **THEN** TypeScript SHALL accept the entry without diagnostics.

#### Scenario: Registering a session-shaped predicate on a folder slot is a compile error

- **WHEN** a registry entry declares `{ slot: "sidebar-folder-section", predicate: (s: DashboardSession | null | undefined) => boolean(s) }`
- **THEN** TypeScript SHALL report a type error indicating the predicate's parameter type is incompatible with `SlotPredicateInput<"sidebar-folder-section">` (which is `FolderDescriptor`).

#### Scenario: Registering a folder-shaped predicate on a session slot is a compile error

- **WHEN** a registry entry declares `{ slot: "session-card-badge", predicate: (f: FolderDescriptor) => boolean(f) }`
- **THEN** TypeScript SHALL report a type error indicating the predicate's parameter type is incompatible with `SlotPredicateInput<"session-card-badge">`.

#### Scenario: Registering an `unknown`-typed predicate on any slot type-checks

- **WHEN** a registry entry declares `{ slot: "session-card-badge", predicate: (p: unknown) => boolean(p) }`
- **THEN** TypeScript SHALL accept the entry without diagnostics (contravariance: `unknown` is wider than the required input type).

#### Scenario: Default-generic `ClaimEntry[]` consumers compile unchanged

- **WHEN** `SlotRegistry.getClaims(slotId)` returns `ClaimEntry[]` (no explicit type argument)
- **AND** `forSession(claims: ClaimEntry[], session: DashboardSession)` invokes `c.predicate(session)`
- **THEN** the call SHALL type-check because `DashboardSession` is assignable to `SlotPredicateInput<SlotId>` (which resolves to `DashboardSession | null | undefined | FolderDescriptor`).

### Requirement: Vite plugin emits literal slot ids in the generated registry

The static-registry generator in `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` SHALL emit each claim entry in `packages/client/src/generated/plugin-registry.tsx` so that the `slot:` field is a literal type (not widened to `SlotId`). This SHALL allow TypeScript to specialise `ClaimEntry<S>` per entry and type-check the entry's `predicate` and `shouldRender` against the correct `SlotPredicateInput<S>`.

Acceptable implementation strategies SHALL be either (a) relying on TypeScript's natural literal narrowing of the discriminant `slot:` field in object literals, or (b) emitting an explicit `satisfies ClaimEntry<"literal-slot-id">` per entry.

#### Scenario: Generated entry with session-shaped predicate on session slot compiles

- **WHEN** the generator emits an entry `{ pluginId: "jj", … slot: "session-card-badge", predicate: isInJjWorkspace }` and `isInJjWorkspace` has signature `(s: DashboardSession | null | undefined) => boolean`
- **THEN** TypeScript SHALL accept the generated file without diagnostics.

#### Scenario: Generated entry with mis-shaped predicate is a build error

- **WHEN** a plugin manifest registers a predicate whose runtime signature is incompatible with the slot's `SlotPredicateInput<S>`
- **THEN** TypeScript SHALL emit a type error during `npm run lint` (or any project type-check) naming the offending generated entry.

### Requirement: Honcho plugin retypes `shouldRenderHonchoMemory` to the session-scoped input

The in-tree `honcho-plugin` package SHALL retype `shouldRenderHonchoMemory` from `(_session: unknown) => boolean` to `(session: DashboardSession | null | undefined) => boolean`. The function body and runtime semantics SHALL be unchanged. This narrowing demonstrates the new contract on a session-scoped slot (`session-card-memory`) and surfaces stronger types for the plugin's own code.

#### Scenario: Honcho shouldRender accepts a DashboardSession

- **WHEN** the slot consumer for `session-card-memory` invokes `shouldRenderHonchoMemory(session)` with `session: DashboardSession`
- **THEN** the call SHALL type-check and run identically to today.

#### Scenario: Honcho shouldRender registered for folder-scoped slot would be a compile error

- **WHEN** a hypothetical entry registers `shouldRenderHonchoMemory` (which now takes `DashboardSession | null | undefined`) for a folder-scoped slot
- **THEN** TypeScript SHALL reject the registration because the predicate's parameter type is incompatible with `SlotPredicateInput<"sidebar-folder-section">` (`FolderDescriptor`).

### Requirement: Plugin runtime exposes UI primitive registry context

The dashboard's React root SHALL be wrapped in a `<UiPrimitiveProvider>` (defined by `plugin-ui-primitive-registry`) so that all plugin slot contributions are descendants of the provider. This SHALL be in addition to the existing `<PluginContextProvider>` already required by `dashboard-plugin-loader`.

The relative ordering SHALL place `<UiPrimitiveProvider>` OUTSIDE `<PluginContextProvider>`. (Both end up wrapping `<App>`; the order matters only in that hooks from one cannot influence the other's setup.)

#### Scenario: Both providers wrap App

- **WHEN** `<App>` is mounted from `packages/client/src/main.tsx`
- **THEN** the React tree SHALL include `<UiPrimitiveProvider value={primitiveRegistry}>` at or above `<PluginContextProvider>`
- **AND** every slot consumer in the tree SHALL be a descendant of both providers

#### Scenario: Plugin contribution can use both registries

- **WHEN** a plugin slot contribution renders inside both providers
- **THEN** it SHALL be able to call `usePluginConfig()` (from PluginContext) AND `useUiPrimitive()` (from UiPrimitiveProvider) in the same component without either failing

### Requirement: Slot consumers SHALL accept BOTH refs-registry claims AND intent broadcasts

The slot consumer pattern (e.g. `ContentViewSlot`, `SessionCardActionBarSlot`, etc.) SHALL render both static refs-registry claims (current pattern, `claim.Component` from the generated plugin-registry.tsx) AND server-broadcast intent contributions from the IntentStore. The two pathways are coextensive during migration. For slots with `multiplicity: "many"`, both are rendered. For `multiplicity: "one-active"` slots, intent broadcasts take precedence over legacy claims when both are present from the same plugin.

This expressly SUPERSEDES the model from `add-plugin-ui-primitive-registry` (archived 2026-05-11) where plugins were expected to ship React code that imported the primitive registry via `useUiPrimitive`. The registry mechanism survives unchanged; the EXPECTED CALLER moves from plugin code to the shell-side IntentRenderer.

#### Scenario: Slot consumer renders both legacy claim and intent contribution

- **GIVEN** the legacy refs-registry has a claim for slot "session-card-action-bar" from plugin "jj"
- **AND** the IntentStore has an intent for slot "session-card-action-bar" from plugin "flows" (which has migrated)
- **WHEN** `SessionCardActionBarSlot` renders for the session
- **THEN** the slot consumer SHALL render both contributions: the legacy claim's React component AND the intent-driven IntentRenderer output
- **AND** the rendering order SHALL follow each contribution's pluginId priority

#### Scenario: Plugin that has fully migrated registers no refs-registry claims

- **GIVEN** plugin "flows" has migrated all 12 claims to intent broadcasts
- **WHEN** the plugin's manifest is scanned by the vite-plugin at build time
- **THEN** the plugin's manifest claims have empty `"claims": []` (or no longer include `component` fields)
- **AND** the legacy refs-registry path renders nothing for "flows" (it has no registered claims)
- **AND** the intent path renders everything for "flows" (driven by server broadcasts)

### Requirement: Server-side plugin discovery SHALL NOT depend on `process.cwd()`

The `discoverPlugins()` function SHALL discover plugin manifests from a stable location independent of where the server process was launched. Today the function reads `process.cwd() + "packages/"` which returns empty when the server runs from outside the monorepo (verified: `/api/health.plugins[]` is empty when server runs from `/home/skrot1`).

The discovery mechanism SHALL look in (in order):
1. The repo root determined by `import.meta.url` resolution from `dashboard-plugin-runtime/src/server/loader.ts` (when the runtime package is installed in a monorepo)
2. `~/.pi/dashboard/plugins/` (user-installed plugins, as proposed by `add-plugin-activation-ui`)
3. Bundled plugins in the dashboard's own `resources/` (production install)

Without this fix, the intent broadcast pathway is unusable: plugin server entries never load, so no intents fire.

#### Scenario: Dashboard installed via npm-global discovers plugins

- **GIVEN** dashboard is installed at `~/.pi-dashboard/node_modules/@blackbelt-technology/pi-dashboard-server/`
- **AND** the server is started with `pi-dashboard start` from any directory
- **WHEN** `discoverPlugins()` runs at server boot
- **THEN** plugin discovery SHALL find every installed plugin package (whether bundled in `resources/` or installed via `~/.pi/dashboard/plugins/`)
- **AND** `/api/health.plugins[]` SHALL list every discovered plugin with its loaded state
- **AND** each plugin's server entry SHALL be activated, ready to broadcast intents

## Related Capabilities

- `dashboard-shell-slots` — sibling capability defining the slot taxonomy that this loader populates.
- `extension-ui-system` — orthogonal capability for third-party descriptor UI; the loader does not handle descriptor extensions (those flow through `ui:list-modules` probe + `ext_ui_decorator` messages already specified there). The loader manages first-party plugins only.
- `bridge-extension` — historical mechanism for in-pi-process state forwarding; plugins that declare a `bridge` entry get auto-registered through the same mechanism the dashboard's own bridge uses (`extension-register.ts`), under managed `dashboard-<plugin-id>` keys that the dashboard owns.
- `dashboard-server` — host process for the loader. Server bootstrap completes (Fastify, session manager, event store), then the loader runs `loadServerEntries()` to register plugin routes/handlers/polling.
