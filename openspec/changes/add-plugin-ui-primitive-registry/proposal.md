## Why

The dashboard plugin architecture today gives plugins ONE direction of UI sharing: **plugin → shell** via slots. Plugins claim a slot id, ship a React component, and the dashboard renders it. This is Robert's `dashboard-plugin-architecture` design from 2026-04-26 and it works for SIMPLE contributions (badges, action bars, settings panels). jj-plugin, demo-plugin, and flows-anthropic-bridge-plugin all follow this pattern cleanly.

It does NOT give plugins the OTHER direction — **shell → plugin** — for accessing dashboard primitives like `MarkdownContent`, `AgentCardShell`, `ConfirmDialog`, `DialogPortal`. When a plugin needs to render rich content, today it has to import these primitives by package name, which means:

1. The primitives must live in a published workspace package (currently `packages/client-utils/`, established by superseded change `complete-flows-plugin-migration` Layer 0a).
2. Every plugin that uses primitives drags them as transitive dependencies into its install footprint. flows-plugin's tarball would include the markdown stack (~1.1 MB) even when consumers don't need it.
3. Updating a primitive (e.g. `MarkdownContent` gains a new prop) requires republishing every plugin that imports it.
4. Each new plugin extraction repeats the same primitive-import dance. Extract-openspec-as-plugin, extract-git-as-plugin, extract-subagents-as-plugin (all proposed) face the IDENTICAL problem. Their proposals don't even mention it — the gap is repo-wide.

A registry inverts the relationship. The dashboard registers its primitives under stable string keys at startup. Plugins look them up via `useUiPrimitive("ui:markdown-content")` and call them. Plugins ship ZERO React component code for the primitives — just data and intent. The four upcoming extractions become mechanical: each plugin claims slots and consumes primitives via the registry, never importing them directly.

This proposal builds that registry, keeps the existing `client-utils` package as the implementation host (the dashboard registers components from it), and migrates flows-plugin's 11 direct primitive imports to registry lookups as the first consumer.

## What Changes

### New shared module — primitive contracts

- **NEW**: `packages/shared/src/dashboard-plugin/ui-primitives.ts` defines:
  - `UI_PRIMITIVE_KEYS` — frozen object map of stable string keys (`"ui:markdown-content"`, `"ui:agent-card"`, `"ui:confirm-dialog"`, etc.).
  - `UiPrimitiveMap` — typed map of key → component prop signature. Each entry is the public contract for that primitive. Adding a key is non-breaking; renaming or removing is breaking.

The primitives covered (initial set, sized to flows-plugin + the three planned extractions):

| Key | Type | Source today | Consumers |
|---|---|---|---|
| `ui:agent-card` | `ComponentType<{name, status, headerRight?, stats?, onClick?, selected?, children?}>` | `client-utils/AgentCardShell.tsx` | flows-plugin, subagents-plugin (planned) |
| `ui:markdown-content` | `ComponentType<{content: string}>` | `client/components/MarkdownContent.tsx` | flows-plugin, openspec-plugin (planned), subagents-plugin (planned) |
| `ui:confirm-dialog` | `ComponentType<{message, confirmLabel?, onConfirm, onCancel}>` | `client-utils/ConfirmDialog.tsx` | flows-plugin, git-plugin (planned), openspec-plugin (planned) |
| `ui:dialog-portal` | `ComponentType<{children}>` | `client-utils/DialogPortal.tsx` | flows-plugin, openspec-plugin (planned), git-plugin (planned) |
| `ui:searchable-select-dialog` | `ComponentType<{title, options, onSelect, onCancel, placeholder?, emptyMessage?}>` | `client-utils/SearchableSelectDialog.tsx` | flows-plugin, git-plugin (planned) |
| `ui:zoom-controls` | `ComponentType<{onZoomIn, onZoomOut, onReset, scale}>` | `client-utils/ZoomControls.tsx` | flows-plugin |
| `ui:format-tokens` | `(n: number) => string` | `client-utils/agent-card-utils.ts` | flows-plugin, subagents-plugin (planned) |
| `ui:format-duration` | `(ms: number) => string` | `client-utils/agent-card-utils.ts` | flows-plugin, subagents-plugin (planned) |

Eight initial keys. Sized for the four planned plugin consumers.

### New runtime — primitive registry + provider + hook

- **NEW**: `packages/dashboard-plugin-runtime/src/ui-primitive-registry.ts`:
  - `createUiPrimitiveRegistry()` — creates an empty Map<key, impl>.
  - `registerUiPrimitive(reg, key, impl)` — type-safe registration. TypeScript verifies the impl matches the contract for the key.
  - Strict-mode validation: throws if the same key is registered twice (no silent override).

- **NEW**: `packages/dashboard-plugin-runtime/src/ui-primitive-context.tsx`:
  - `<UiPrimitiveProvider value={registry}>` — provides the registry to descendants.
  - `useUiPrimitive(key)` — returns the registered impl, OR throws a clear error if the key isn't registered (no silent null).
  - `useUiPrimitiveOrNull(key)` — soft variant for plugins that want to gracefully degrade.

- **NEW**: `packages/dashboard-plugin-runtime/src/__tests__/ui-primitive-registry.test.tsx` covering: registration, lookup, double-registration error, missing-key error in strict hook, soft hook returns null, type contract validation at build time.

### Dashboard registers all primitives at startup

- **MODIFIED**: `packages/client/src/main.tsx` (or wherever `<App>` is mounted) — creates the registry, registers the eight primitives, wraps `<App>` in `<UiPrimitiveProvider>`. Implementations come from existing locations: client-utils (most) + client/components/MarkdownContent.tsx (markdown only).

### flows-plugin migrates from direct imports to registry lookups

- **MODIFIED**: `packages/flows-plugin/src/client/*.tsx` — 11 direct imports of primitives become 11 `useUiPrimitive()` lookups + invocations. Specifically:
  - `FlowAgentCard.tsx`: `AgentCardShell` → `useUiPrimitive("ui:agent-card")`; `formatTokens`/`formatDuration` → `useUiPrimitive("ui:format-tokens")` / `useUiPrimitive("ui:format-duration")`.
  - `FlowAgentDetail.tsx`, `FlowArchitect.tsx`: `MarkdownContent` → `useUiPrimitive("ui:markdown-content")`.
  - `FlowDashboard.tsx`: `BreadcrumbSlot` stays as direct import (it's a slot consumer, not a primitive).
  - `FlowGraph.tsx`: `ZoomControls` → `useUiPrimitive("ui:zoom-controls")`. `useZoomPan` STAYS as a direct import (Rules of Hooks — see Decisions).
  - `FlowLaunchDialog.tsx`: `DialogPortal` → `useUiPrimitive("ui:dialog-portal")`. `GateSlot` and `aggregateGateState` stay as direct imports (slot consumer + pure helper).
  - `SessionFlowActions.tsx`: `ConfirmDialog` → `useUiPrimitive("ui:confirm-dialog")`. `SearchableSelectDialog` → `useUiPrimitive("ui:searchable-select-dialog")`.

- **MODIFIED**: `packages/flows-plugin/package.json` — DROPS the `@blackbelt-technology/pi-dashboard-client-utils` dependency. flows-plugin now depends only on `@blackbelt-technology/dashboard-plugin-runtime` and `@blackbelt-technology/pi-dashboard-shared` for its primitive needs.

- Hooks (`useMobile`, `useZoomPan`) and pure extension-ui slot consumers (`AgentMetricSlot`, `BreadcrumbSlot`, `GateSlot`) STAY as direct imports from `client-utils`. Hooks can't go through a registry because of Rules of Hooks; the slot consumers are themselves slot mechanisms (different layer). flows-plugin keeps a transitive `client-utils` dependency for these. See Decisions for the rationale.

### Tests + lints

- **NEW**: `packages/shared/src/__tests__/no-primitive-direct-import.test.ts` — repo-lint that fails CI when a `packages/*-plugin/src/` file imports a primitive directly from `@blackbelt-technology/pi-dashboard-client-utils/{AgentCardShell,MarkdownContent,ConfirmDialog,DialogPortal,SearchableSelectDialog,ZoomControls,agent-card-utils}` instead of through the registry. Hooks (`useMobile`, `useZoomPan`) and slot consumers (`extension-ui/*`) are explicitly allowed.

- **NEW**: registry's own test file (above) covers the runtime contract.

- **MODIFIED**: existing flows-plugin tests update their render harness to wrap rendered components in a `<UiPrimitiveProvider>` with mock registrations. New test helper `withUiPrimitiveProvider(impls)` in `dashboard-plugin-runtime/test-support/` to streamline.

### Documentation

- **NEW**: `docs/plugin-ui-primitives.md` — guide for plugin authors covering the eight primitives, when to use the registry vs slot consumers vs direct imports (hooks), and how to add a new primitive.
- **MODIFIED**: AGENTS.md "Key Files" gets one row for the new ui-primitives module.

## Capabilities

### New Capabilities

- `plugin-ui-primitive-registry`: defines the primitive registry contract — what keys exist, who registers them, who consumes them, the lookup hook semantics, the strict-vs-soft variants, and the lint rule preventing direct imports of registered primitives from plugin source.

### Modified Capabilities

- `dashboard-plugin-loader`: SHALL be wrapped in a `<UiPrimitiveProvider>` so that descendant slot contributions can call `useUiPrimitive()`. (No change to the plugin loader's own semantics — additive context layer.)

### Specs not modified

- `dashboard-shell-slots`: unchanged. The slot system continues to work identically; the registry is an orthogonal mechanism (shell → plugin) that complements slots (plugin → shell).
- The four `extract-*-as-plugin` proposals will reference this capability as a precondition. They don't change in this proposal — they'll be amended in their own follow-ups to use the registry.

## Impact

### Code

- `packages/shared/src/dashboard-plugin/ui-primitives.ts` — NEW (~80 LOC: 8 keys + 8 contract types).
- `packages/dashboard-plugin-runtime/src/ui-primitive-registry.ts` — NEW (~50 LOC).
- `packages/dashboard-plugin-runtime/src/ui-primitive-context.tsx` — NEW (~80 LOC).
- `packages/dashboard-plugin-runtime/src/__tests__/ui-primitive-registry.test.tsx` — NEW.
- `packages/dashboard-plugin-runtime/test-support/withUiPrimitiveProvider.tsx` — NEW (test helper).
- `packages/client/src/main.tsx` — wraps `<App>` in `<UiPrimitiveProvider>`, registers 8 primitives.
- `packages/flows-plugin/src/client/*.tsx` — 11 imports rewritten across 7 files.
- `packages/flows-plugin/package.json` — removes `pi-dashboard-client-utils` dep.
- `packages/shared/src/__tests__/no-primitive-direct-import.test.ts` — NEW lint.
- `docs/plugin-ui-primitives.md` — NEW.
- `AGENTS.md` — one new row.

### Behavior

- No protocol changes. No new gateway messages. No REST endpoint changes.
- Plugin-author DX: ONE additional indirection (registry lookup vs direct import). Pays off the moment a second consumer of the same primitive arrives.
- Plugin tarball size: flows-plugin shrinks by ~1.5 MB at install (no transitive markdown stack). Other plugins (jj, demo, flows-anthropic-bridge) unaffected.
- Build performance: identical. Vite tree-shakes unused primitives the same way.

### Migration risk

- **Plugin tests** that render flow components must wrap in `<UiPrimitiveProvider>`. Test failures will be loud (the strict hook throws), not silent. Mitigation: ship the `withUiPrimitiveProvider(impls)` helper in the same change.
- **Strict-mode failures during transition**: if main.tsx forgets to register a primitive that a plugin expects, the plugin throws on first render. This is a feature, not a bug — silent null would hide the bug. Strict mode is the right default; tests catch it instantly.
- **Future primitive additions**: adding a new key (say `"ui:tasks-popover-shell"` for openspec-plugin) requires updating ui-primitives.ts AND main.tsx in the same change. Cross-file coordination is small but real.
- **Hook exception is documented**: Rules of Hooks prevents conditional/dynamic hook calls. The lint test allows hook imports from client-utils explicitly. Plugin authors must understand this exception. Docs cover it.

### Out of scope

- The four follow-up extractions (extract-openspec-as-plugin, extract-git-as-plugin, extract-subagents-as-plugin, plus the eventual cross-repo move of flows-plugin to pi-flows). Each will be a separate change that USES this registry.
- A descriptor-based "shell renders descriptors" mechanism (different architectural direction; orthogonal). The existing extension-ui descriptor system stays unchanged.
- Per-plugin contract versioning (e.g. `"ui:markdown-content@2"`). The current scheme uses unversioned keys; bumping a primitive's prop signature is a breaking change to the contract type, caught at build time. Versioned keys can be added later if/when needed.
- Module Federation or runtime plugin install. The registry remains a build-time + startup-time mechanism, like the slot registry it complements.
