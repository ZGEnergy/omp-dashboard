## Why

The umbrella proposal `dashboard-plugin-architecture` defines the **slot taxonomy** and **plugin loader contract** as design-only artifacts. That gives us the schema and the ADRs but no working code. Before any concrete extraction (`extract-openspec-as-plugin`, `extract-flows-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin`) can land, the dashboard shell needs the actual runtime: the plugin discovery glob, the slot registry, the slot consumer components, the Vite plugin that generates the static registry, and the `PluginContext` provider tree.

This change implements that runtime — and **only** that runtime. It introduces a tiny built-in "demo plugin" purely to exercise the loader, the slot registry, and the `settings-section` + `tool-renderer` slots end-to-end so the seam is proven before real plugins consume it. After this lands, the four `extract-*-as-plugin` changes become mechanical: each one moves files into a new `packages/<name>-plugin/` package with a manifest and slot claims; no shell changes needed.

This change DEPENDS ON `dashboard-plugin-architecture` having been reviewed and any spec drift resolved. It does NOT depend on any concrete plugin extraction landing first.

## What Changes

- **NEW**: `packages/dashboard-plugin-runtime/` — a new workspace package containing:
  - `src/loader.ts` — server-side glob, manifest validation (Zod or hand-rolled), priority-sort, dynamic-import driver. Exports `discoverPlugins()`, `loadServerEntries()`, `getRegistry()`.
  - `src/slot-registry.ts` — typed `Map<SlotId, ClaimEntry[]>` with priority-then-id ordering, plus filter helpers.
  - `src/plugin-context.tsx` — React context provider exposing `useSessionState`, `useAllSessions`, `usePluginConfig<T>()`, `send`, `pluginRouter`, `logger`. Fully typed, lives behind a stable import path (`@blackbelt-technology/dashboard-plugin-runtime/context`).
  - `src/slot-consumers.tsx` — one consumer per slot id (`<SidebarFolderSectionSlot/>`, `<SessionCardBadgeSlot/>`, `<SessionCardActionBarSlot/>`, `<ContentViewSlot/>`, `<ContentHeaderStickySlot/>`, `<ContentInlineFooterSlot/>`, `<AnchoredPopoverSlot/>`, `<CommandRouteSlot/>`, `<SettingsSectionSlot/>`, `<ToolRendererSlot/>`). Each is a thin component that reads the registry, filters by props, and renders contributions in priority order with a per-slot error boundary.
  - `src/vite-plugin-dashboard-plugins.ts` — a Vite plugin that scans monorepo `packages/*/package.json` for `pi-dashboard-plugin` manifests, generates `packages/client/src/generated/plugin-registry.tsx` with static imports, and triggers HMR on manifest changes during dev.
  - `src/server-context.ts` — `ServerPluginContext` factory exposing `fastify`, `sessionManager`, `eventStore`, `broadcastToSubscribers`, `registerPiHandler`, `registerBrowserHandler`, `getPluginConfig<T>()`, `updatePluginConfig<T>()`, namespaced `logger`.
- **NEW**: `packages/shared/src/dashboard-plugin/` — manifest types, slot id union, `SlotProps<SlotId>` map, `PluginManifest`, `PluginClaim` types. Plain types only; the runtime imports from here.
- **NEW**: `POST /api/config/plugins/:id` REST endpoint with JSON-Schema validation, broadcast of `plugin_config_update` to all subscribers (added to the browser protocol union in `packages/shared/src/browser-protocol.ts`).
- **NEW**: `/api/health.plugins[]` field — discovery + load status per plugin.
- **NEW**: `~/.pi/agent/extensions/` auto-register/deregister logic for plugins declaring a `bridge` entry (managed via `dashboard-<plugin-id>` keys; user-owned entries left alone). Uses the same atomic-write helpers `extension-register.ts` already uses for the dashboard's own bridge.
- **NEW**: A demo plugin at `packages/demo-plugin/` (kept private, not published) that:
  - Claims `settings-section` with a tiny React form persisting two fields under `plugins.demo.*`.
  - Claims `tool-renderer` for a synthetic `toolName: "DashboardDemo"`.
  - Exists solely to drive the runtime tests; deleted (or kept as `e2e-fixture`) once real plugins consume the runtime.
- **NEW**: Vitest suites covering manifest validation (good/bad), priority ordering, registry filtering, slot consumer error-boundary fallback, REST endpoint validation, broadcast fan-out, bridge auto-register/deregister.
- **MODIFIED**: `packages/client/src/App.tsx` — wraps the app in `<PluginContextProvider>`. Replaces the **shell-level** conditional rendering with slot consumers (`<ContentViewSlot/>`, `<ContentHeaderStickySlot/>`, `<ContentInlineFooterSlot/>`). The OpenSpec/Flow/Diff-specific conditionals stay until their respective `extract-*-as-plugin` changes move them. So `App.tsx` shrinks slightly here and dramatically once the extractions land.
- **MODIFIED**: `packages/client/src/components/SessionCard.tsx` — adds `<SessionCardBadgeSlot session={s}/>` and `<SessionCardActionBarSlot session={s}/>` rendering *alongside* the existing direct `OpenSpecActivityBadge`/`FlowActivityBadge`/`SessionOpenSpecActions`/`SessionFlowActions` imports (so nothing breaks). Direct imports are removed when each `extract-*-as-plugin` change ships.
- **MODIFIED**: `packages/client/src/components/SessionList.tsx` — adds `<SidebarFolderSectionSlot folder={f}/>` next to `FolderOpenSpecSection`. Same coexistence pattern.
- **MODIFIED**: `packages/client/src/components/SettingsPanel.tsx` — adds a `<SettingsSectionSlot/>` consumer below the existing core sections (General, Auth, Providers, Network, Packages, Pi Core, Tools). Plugin contributions render below the divider.
- **MODIFIED**: `vite.config.ts` (client build) — wires `vite-plugin-dashboard-plugins` ahead of the React plugin.
- **MODIFIED**: `packages/server/src/server.ts` — calls `loadServerEntries(fastify, …)` after server bootstrap completes.

- **NOT INTRODUCED**: Any concrete migration of OpenSpec, Flows, Subagents, or Git code. Those land in their own changes; this runtime is the prerequisite that unblocks them.
- **NOT INTRODUCED**: Discovery from `node_modules`. Phase 1 scans `packages/*/package.json` only. The manifest format is forward-compatible (see `dashboard-plugin-architecture/design.md` §"Future Work: external plugin discovery").
- **NOT INTRODUCED**: Plugin hot-reload at runtime. Server-side plugin changes require restart; client-side changes get HMR for free via Vite.
- **NOT INTRODUCED**: The new descriptor kinds left undecided in `dashboard-plugin-architecture/design.md` (`session-card-action-bar`, `content-view-data`). The slot consumer for those slots is React-only in this change; descriptor variants are a future minor bump in `extension-ui-system`.

## Capabilities

### New Capabilities

None. This change implements the requirements set out in the umbrella's `dashboard-shell-slots` and `dashboard-plugin-loader` capability spec deltas.

### Modified Capabilities

- `dashboard-shell-slots` — populates the spec stub with the actual runtime contract.
- `dashboard-plugin-loader` — populates the spec stub with the actual loader contract.

## Impact

- `packages/dashboard-plugin-runtime/` — NEW package (~800–1200 LOC including tests).
- `packages/shared/src/dashboard-plugin/` — NEW directory (~150 LOC of types).
- `packages/demo-plugin/` — NEW (~80 LOC; private workspace).
- `packages/client/src/App.tsx` — small reduction (~50 LOC) by replacing two or three shell-level conditional branches with slot consumers; the OpenSpec/Flow conditionals remain until extraction.
- `packages/client/src/components/SessionCard.tsx`, `SessionList.tsx`, `SettingsPanel.tsx` — additive (slot consumers added; existing imports kept until extracted).
- `packages/server/src/server.ts` — adds two lines (`await loadServerEntries(...)`).
- `vite.config.ts` — one new plugin in the chain.
- `packages/server/src/routes/` — new `plugin-config-routes.ts` for the per-plugin REST endpoint.
- `packages/server/src/extension-register.ts` — extended to also manage `dashboard-<plugin-id>` entries.
- `packages/shared/src/browser-protocol.ts` — adds `plugin_config_update` to the message union.

## Migration Risks

- **Slot consumer ordering**: real plugins may register at different priorities; getting deterministic order right (especially under HMR) requires careful tests.
- **Tree-shaking**: if generated `plugin-registry.tsx` doesn't tree-shake unused exports, the client bundle bloats. We need a deliberate test fixture that imports two exports from a plugin and uses one, then checks the bundle output.
- **Bridge auto-register race**: if the dashboard restarts while a pi session is mid-bootstrap, the `settings.json` write could race with pi reading the file. We use the same atomic-write helper as `extension-register.ts` so the race window is tiny but not zero.
- **`dashboard-<plugin-id>` key namespace collisions** with user-managed entries: we lock the prefix and document it; user entries with that exact prefix are extremely unlikely but tests should cover the case.

## References

- Umbrella design: `openspec/changes/dashboard-plugin-architecture/design.md`
- Slot taxonomy spec: `openspec/changes/dashboard-plugin-architecture/specs/dashboard-shell-slots/spec.md`
- Plugin loader spec: `openspec/changes/dashboard-plugin-architecture/specs/dashboard-plugin-loader/spec.md`
- Sibling extractions waiting on this: `extract-openspec-as-plugin`, `extract-flows-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin`.
