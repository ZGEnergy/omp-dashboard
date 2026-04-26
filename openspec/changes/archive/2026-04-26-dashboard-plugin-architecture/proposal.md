## Why

The dashboard today bakes OpenSpec and pi-flows rendering directly into its core (`packages/client`, `packages/server`). A scan of the layout shows ~65 OpenSpec files and ~12 Flow rendering files entangled with `App.tsx`, the session card, the session list, and the content area. Adding a new first-party concept (e.g. ragger, a custom RAG explorer, a future judo workspace view) means editing the same core files. The dashboard is becoming a feature dumping ground.

The proposal `extension-ui-system` introduced a descriptor-based protocol that lets *third-party* extensions emit data and have the dashboard render it. That's necessary but not sufficient — descriptor-only UI cannot express OpenSpec's `ArchiveBrowserView`, `OpenSpecPreview`, `TasksPopover`, or pi-flows' `FlowDashboard` / `FlowArchitect` / `FlowAgentDetail` without an explosion of schema. The dashboard needs a second tier: **first-party plugins** that ship real React (tree-shaken into the web build) and register concrete components into named shell slots.

This proposal defines that second tier — the **shell slot taxonomy**, the **plugin loader**, and the **two-tier rendering model** where third-party descriptors and first-party React components target the *same* slot contract.

After this lands, OpenSpec and pi-flows rendering migrate into `packages/openspec-plugin/` and `packages/flows-plugin/` (separate follow-up changes). `App.tsx` shrinks dramatically because all conditional content rendering becomes "find the plugin claiming this slot/route and render its component."

## What Changes

- **NEW**: Two-tier rendering model — every slot in the dashboard shell has a payload contract; first-party plugins fill slots with React components, third-party extensions fill descriptor-renderable slots with serialized data.
- **NEW**: Shell slot taxonomy — a frozen list of named regions where contributions land:
  - `sidebar-folder-section` (per-workspace collapsible above the session list)
  - `session-card-badge` (per-session info chip in the card header)
  - `session-card-action-bar` (per-session action buttons in the card footer)
  - `content-view` (full-screen content area; replaces `ChatView`)
  - `content-header-sticky` (sticky element above the content view)
  - `content-inline-footer` (inline element below the content view, above input)
  - `anchored-popover` (popover anchored to a UI element)
  - `command-route` (maps a slash command or URL route to a `content-view`)
  - **`settings-section`** (a section in the dashboard's Settings page; first-party plugins ship React, third-party extensions ship a JSON Schema rendered via RJSF or a simple `UiField` form)
  - **`tool-renderer`** (a custom React renderer for a specific `tool_call` name — unblocks plugins like `subagents-plugin` that today live as hardcoded `tool-renderers/registry.ts` entries)
  - Plus all descriptor-renderable slots already defined by `extension-ui-system` (`management-modal`, `footer-segment`, `agent-metric`, `breadcrumb`, `gate`, `toast`, `rjsf-form`)
- **NEW**: Plugin-contributed settings — plugins persist their settings under `plugins.<id>.*` in `~/.pi/dashboard/config.json`, validated against the manifest's `configSchema` (JSON Schema), reactively read via the plugin context's `usePluginConfig<T>()` hook. Settings UI lands in `settings-section` slot. Existing core settings (auth, providers, network, packages) remain owned by the dashboard shell.
- **NEW**: Dashboard plugin loader — discovers monorepo packages with a `pi-dashboard-plugin` manifest, loads their server contributions on startup, and bundles their client contributions into the web build.
- **NEW**: Plugin manifest format — declares which slots a plugin claims, the React component for each, and any server-side hooks (REST routes, polling, WebSocket message types).
- **NEW**: Plugin context API — the runtime exposed to plugins (`useSessionState()`, `usePluginConfig()`, `pluginRouter`, etc.) so plugins can read shared state and dispatch actions without reaching into dashboard internals.
- **NEW**: Slot precedence and conflict rules — when multiple plugins claim the same `command-route`, or two badges, or two content headers, who wins.
- **NOT INTRODUCED**: Hot reload of plugins. Plugins load on startup; reload requires server restart.
- **NOT INTRODUCED**: Webview-style plugin sandboxing. First-party plugins are trusted because they live in the same monorepo and pass the same review.
- **NOT INTRODUCED**: Concrete migration of OpenSpec, pi-flows, pi-subagents tool renderers, or git integration. Those land in separate changes (`extract-openspec-as-plugin`, `extract-flows-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin`).
- **NEW concept**: "bundled-by-default plugin" — plugins that ship in every standard distribution because the dashboard would feel broken without them (e.g. `git-plugin`). Mechanically identical to other plugins (same manifest format, same loader); the only difference is whether the build pipeline includes them in `packages/` by default. Disable via `plugins.<id>.enabled = false`.
- **NOT INTRODUCED**: Discovery of plugins from `node_modules/`. Phase 1 plugin loader scans the monorepo only. The manifest format is forward-compatible with npm-installed plugins (the `pi-dashboard-plugin` field works in any `package.json`); npm-scan is documented as Future Work and unblocks the eventual "PR a plugin into `@tintinweb/pi-subagents`" path — see `design.md` §"Future Work: external plugin discovery".

This proposal is **design-only**. It produces the slot contract and plugin loader spec; the runtime implementation and the actual extractions land in follow-up changes.

## Capabilities

### New Capabilities

- `dashboard-shell-slots`: the named regions where plugins (first-party React) and extensions (third-party descriptors) contribute UI. Defines payload contracts, placement, lifecycle, and conflict resolution per slot.
- `dashboard-plugin-loader`: the runtime that discovers, loads, and registers first-party plugins on startup. Defines plugin manifest format, contribution lifecycle, build integration, and the plugin-facing context API.

### Modified Capabilities

None. `extension-ui-system` is referenced as the descriptor-protocol counterpart but not modified — its requirements stand. The two capabilities (`dashboard-shell-slots` and `extension-ui-system`) co-exist: shell-slots defines *where* things land; extension-ui-system defines *how* third-party data reaches descriptor-renderable slots.

## Impact

- `packages/client/src/App.tsx` — eventual major reduction (from ~1437 LOC to ~400). Conditional content rendering replaced with slot dispatch. Lands incrementally during follow-up extractions, not in this design.
- `packages/client/src/components/SessionCard.tsx` — badges and action bars become slot consumers.
- `packages/client/src/components/SessionList.tsx` — folder section becomes a slot consumer.
- `packages/server/src/server.ts` — calls plugin loader on startup; existing route registration stays.
- `packages/shared/src/dashboard-plugin/` — NEW module with manifest types, slot types, plugin context types.
- `packages/dashboard-plugin-runtime/` — NEW package with the loader implementation, slot registry, and plugin context provider.
- `vite.config.ts` (client build) — plugin discovery + bundling integration.
- Follow-up changes:
  - `extract-openspec-as-plugin` — moves 65 OpenSpec files into `packages/openspec-plugin/` (scaffolded by this proposal)
  - `extract-flows-as-plugin` — moves 12 Flow rendering files into `packages/flows-plugin/` (scaffolded by this proposal)

## References

- Sibling design (descriptor protocol, third-party tier): `openspec/changes/extension-ui-system/`
- Layout scan: see `design.md` § "Current dashboard layout (scan results)"
- Inspiration: VS Code Activity Bar / Side Bar / Editor Group plugin model; the contract-and-tree-shake approach used by Astro integrations and Next.js plugins.
