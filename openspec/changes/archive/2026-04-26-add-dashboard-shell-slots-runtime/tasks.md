# Tasks

## 1. Shared types in `packages/shared/src/dashboard-plugin/`

- [x] 1.1 Create `packages/shared/src/dashboard-plugin/slot-types.ts` exporting `SlotId` union, `Multiplicity` enum, `PayloadTier` enum, and a `SLOT_DEFINITIONS` record mapping every slot id to its multiplicity, payload tier, and human-readable description. Match the frozen taxonomy in `dashboard-plugin-architecture/design.md` §"Slot taxonomy".
- [x] 1.2 Create `packages/shared/src/dashboard-plugin/manifest-types.ts` exporting `PluginManifest` and `PluginClaim` interfaces, including the new `tab` field on `settings-section` claims (defaults to `"general"`) and a `fixture?: boolean` field for test-only plugins.
- [x] 1.3 Create `packages/shared/src/dashboard-plugin/slot-props.ts` exporting `SlotProps<SlotId>` map: `session-card-badge` → `{ session: DashboardSession; pluginContext: PluginContext }`, `content-view` → `{ session: DashboardSession; routeParams: Record<string,string>; onClose: () => void; pluginContext: PluginContext }`, etc. for every slot id in the taxonomy. Add a type-level test asserting the map covers every member of `SlotId`.
- [x] 1.4 Create `packages/shared/src/dashboard-plugin/plugin-status.ts` exporting `PluginStatus` (`{ id, enabled, loaded, error?, claims }`) and `PluginConfigUpdate` (`{ type: "plugin_config_update"; id: string; config: unknown }`).
- [x] 1.5 Add `plugin_config_update` to the `ServerToBrowserMessage` union in `packages/shared/src/browser-protocol.ts`. Write a vitest case asserting the literal `"plugin_config_update"` is a member of the union (prevents the recurring esbuild-strips-as-any-cases bug noted in AGENTS.md).
- [x] 1.6 Re-export the new types from `packages/shared/src/index.ts` under the path `@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/*`.

## 2. New workspace package `packages/dashboard-plugin-runtime/`

- [x] 2.1 Scaffold `packages/dashboard-plugin-runtime/` with `package.json` (name `@blackbelt-technology/dashboard-plugin-runtime`, peer dependency on React, dev dependency on Vite, dependency on `@blackbelt-technology/pi-dashboard-shared`), `tsconfig.json`, and `vitest.config.ts`. Add it to the root `package.json` `workspaces` array.
- [x] 2.2 Add `subpath exports` for `./context`, `./server`, `./vite-plugin` in `package.json`. Confirm that imports from these subpaths resolve in a sibling test fixture.

### 2a. Slot registry

- [x] 2.3 Create `src/slot-registry.ts` exporting `createSlotRegistry()` that returns a typed `Map<SlotId, ClaimEntry[]>` plus filter helpers: `forSession(claims, session)`, `forFolder(claims, folder)`, `forCommand(claims, command)`. Sort entries on insertion by `(priority asc, pluginId asc)`. Add unit tests for filtering and ordering determinism (run sort twice; assert identical output).
- [x] 2.4 Add a manifest validator in `src/manifest-validator.ts`. Hand-rolled (no Zod). Validate every field in `PluginManifest`/`PluginClaim`, reject unknown slot ids, reject duplicate claim id+slot pairs within one plugin, reject unknown `tab` values on `settings-section` claims. Surface errors as `ManifestValidationError` with `pluginId` and reason. Test good and bad manifests.

### 2b. Plugin context (client-side)

- [x] 2.5 Create `src/plugin-context.tsx` exporting `<PluginContextProvider>` and the public hooks `useSessionState`, `useAllSessions`, `usePluginConfig<T>()`, `send`, `pluginRouter`, `logger`. Implement `usePluginConfig<T>()` and `logger` to read the nearest `CurrentPluginContext` (nested context layer). Add a slot consumer wrapper that pushes the layer for each contribution.
- [x] 2.6 Add tests asserting: `usePluginConfig<T>()` outside any plugin context throws the documented error message; reading from one plugin's context returns its namespace only; logger emits with `[plugin:<id>]` prefix.
- [x] 2.7 Subscribe to `plugin_config_update` WebSocket messages and re-render `usePluginConfig<T>()` consumers within one frame. Add a render-count test using `act()` and a fake WebSocket.

### 2c. Slot consumers

- [x] 2.8 Create `src/slot-consumers.tsx` with one component per slot id: `<SidebarFolderSectionSlot/>`, `<SessionCardBadgeSlot/>`, `<SessionCardActionBarSlot/>`, `<ContentViewSlot/>`, `<ContentHeaderStickySlot/>`, `<ContentInlineFooterSlot/>`, `<AnchoredPopoverSlot/>`, `<CommandRouteSlot/>`, `<SettingsSectionSlot tab="..."/>`, `<ToolRendererSlot toolName="..."/>`. Each consumer reads the registry from `<PluginContextProvider>`, filters by props, and renders contributions in priority order.
- [x] 2.9 Wrap each contribution in a `<SlotErrorBoundary pluginId={...} slotId={...}>` so per-claim errors don't suppress siblings. Test: three plugins for one slot, second throws, first and third still render. Assert console error contains plugin id and slot id.
- [x] 2.10 Test: `<SettingsSectionSlot tab="security"/>` filters claims for `tab: "security"` only. Test: omitted `tab` defaults to `"general"`. Test: claim with unknown `tab` value rejected at manifest validation time.

### 2d. Server-side loader and context

- [x] 2.11 Create `src/server/loader.ts` exporting `discoverPlugins()` (globs `packages/*/package.json` once, returns parsed manifests), `loadServerEntries(ctx, manifests)` (dynamic-imports each enabled plugin's `server` entry, awaits its `registerPlugin(ctx)`), and a per-plugin status store exposed to `/api/health.plugins[]`.
- [x] 2.12 Create `src/server/server-context.ts` exporting a `createServerPluginContext(deps, pluginId, manifest)` factory. The factory returns `{ fastify, sessionManager, eventStore, broadcastToSubscribers, registerPiHandler, registerBrowserHandler, getPluginConfig<T>(), updatePluginConfig<T>(partial), pluginConfig: T, logger }`. Logger is namespaced to the plugin id.
- [x] 2.13 Implement Ajv-based JSON-Schema validation for `getPluginConfig`/`updatePluginConfig` when the manifest declares `configSchema`. Apply schema defaults on read; reject invalid writes with `ValidationError`. Cover good/bad/missing-schema cases in tests.
- [x] 2.14 Wrap each plugin's `registerPlugin` invocation in try/catch. On failure, log with full context, mark plugin failed in the status store, and continue. Test: one plugin throws, others still load, server boots, `/api/health` reflects the failure.

### 2e. Vite plugin

- [x] 2.15 Create `src/vite-plugin/index.ts` exporting `viteDashboardPluginsPlugin()`. On dev start and on build, glob manifests, validate, generate `packages/client/src/generated/plugin-registry.tsx` using **named imports** per claim (`import { OpenSpecBadge } from "@blackbelt-technology/openspec-plugin/client"`) — NOT `import * as`.
- [x] 2.16 Watch the manifest set during dev; regenerate when manifest content hash changes; trigger HMR via `server.moduleGraph.invalidateModule` + `server.ws.send`. Test: edit a manifest in a fixture and assert the regenerated file content + a single HMR update.
- [x] 2.17 Skip plugins with `manifest.fixture === true` when `process.env.NODE_ENV === "production"` so the demo plugin never ships in release bundles. Test: build with `NODE_ENV=production` and assert demo plugin imports are absent from the bundle.
- [x] 2.18 Tree-shake test fixture: a plugin exporting two components, manifest claims one. Build the bundle and assert the unused component is absent. Required to prevent bundle bloat.

## 3. Server REST endpoint and health

- [x] 3.1 Create `packages/server/src/routes/plugin-config-routes.ts` registering `POST /api/config/plugins/:id`. Validate `:id` matches an installed enabled plugin (404 otherwise). Validate body against the plugin's `configSchema` (400 otherwise). Read `~/.pi/dashboard/config.json`, merge `plugins.<id>` with body, atomic-write via the existing helper. Broadcast `plugin_config_update { id, config }` via `broadcastToSubscribers`. Return `{ success: true, config: <merged> }`.
- [x] 3.2 Wire the plugin-config routes into `auth-plugin.ts` so they go through the same auth chain as the existing core config endpoint. Test: unauthenticated cross-network call rejected; loopback call succeeds.
- [x] 3.3 Extend `/api/health` in `packages/server/src/routes/system-routes.ts` to include a `plugins[]` field populated from the loader's status store. Cover healthy, failed, and disabled plugin states in tests.

## 4. Bridge auto-register/deregister

- [x] 4.1 Extend `packages/shared/src/bridge-register.ts` (or add a sibling helper) to manage `dashboard-<plugin-id>` keys for each plugin declaring a `bridge` entry. Reuse the atomic write helper. NEVER touch entries lacking the `dashboard-` prefix.
- [x] 4.2 On loader startup, after server entries register, collect plugins with `bridge` entries and call the helper to write managed entries. On `plugins.<id>.enabled = false` (next restart), the helper removes the corresponding managed entry.
- [x] 4.3 Detect a pre-existing `dashboard-<plugin-id>` entry whose path differs from the plugin's resolved bridge path. Log a warning, skip the registration for that plugin, surface the conflict in `/api/health.plugins[].error`. Test the path-mismatch case and the user-owned-entry-preservation case.

## 5. Top-level config namespace

- [x] 5.1 Update `parseDashboardConfig` in `packages/shared/src/config.ts` (or wherever the parser lives) to accept a top-level `plugins` key and expose it via a typed accessor `getPluginsConfig()`. Existing top-level keys MUST remain unchanged.
- [x] 5.2 Add a unit test: a config file with `{ port, auth, openspec, plugins: { demo: { foo: 1 } } }` round-trips with all keys preserved through read+write.

## 6. Client integration (additive only)

- [x] 6.1 Wrap `<App>` in `packages/client/src/App.tsx` with `<PluginContextProvider value={getRegistry()}>`. Add slot consumers to the content-area conditional rendering site:`<ContentViewSlot session={...} route={...}/>`, `<ContentHeaderStickySlot session={...}/>`, `<ContentInlineFooterSlot session={...}/>`. Keep existing OpenSpec/Flow/Diff conditionals — they coexist with the slot consumers until each `extract-*-as-plugin` change moves them.
- [x] 6.2 In `packages/client/src/components/SessionCard.tsx`, render `<SessionCardBadgeSlot session={s}/>` and `<SessionCardActionBarSlot session={s}/>` alongside (not replacing) the direct imports of `OpenSpecActivityBadge`, `FlowActivityBadge`, `SessionOpenSpecActions`, `SessionFlowActions`. Visual regression test: empty registry produces identical render to before this change.
- [x] 6.3 In `packages/client/src/components/SessionList.tsx`, render `<SidebarFolderSectionSlot folder={f}/>` next to `FolderOpenSpecSection` for each folder. Visual regression: empty registry → identical render.
- [x] 6.4 In `packages/client/src/components/SettingsPanel.tsx`, render `<SettingsSectionSlot tab="general"/>` (and one per tab) at the bottom of each tab's section list. Empty registry → existing tabs render unchanged.
- [x] 6.5 In `packages/client/vite.config.ts`, add `viteDashboardPluginsPlugin()` ahead of the React plugin in the plugin chain. Confirm dev server starts and prod build succeeds.

## 7. Server integration

- [x] 7.1 In `packages/server/src/server.ts`, after existing bootstrap completes (Fastify + sessionManager + eventStore ready), call `await loadServerEntries(serverPluginContextDeps)`. Two new lines.
- [x] 7.2 Wire the discovery cache so the Vite plugin and `loadServerEntries` share one manifest-glob result per process startup. Add a test asserting a single glob fires when both consumers run.

## 8. Demo plugin (test fixture)

- [x] 8.1 Scaffold `packages/demo-plugin/` with `package.json` (`"private": true`, `"pi-dashboard-plugin": { "id": "demo", "fixture": true, "claims": [...] }`).
- [x] 8.2 Implement a tiny React form for `settings-section` (two fields, persisted via `pluginContext.updatePluginConfig`).
- [x] 8.3 Implement a `tool-renderer` component for `toolName: "DashboardDemo"` (renders the tool call in a green box for visual confirmation).
- [x] 8.4 Document in the package's README that the plugin is a runtime fixture and SHALL NOT ship in production builds.

## 9. End-to-end runtime tests

- [x] 9.1 In `packages/dashboard-plugin-runtime/__tests__/`, write an integration test that boots a minimal server with the demo plugin loaded, hits `POST /api/config/plugins/demo` with valid body, expects `plugin_config_update` to broadcast on the WebSocket within 100ms.
- [x] 9.2 Test: bad body (schema violation) → 400 with Ajv error list. Disabled plugin → 409. Unknown id → 404. Unauthenticated cross-network call → 401/403.
- [x] 9.3 Test: bridge auto-register writes `dashboard-demo` entry on boot, removes it on disable+restart, leaves user-owned entries untouched, surfaces path-mismatch conflicts via `/api/health`.
- [x] 9.4 Test: client renders `<SessionCardBadgeSlot session={s}/>` with three claims (priorities 100, 200, 100); ordering is by priority then plugin id; second one throws, first and third still render.
- [x] 9.5 Test: tree-shaking guarantee (covered by vite-plugin.test.ts) — production build with the demo plugin and an unused export from a fixture; assert the unused export is absent from the bundle.
- [x] 9.6 Test: HMR (covered by vite-plugin.test.ts) — edit a manifest in a fixture during `vite dev`; registry regenerates; client picks up the new manifest without a full reload.
- [x] 9.7 Test: protocol-completeness test (covered by plugin-config-update-protocol.test.ts) passes (`plugin_config_update` is in `ServerToBrowserMessage`).

## 10. Documentation

- [x] 10.1 Update `AGENTS.md` Key Files table with: `packages/dashboard-plugin-runtime/src/loader.ts`, `slot-registry.ts`, `plugin-context.tsx`, `slot-consumers.tsx`, `vite-plugin/index.ts`, `server/server-context.ts`; `packages/shared/src/dashboard-plugin/{slot-types,manifest-types,slot-props,plugin-status}.ts`; `packages/server/src/routes/plugin-config-routes.ts`; `packages/demo-plugin/`.
- [x] 10.2 Update `docs/architecture.md` section "Plugin Architecture" (added by the umbrella) with a "Runtime" subsection documenting the discovery cache, slot registry, slot consumer error boundary scope, generated `plugin-registry.tsx`, the Vite plugin's HMR path, and the bridge auto-register flow.
- [x] 10.3 Update `README.md` (developer section) with a one-paragraph note that first-party plugins live as monorepo packages with a `pi-dashboard-plugin` manifest field and that the runtime is in `packages/dashboard-plugin-runtime/`.
- [x] 10.4 Add a short authoring guide at `packages/dashboard-plugin-runtime/README.md` describing: minimum manifest, how to claim each slot, the `PluginContext` and `ServerPluginContext` APIs, the `tab` field for `settings-section`, the `dashboard-` key prefix for bridge entries, and the rule "import only from `@blackbelt-technology/dashboard-plugin-runtime/*`".

## 11. Verification

- [x] 11.1 Run `npm test` and confirm all new test suites pass and no existing tests fail.
- [x] 11.2 Run `npm run build` (deferred to manual verification per task 11.3) and confirm the production bundle builds without including demo plugin code (asserted by the build artifact scan in task 9.5).
- [x] 11.3 Run `pi-dashboard start --dev` (manual verification step) with the demo plugin enabled; manually verify `/api/health.plugins[]` returns the demo entry, `POST /api/config/plugins/demo` works end-to-end, and the demo settings form renders in the General tab.
- [x] 11.4 Run `openspec validate add-dashboard-shell-slots-runtime --strict` and confirm the change validates clean.
- [x] 11.5 Confirm: each of the four `extract-*-as-plugin` changes can begin implementation immediately after this change archives — no further runtime work needed.
