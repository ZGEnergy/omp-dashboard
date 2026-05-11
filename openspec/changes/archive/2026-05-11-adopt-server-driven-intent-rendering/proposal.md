# Proposal — Adopt server-driven intent rendering for plugin UI

## Why

The dashboard's current plugin architecture cannot serve multiple connected clients coherently. The archived change `add-plugin-ui-primitive-registry` and `pluginize-flows-via-registry` (both shipped 2026-05-11) built a plugin runtime where:

1. Plugin code runs **in every browser**, packaged into a single client bundle baked at build time. The generated `packages/client/src/generated/plugin-registry.tsx` imports plugin source by ABSOLUTE PATHS only valid on the build machine.
2. Plugins look up shared React components via `useUiPrimitive(key)` — a client-side registry living in `main.tsx`.
3. Each connected client re-runs the plugin's reducers and holds the plugin's UI state in its OWN React tree (`FlowsUiStateContext` is module-level mutable state per browser bundle instance).

**Three concrete bugs surface from this:**

### Bug 1 — Server-side plugin loader silently dead

`packages/dashboard-plugin-runtime/src/server/loader.ts:38` reads `process.cwd() + "packages/"`. The dashboard server runs from `/home/skrot1` (verified via `readlink /proc/<pid>/cwd`). There is no `packages/` directory there. `discoverPlugins()` returns `[]`. `/api/health.plugins` reports `[]`. honcho-plugin's server endpoints under `/api/plugins/honcho/*` never mount. jj-plugin's git operations never wire. flows-anthropic-bridge's bridge entry never registers into `~/.pi/agent/settings.json#dashboardPluginBridges`. The client-side plugin contributions render, but the server-side half is silently absent for every installed (non-dev) user.

### Bug 2 — Per-client state divergence

`packages/flows-plugin/src/client/FlowsUiStateContext.tsx:63` declares `let state: FlowsUiState = INITIAL_STATE;` — a module-level mutable variable. Each connected client (browser tab, phone PWA, Capacitor APK) holds its own copy. Open FlowYamlPreview on the desktop — phone sees nothing. Click into an agent detail on phone — desktop continues showing the chat. Two users on different clients cannot agree on what the plugin is currently showing.

### Bug 3 — Plugin manifest declares ONE client entry for all runtimes

`packages/shared/src/dashboard-plugin/manifest-types.ts` `PluginManifest` has a single `client?: string` field. There is no `clientMobile`, `clientElectron`, `clientTui`. Every connected client downloads the same React bundle. Mobile clients get desktop-sized UI in a phone viewport. Future runtime targets (TUI, native shells) are foreclosed.

### Why the registry is the wrong primitive

The primitive registry was correctly designed to keep plugin tarballs lean by sharing the dashboard's UI building blocks. But it solves a SECONDARY problem (tarball size) while leaving the PRIMARY problem unsolved: plugins still ship React code that runs in every browser, with per-browser state, that cannot be installed/uninstalled at runtime, that doesn't synchronize across clients, that ties plugins to a single rendering runtime.

The slot taxonomy itself anticipated this. `packages/shared/src/dashboard-plugin/slot-types.ts` declares 7 of 12 slots as `payloadTier: "react-or-descriptor"` — explicitly admitting that some claims should be expressible as JSON descriptors rendered by the shell, not React components shipped by the plugin. But the manifest validator and `PluginClaim` type only ever accepted React component references. The descriptor half was a stub.

**The real architecture the slot system was waiting for**: plugins live on the server, emit declarative intent (a JSON tree describing what to render where), and clients each resolve that intent through their own local registry of components. The plugin never imports React. The plugin never runs in the browser. State changes broadcast via the bridge fan out to every connected client simultaneously. Every client renders the same intent identically.

This change pivots first-party plugins from the refs-registry pattern (plugin lookups shell components) to a **server-driven intent rendering** pattern (plugin emits intent, shell resolves and renders on each client).

## What Changes

### Core mechanism: intent broadcast over the bridge

Plugin server entries gain a new contract:

```typescript
// pure: state → intent tree
function render(state: PluginState): Intent[] {
  return [{ slot: "content-view", intent: { ... } }];
}
```

When state changes, the plugin broadcasts `{ type: "plugin_intents", pluginId, sessionId, slot, intent }` via the existing `ServerPluginContext.broadcastToSubscribers` channel. The bridge's `browserGateway.broadcast(msg)` (which already exists, already fans out to every connected WebSocket subscriber, server.ts:1242) carries the intent to every client. No new bridge code needed.

### Client-side: intent store + intent renderer

Each client adds:
- `case "plugin_intents":` in `useMessageHandler.ts` switch
- An `IntentStore`: `Map<(pluginId, sessionId, slot), Intent>`
- An `IntentRenderer` React component that walks intent trees recursively. For each `{ primitive: "agent-card", props: {...} }`, it looks up "agent-card" in the LOCAL primitive registry and renders the matching component
- Updated slot consumers (e.g. `ContentViewSlot`, `SessionCardActionBarSlot`) read intents from the IntentStore for their slot and render via `IntentRenderer`

### The primitive registry survives — relocated, not deleted

Today, the primitive registry is consumed by PLUGINS (via `useUiPrimitive` calls inside plugin React components). After this change, the primitive registry is consumed by the SHELL'S IntentRenderer. The plugin never touches it. The components in the registry (AgentCardShell, MarkdownContent, ConfirmDialog, etc.) stay — they're now the impls the IntentRenderer resolves intent primitive names against.

This **explicitly supersedes** the archived change `add-plugin-ui-primitive-registry` (archive/2026-05-11). The registry mechanism is kept; the usage pattern changes. The archive's stated goal ("lean plugin tarballs by avoiding direct primitive imports") is achieved AT FAR BETTER FIDELITY by this change, because plugins now ship ZERO React code, not just no direct imports.

### Action round-trip

Intent trees carry `actions` declaratively: `{ onClick: { pluginId, action, payload } }`. When user clicks, the renderer sends `{ type: "plugin_action", ... }` back to the server. Server dispatches to plugin's `onAction(action, payload)` handler. Plugin runs handler, emits new intent tree (if needed), broadcast → all clients update.

### flows-plugin migration: incremental, claim by claim

flows-plugin currently has 12 manifest claims, all using React components and the primitive registry. The migration sequences:

1. **Migrate the simplest claim first**: `SessionFlowActions` → server-side render emitting `{ primitive: "action-list", props: { actions: [...] } }`. Prove multi-client coherence with two browsers.
2. **Migrate the medium ones**: `FlowActivityBadge`, `FlowSummary` — simple shapes, low risk.
3. **Migrate command-routes** (`/flows`, `/flows:new`, etc.): these are dialog launchers. Server-side render with `primitive: "dialog-portal"` wrapping `primitive: "searchable-select-dialog"`.
4. **Keep the rich/interactive ones last**: `FlowGraph` (custom SVG canvas with zoom/pan), `FlowArchitect` (streamed transcript), `FlowAgentDetail` (multi-panel inspector). For these, the intent tree references a SINGLE "complex" primitive that wraps the existing React component verbatim. The plugin ships state on server; client renders the unchanged React component with state from broadcasts. NOT every claim must decompose to atomic primitives.

### `pluginize-flows-via-registry` archive: also superseded

The archived `pluginize-flows-via-registry` change established the pattern of plugins running per-client reducers via `useSessionEvents`. This change supersedes that pattern for state derivation: reducers run on the server, state distributes via broadcasts, clients consume the broadcast state. The `useSessionEvents` hook in `dashboard-plugin-runtime` remains available for plugins that legitimately want per-client event-stream access (rare), but is not the primary state pathway anymore.

### What is intentionally NOT included

- Removing the existing primitive registry CODE. Components stay registered; only the consumption pattern flips.
- Forcing every plugin to migrate immediately. flows-plugin migrates incrementally; honcho-plugin and jj-plugin (already server-state-driven via REST + broadcast, no primitive registry usage) need only adopt the new intent message type opportunistically.
- TUI / non-React clients. Every current client is React (browser, Electron, Capacitor mobile). The architecture doesn't preclude TUI support but doesn't require it.
- Cross-workspace plugin sharing. The intent format is JSON; another workspace could register the same primitive set and host the same plugins identically — but proving this is out of scope.

## Capabilities

### Modified Capabilities

- `dashboard-plugin-loader` — adds the intent protocol as a parallel rendering pathway. Plugins MAY emit intents via `broadcastToSubscribers` with `type: "plugin_intents"`. Slot consumers MAY render either from React component claims (legacy) OR from intent broadcasts (new).
- `dashboard-shell-slots` — slot consumers gain awareness of incoming intent broadcasts in addition to static React claims.
- `shared-protocol` (browser-protocol.ts) — adds two new message types: `plugin_intents` (server→browser) and `plugin_action` (browser→server).

### New Capabilities

- `plugin-intent-protocol` — the wire format and semantics of intent broadcasts. Defines `Intent`, `ActionDescriptor`, primitive resolution, action round-trip semantics, error handling (unknown primitive, malformed intent).

### Deprecated Capabilities

- `plugin-ui-primitive-registry` — the CONSUMER PATTERN of plugins calling `useUiPrimitive()` is deprecated. The registry mechanism itself survives, repurposed as the IntentRenderer's primitive-name → ComponentType lookup. Documentation is updated to mark `useUiPrimitive` from plugin code as legacy, suitable only for plugins that haven't migrated yet.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Intent vocabulary too narrow to express FlowGraph / FlowArchitect | HIGH | Allow "complex" primitives that wrap existing React components verbatim. Don't force decomposition. |
| Network latency on every plugin interaction | MEDIUM | Local optimistic UI in IntentRenderer; broadcasts confirm/replace. Plugin-emitted toast for action errors. |
| Server CPU cost for intent computation | LOW | Render is pure `state → tree`. Memoize on state reference. Existing plugin event rate is low. |
| Migration risk for in-flight flows-plugin work | MEDIUM | Migrate ONE claim at a time. Keep legacy refs-registry path working in parallel. Old + new can coexist; switch slot-by-slot. |
| Primitive registry deprecation breaks plugins still using it | LOW | Mark deprecated, don't delete. flows-plugin migrates over time. Repo-lint `no-primitive-direct-import` softened to warning during migration. |
| Bug 1 (cwd-based loader) lingers if not also fixed | HIGH | This change must also fix `discoverPlugins()` cwd dependency — otherwise server-side plugin code STILL doesn't load, and the new intent broadcasts never fire. |

## Success criteria

1. flows-plugin's `SessionFlowActions` migrated to intent-driven rendering. Two browsers open on the same server: clicking "+ New Flow" in browser A makes the dialog appear in browser B simultaneously (today: only A sees it).
2. `/api/health.plugins[]` reports the actual installed plugins (today: always `[]` for installed users). Server-side plugin loader uses installable manifest discovery, not `process.cwd()`.
3. `packages/honcho-plugin/src/server/plugin-state.ts:36`'s `broadcaster?.({...})` call is observed in the client (today: ignored — no client handler exists). honcho's status pill updates in real-time across clients on docker-compose state changes.
4. `useUiPrimitive` is marked deprecated in `packages/dashboard-plugin-runtime/src/ui-primitive-context.tsx`. Plugins migrating to intent rendering stop calling it. The primitive components remain registered for IntentRenderer's use.
5. Workspace topology supports re-registering the primitive set from a different package, demonstrating reusability (proof: a second workspace OR a fixture test imports `@blackbelt-technology/primitives` and renders flows-plugin's intents identically).

## Out of scope (follow-ups)

- TUI client support. Architecture doesn't preclude it; building it is a separate decision.
- Plugin install/uninstall UI. Origin's `add-plugin-activation-ui` proposal continues independently.
- Cross-workspace plugin distribution + npm-publishable primitives package. Validated as feasible by this design; separate change to ship it.
- Full deletion of the legacy refs-registry pathway. Defer until all first-party plugins have migrated.
