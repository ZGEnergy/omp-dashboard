## Context

The umbrella proposal `dashboard-plugin-architecture` is design-only. It froze the **slot taxonomy**, the **plugin manifest format**, and the **two-tier rendering model** (first-party React plugins + third-party descriptors) but ships no executable code. Two stub specs (`dashboard-shell-slots`, `dashboard-plugin-loader`) wait for an implementation change to populate their requirements.

Four sibling changes (`extract-openspec-as-plugin`, `extract-flows-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin`) are already scaffolded and ready to be mechanical refactors — but every one of them assumes the runtime exists. None of them can land first.

This change is the **only** prerequisite that unblocks the four extractions. It is intentionally scoped to runtime-only: the loader, slot registry, slot consumers, plugin context provider, Vite plugin, server-side REST endpoint, bridge auto-register/deregister logic, plus a tiny **internal** demo plugin used purely as an end-to-end fixture for tests. No OpenSpec, Flows, Subagents, or Git code moves in this change.

### Current state

- `packages/client/src/App.tsx` (1437 LOC) contains hardcoded conditional rendering for OpenSpec views, Flow views, MarkdownPreviewView, FileDiffView. This change adds slot consumers *alongside* those conditionals so nothing breaks. Each `extract-*-as-plugin` change later removes one conditional branch.
- `packages/client/src/components/SessionCard.tsx` directly imports `OpenSpecActivityBadge`, `FlowActivityBadge`, `SessionOpenSpecActions`, `SessionFlowActions`. This change adds `<SessionCardBadgeSlot/>` and `<SessionCardActionBarSlot/>` *next to* those imports.
- `packages/client/src/components/SessionList.tsx` directly imports `FolderOpenSpecSection`. This change adds `<SidebarFolderSectionSlot/>` next to it.
- `packages/client/src/components/SettingsPanel.tsx` (1300+ LOC, tabbed) hosts every settings section directly. This change adds `<SettingsSectionSlot/>` to one tab (or a new "Plugins" tab — decided in §"Decisions" below).
- `packages/server/src/server.ts` calls existing bootstrap helpers in sequence. This change adds two lines: `await loadServerEntries(ctx)` after the existing bootstrap completes.
- `packages/shared/src/bridge-register.ts` already manages the dashboard's own bridge entry under a single managed key. This change extends it to also manage `dashboard-<plugin-id>` keys.

### Constraints

- **Additive only.** No existing component or import is removed. Each extraction change does its own removal.
- **Tree-shaking matters.** Generated `plugin-registry.tsx` must let Vite tree-shake unused exports — otherwise the client bundle bloats with every plugin even when its slots are empty.
- **Failure isolation.** A plugin throwing on first render or load must not crash the shell. Slot consumer error boundaries catch React errors; loader catches server-side throws and surfaces them via `/api/health`.
- **Determinism.** Slot ordering must be stable across reloads, dev/prod builds, and OS file-listing order. Sort key is `(priority asc, plugin id asc)`.
- **Bridge writes are atomic.** The `~/.pi/agent/settings.json` writer used by `bridge-register.ts` is already atomic (tmp + rename); the plugin extension to manage `dashboard-<plugin-id>` keys must reuse the same helper, never bypass it.
- **No node_modules discovery.** Phase 1 globs `packages/*/package.json` only. The manifest is forward-compatible per `dashboard-plugin-architecture/design.md` §"Future Work: external plugin discovery".

### Stakeholders

- The four extraction changes (consumers of this runtime).
- Future first-party plugin authors (read the plugin context API).
- Anyone shipping a `pi-dashboard` distribution (must survive plugin failures).
- The `extension-ui-system` change (orthogonal; its descriptors target the same slot ids and will land independently).

## Goals / Non-Goals

**Goals**

- Ship a working slot registry, slot consumers, plugin context provider, Vite plugin, server-side loader, REST endpoint, and bridge auto-register — exactly as specified in the umbrella's two spec deltas.
- Prove the runtime end-to-end with one internal demo plugin that exercises `settings-section` (React + config persistence + reactive broadcast) and `tool-renderer` (custom React component rendering a synthetic tool name). The demo plugin is the test fixture; it never ships in a release build.
- Keep edits to `App.tsx` / `SessionCard.tsx` / `SessionList.tsx` / `SettingsPanel.tsx` minimal and additive (slot consumers added, no removals).
- Document the runtime so the four extraction changes are mechanical: each one creates `packages/<name>-plugin/`, moves files, declares slot claims in the manifest, and removes one direct import in the shell.

**Non-Goals**

- Migrating any concrete OpenSpec, Flow, Subagents, or Git code. Those are separate changes.
- Discovery from `node_modules`. Forward-compatible by design but not implemented.
- Plugin hot-reload at runtime. Server-side plugin changes require restart; client-side changes get HMR for free via Vite's normal pipeline.
- New descriptor variants for slots that the umbrella left as React-only (`session-card-action-bar`, `content-inline-footer`). The slot consumer is React-only in this change; descriptor variants would be a future minor bump in `extension-ui-system`.
- A `content-view-data` descriptor kind (deferred per umbrella).
- A plugin marketplace, sandboxed webviews, remote loading, or a "trusted authors" prompt.
- Migrating the existing `tool-renderers/registry.ts` to use the new `tool-renderer` slot. That happens in `extract-subagents-as-plugin`. Until then, the slot consumer falls through to the existing registry when no plugin claim matches.

## Decisions

### 1. New workspace package: `packages/dashboard-plugin-runtime/`

The runtime lives in a new workspace package, **not** as scattered helpers inside `packages/server` and `packages/client`. Rationale:

- Single import path for plugins: `@blackbelt-technology/dashboard-plugin-runtime/{context,types,server-context}`. Plugins never see internal dashboard paths.
- Tests run against the package's exported API, not internal helpers — same surface plugins consume.
- The `extract-*-as-plugin` changes can `import` from this package on both client and server without crossing workspace boundaries oddly.
- The package depends on `@blackbelt-technology/pi-dashboard-shared` (types only) and on React (peer); it does NOT depend on `packages/server` or `packages/client`. The shell depends on it, not the other way around.

**Alternatives considered:**
- Putting helpers inside `packages/shared`: rejected because the loader needs Fastify (server-side) and React (client-side), and `packages/shared` is intentionally environment-agnostic.
- Putting helpers inside `packages/server` and `packages/client` separately: rejected because plugins would need to import from two different packages depending on side; the package boundary is the public contract.

### 2. Slot registry shape: `Map<SlotId, ClaimEntry[]>`

Pre-sorted at registration time by `(priority asc, plugin id asc)`. Filter helpers (`forSession`, `forFolder`, `forCommand`) live on the registry, not on consumers — keeps consumers minimal.

A `ClaimEntry` is:

```ts
interface ClaimEntry {
  pluginId: string;
  priority: number;
  slot: SlotId;
  componentName?: string;
  command?: string;
  trigger?: string;
  config?: Record<string, unknown>;
  predicate?: (props: unknown) => boolean;
  // Resolved at registration time:
  Component?: React.ComponentType<any>;
}
```

The `Component` is resolved from the plugin's client module by `componentName`. Resolution happens once at registration; consumers never look up by name at render time.

### 3. Slot consumer pattern: one component per slot id

Each slot id gets a dedicated consumer component (`<SidebarFolderSectionSlot/>`, `<SessionCardBadgeSlot/>`, etc.). Each consumer:

1. Reads the registry via the `PluginContextProvider`.
2. Filters claims for the slot id.
3. Filters by props (e.g. `session-card-badge` consumer filters by `session` prop).
4. Renders each claim's component wrapped in an error boundary.
5. Renders nothing if zero claims match.

**Alternatives considered:**
- A single generic `<Slot id="...">` component: rejected because it loses TypeScript type safety on payload props. With one consumer per slot, the consumer's props type *is* the payload type for that slot.
- Slot consumers as render-prop functions: rejected because plugin authors expect drop-in components.

### 4. Slot consumer error boundary: per-claim, not per-slot

If three plugins contribute to `session-card-badge` and the second one's component throws, the first and third must still render. Implementation: each claim is wrapped in its own `<SlotErrorBoundary pluginId={...} slotId={...}>`. The boundary logs to console with plugin id and slot id, renders nothing for the failing claim, and continues with siblings. This matches the "Slot contributions degrade to no-op when payload is invalid" requirement in the umbrella spec.

**Alternatives considered:**
- One boundary per slot: rejected because a single plugin's crash would suppress all sibling plugins for the same slot.

### 5. Plugin context provider: tree-wide React context

`<PluginContextProvider>` wraps the entire app in `App.tsx`. The provider exposes:

- `useSessionState(sessionId)` — proxies the existing session-state hook
- `useAllSessions()` — proxies the existing all-sessions hook
- `usePluginConfig<T>(pluginId)` — subscribes to per-plugin config; re-renders on `plugin_config_update` broadcast; throws if called outside its plugin's component subtree (enforced via React context layering — see Decision 6)
- `send(message)` — proxies the existing WebSocket dispatch
- `pluginRouter: { open, close }` — proxies the existing route state
- `logger` — namespaced to the plugin id (resolved from the surrounding plugin context layer)

The `usePluginConfig` and `logger` are scoped to a *specific plugin id* via a nested context layer that the slot consumer pushes when rendering each claim's component. This means a plugin component reads its own config and logs under its own namespace without explicit id passing.

### 6. Per-plugin config namespace via nested context layer

When a slot consumer renders a contribution, it wraps the contribution component in `<CurrentPluginContext.Provider value={{ id, manifest }}>`. Hooks like `usePluginConfig<T>()` and `logger` read the nearest `CurrentPluginContext` to know which plugin's config to fetch and which namespace to log under. This keeps the public hook signature parameter-free (`usePluginConfig<T>()` not `usePluginConfig<T>("openspec")`) and prevents one plugin from reading another's config by passing the wrong id.

**Alternatives considered:**
- Explicit pluginId argument: rejected because plugins could pass any id and read each others' configs (the server enforces it on writes via §"Cross-plugin namespace access denied" but the client should also fail-fast on mistakes).
- Module-level pluginId set by the loader: rejected because it would require build-time codegen per plugin to inject the id.

### 7. Vite plugin: generated `plugin-registry.tsx` with static imports

`vite-plugin-dashboard-plugins` runs ahead of the React plugin. On dev start and on build, it:

1. Globs `packages/*/package.json` for `pi-dashboard-plugin` field.
2. Validates each manifest (Zod or hand-rolled schema; we'll pick Zod since the package already has manifest validation patterns elsewhere — see "Risks" below).
3. Generates `packages/client/src/generated/plugin-registry.tsx`:
   ```ts
   // GENERATED — do not edit
   import * as openspecPlugin from "@blackbelt-technology/openspec-plugin/client";
   import * as flowsPlugin from "@blackbelt-technology/flows-plugin/client";
   export const PLUGIN_REGISTRY = [
     { id: "openspec", priority: 100, claims: [...], module: openspecPlugin },
     { id: "flows", priority: 100, claims: [...], module: flowsPlugin },
   ];
   ```
4. Watches the manifest files; on change, regenerates and triggers HMR (Vite's `server.moduleGraph.invalidateModule` + `server.ws.send`).

The generated file is committed to `.gitignore` under `packages/client/src/generated/` to avoid noisy diffs.

**Alternatives considered:**
- Dynamic imports at runtime via `import(pluginUrl)`: rejected because Vite cannot tree-shake or code-split dynamic strings; bundle bloat would defeat the purpose.
- A custom resolver that fakes a virtual module: rejected because the generated `.tsx` file is more debuggable for plugin authors.

### 8. Tree-shaking guarantee via deliberate test fixture

To prove the bundler tree-shakes unused exports from a plugin, the test suite includes a fixture plugin exporting two components, where only one is claimed in the manifest. The build bundle is asserted to contain only the claimed component — failing the test if both are present. This is non-negotiable: without it, every additional plugin grows the client bundle with dead code.

### 9. Server-side loader: dynamic import + typed `ServerPluginContext`

`packages/dashboard-plugin-runtime/src/loader.ts` exports `loadServerEntries(ctx: ServerStartupContext): Promise<void>`. The function:

1. Globs the same manifests the Vite plugin reads (or accepts them from a discovery cache to avoid double-globbing on startup).
2. For each enabled plugin with a `server` entry, dynamic-imports the entry module.
3. Constructs a `ServerPluginContext` (Fastify, sessionManager, eventStore, broadcastToSubscribers, registerPiHandler, registerBrowserHandler, getPluginConfig, updatePluginConfig, namespaced logger).
4. Awaits the plugin's default-exported `registerPlugin(ctx)`. Awaiting is mandatory; the loader does not return until all plugin registrations complete (so `/api/health` is accurate immediately).
5. Catches throws/rejects per plugin: logs the error, marks the plugin failed in an in-memory status store, and continues to the next plugin. Failures surface via `/api/health.plugins[]`.

`ServerPluginContext.updatePluginConfig` and `getPluginConfig` are typed via the plugin's `configSchema` if present. JSON-Schema validation uses Ajv (already a dependency of Fastify, so no new dependency).

### 10. REST endpoint `POST /api/config/plugins/:id`

Lives in a new file `packages/server/src/routes/plugin-config-routes.ts`. Responsibilities:

1. Validate `:id` matches an installed, enabled plugin; else 404.
2. Validate body against the plugin's `configSchema`; else 400 with the Ajv error list.
3. Read `~/.pi/dashboard/config.json`, merge `plugins.<id>` with the body, write atomically (tmp + rename — same helper as core config).
4. Broadcast `plugin_config_update { id, config }` to all subscribed browsers via the existing `broadcastToSubscribers`.
5. Return `{ success: true, config: <merged> }`.

The endpoint is auth-gated via the same plugin chain as other config writes (no special exception). The endpoint is independent from `POST /api/config` (core config) — they never cross-update.

### 11. `plugin_config_update` added to browser protocol

Added to `ServerToBrowserMessage` union in `packages/shared/src/browser-protocol.ts`. Per project AGENTS.md: every message type **must** be in the union — `as any` switch cases are stripped by esbuild in production. This is a known prior-art gotcha (see `prompt_request`/`prompt_dismiss`/`prompt_cancel`).

The payload shape:

```ts
interface PluginConfigUpdate {
  type: "plugin_config_update";
  id: string;          // plugin id
  config: unknown;     // ONLY this plugin's namespace; never other plugins' configs
}
```

Cross-plugin config never appears in the payload (privacy/isolation requirement).

### 12. `/api/health.plugins[]` field

Added to the existing `/api/health` response. Each plugin produces one entry:

```ts
interface PluginStatus {
  id: string;
  enabled: boolean;
  loaded: boolean;
  error?: string;
  claims: number;
}
```

The field lives next to the existing `mode`/`version`/etc. fields. Backwards-compatible: clients that don't read it are unaffected.

### 13. Bridge auto-register: extend `bridge-register.ts`

`packages/shared/src/bridge-register.ts` already writes the dashboard's own bridge entry. We extend it (or add a sibling helper in the same file) to manage `dashboard-<plugin-id>` keys for each plugin that declares a `bridge` entry. Specifically:

1. On loader startup, after server entries register, the loader collects all plugins with a `bridge` entry.
2. For each, write `~/.pi/agent/settings.json` `extensions[]` entry with key prefix `dashboard-<plugin-id>` pointing at the absolute resolved path.
3. On disable (config change `plugins.<id>.enabled = false` plus restart), remove the entry.
4. Never touch entries without the `dashboard-` prefix.

The atomic-write helper in `bridge-register.ts` is reused as-is.

### 14. SettingsPanel slot placement: per-tab `<SettingsSectionSlot/>` consumer

The umbrella spec assumed a flat list with plugin contributions appended below core. The actual `SettingsPanel.tsx` is tabbed (General, Servers, Packages, Providers, Security, Advanced). We resolve the gap (flagged in umbrella tasks 1.5) by:

1. Each `settings-section` claim's manifest may declare a `tab` field (`"general" | "servers" | "packages" | "providers" | "security" | "advanced"` — defaults to `"general"`).
2. We render `<SettingsSectionSlot tab="<tab>"/>` at the bottom of each tab. The consumer filters claims for that tab and renders them in priority order.

This keeps existing tab structure intact and lets plugin authors choose the most natural home for their settings. The `tab` field on the manifest is added to the manifest schema in this change (forward-compatible; manifests without it default to "general").

**Alternatives considered:**
- A new dedicated "Plugins" tab: rejected because it forces plugin settings into a separate ghetto, which is exactly what the umbrella was trying to avoid (plugins should feel first-class).
- Always render in "Advanced" tab: rejected because future plugins may have user-facing settings that belong in "General".

### 15. Demo plugin lives in `packages/demo-plugin/` and is `private: true`

Purpose: a single, minimal end-to-end fixture that exercises `settings-section` and `tool-renderer` slots so we can write integration tests against a real plugin without depending on any of the four extraction changes.

The demo plugin:

- Manifest: `id: "demo"`, `priority: 1000`, claims `settings-section` (renders a tiny form persisting two fields) and `tool-renderer` (`toolName: "DashboardDemo"`, renders any tool call with that name as a green box).
- `package.json` has `"private": true` so `npm publish -ws` skips it (per project pattern with `packages/electron`).
- Listed in `.gitignore`-adjacent test-fixture documentation (or kept as `e2e-fixture` after first plugin extraction lands; deletion is a follow-up cleanup once OpenSpec/Flows extractions are in production).

This is **not** a feature plugin. It will not appear in any user-facing UI in a release build because the build pipeline excludes it (the Vite plugin config skips packages with `private: true && pi-dashboard-plugin.fixture: true`).

### 16. Slot consumer types live in `packages/shared/src/dashboard-plugin/`

Types shared across server (loader, REST validation), client (slot consumers, plugin context), and runtime (registry):

- `slot-types.ts` — `SlotId` union, `SlotProps<SlotId>` map, `Multiplicity` enum, `PayloadTier` enum, `SLOT_DEFINITIONS` record
- `manifest-types.ts` — `PluginManifest`, `PluginClaim` types
- `plugin-status.ts` — `PluginStatus`, `PluginConfigUpdate` types

`packages/dashboard-plugin-runtime` and `packages/server`, `packages/client` all import from this single source.

## Risks / Trade-offs

**[Risk] Generated `plugin-registry.tsx` causes flaky HMR** → **Mitigation**: the Vite plugin only regenerates when manifest content changes (hash compare), not on every save. Plugin source code changes flow through Vite's normal HMR without regenerating the registry. We test HMR in dev mode with a manifest edit, with a plugin source edit, and with a non-plugin file edit.

**[Risk] `plugins.<id>.*` namespace collision with existing top-level config keys** → **Mitigation**: Phase 1 reserves `plugins` as a top-level key in `~/.pi/dashboard/config.json`. The existing `parseDashboardConfig` ignores unknown keys (no schema enforcement on legacy keys). The runtime adds `plugins` as a known top-level key to `parseDashboardConfig`, but legacy keys (`openspec`, `flows`) remain untouched at top-level for backward compatibility — extraction changes migrate them to `plugins.<id>.*`.

**[Risk] Slot consumer ordering drifts under HMR** → **Mitigation**: registry is sorted once at registration; HMR re-runs registration; sort is deterministic by `(priority, id)`. Tests assert ordering is stable across three reload cycles.

**[Risk] Tree-shaking fails because Vite can't statically analyze `module.<componentName>` lookup** → **Mitigation**: the generated registry uses `import * as plugin` which preserves all exports. To force tree-shaking, the generated registry uses **named imports per claim**:
```ts
import { OpenSpecBadge, OpenSpecActionBar, ArchiveView } from "@blackbelt-technology/openspec-plugin/client";
```
This is the canonical Vite pattern and is what the dedicated tree-shaking test fixture verifies.

**[Risk] Bridge auto-register race during dashboard restart while pi mid-bootstrap** → **Mitigation**: atomic write (tmp + rename) guarantees pi sees either the old or the new file, never a half-written one. The race window is the OS-level `rename` syscall, which is atomic on POSIX and Windows NTFS. Tested by writing the file under load with a parallel reader.

**[Risk] `dashboard-<plugin-id>` key collides with a user-authored extension entry of the same name** → **Mitigation**: the `dashboard-` prefix is reserved by documentation in the manifest spec and in `~/.pi/agent/settings.json` extension docs. Tests cover the case where a user has a `dashboard-myplugin` entry: the loader detects the collision (entry exists but path doesn't match the plugin's resolved bridge path) and logs a warning. We do NOT overwrite the user's entry; we skip the bridge registration for that plugin and surface the conflict via `/api/health`.

**[Risk] Demo plugin accidentally ships in a release build** → **Mitigation**: Vite plugin filters out manifests where `pi-dashboard-plugin.fixture === true && process.env.NODE_ENV === "production"`. Tests assert that production builds contain zero references to `@blackbelt-technology/demo-plugin`.

**[Risk] `usePluginConfig<T>()` outside a plugin component throws unhelpfully** → **Mitigation**: the hook reads `CurrentPluginContext`; if the context is not provided, it throws `"usePluginConfig must be called from a plugin slot contribution; if you need a plugin's config from outside, use server-side getPluginConfig"`. Test covers the error message.

**[Risk] `plugin_config_update` payload accidentally contains other plugins' configs (e.g. via JSON.stringify of full state)** → **Mitigation**: the broadcast helper accepts only `{ id, config }` where `config` is the plugin's namespace subset. A unit test asserts the payload shape never grows. Adding a server-side typed schema for the broadcast (Ajv) is overkill but documented as future work.

**[Risk] Plugin manifest validation library choice (Zod vs Ajv vs hand-rolled)** → **Mitigation**: use **hand-rolled** validation in this change (~50 LOC, no new dependency). The manifest is small and the schema is stable. Each `extract-*-as-plugin` change adds a few fields to its manifest; the validator gets a corresponding update. Move to Ajv if/when manifest complexity demands it. Rationale: avoid pulling in Zod just for one-time startup validation.

**[Risk] OpenSpec/Flows extraction changes break because slot semantics are subtly different from current direct-import semantics** → **Mitigation**: the slot consumer's prop type is the single source of truth. Each extraction change is responsible for matching props; this change publishes `SlotProps<SlotId>` and writes type-level tests that pin down each slot's prop shape. If `extract-openspec-as-plugin` requires a new prop, that's a change to `SlotProps` (minor bump in `pi-dashboard-shared`) and a documented update to slot consumers.

## Migration Plan

This change is purely additive — no migration is needed for users.

**Deploy:**
1. Land this change. Existing UI is unchanged because no plugin claims slots yet (only the demo plugin does, and the demo plugin renders only when explicitly enabled in dev or test).
2. Run the test suite end-to-end including the demo plugin.
3. Verify `/api/health.plugins[]` returns one entry (the demo) in dev, zero in a stripped production build.

**Rollback:**
- Revert the change. No persisted state migrates (the `plugins.<id>.*` namespace is empty until extractions populate it). The four extraction changes are blocked but have no other dependency on this code.

**Forward-compatible follow-ups (not in this change):**
- `extract-openspec-as-plugin` lands → first real plugin populates `sidebar-folder-section`, `session-card-badge`, `session-card-action-bar`, `command-route`, `anchored-popover`.
- `extract-flows-as-plugin` lands → `session-card-badge`, `session-card-action-bar`, `content-header-sticky`, `content-inline-footer`, `command-route`.
- `extract-subagents-as-plugin` lands → `tool-renderer` (and removes `packages/client/src/components/tool-renderers/registry.ts`).
- `extract-git-as-plugin` lands → `session-card-badge`, plus REST routes registration through the plugin's server entry (validates the loader's server-side path end-to-end).

## Open Questions

None. The umbrella resolved every architectural question; this change is straightforward implementation.

If any unknown emerges during implementation (e.g. a Vite version bump changes HMR behavior in a way that breaks generated-file invalidation), it is documented in `tasks.md` and resolved before archive.
