## Why

`flows-plugin` was physically extracted into `packages/flows-plugin/` in April but its migration is **half-finished and currently broken in three independent ways**:

1. **CI/release fragility.** `packages/flows-plugin/src/client/*.tsx` contains 13 deep relative imports of the form `from "../../../client/src/components/AgentCardShell.js"`. These resolve via workspace symlink in the monorepo but resolve to nothing once the published tarball lands in `node_modules/`. The previous quickfix (`fdb8593`, pin specifiers to `"*"` so the symlink wins) was reverted to `^0.5.0` for v0.5.0 — meaning the next release that runs `npm ci` after publishing will fail the client build with `Could not resolve "../../../client/src/components/AgentCardShell.js"`.

2. **Plugin claims are unwirable.** ✅ Resolved by Layer 1 (commit `80c99ce`). The vite plugin now emits manifest predicates as named imports plus build-time validation; `sync-versions.js` preserves non-semver overrides. jj-plugin's predicates work as designed; flows-plugin's claims can now be restored without the badge rendering for every session.

3. **Slot wiring is structurally blocked for "rich" components.** `FlowActivityBadge` and `SessionFlowActions` can be adapted to accept `{ session }` and self-derive — `FlowActivityBadge` self-gates, `SessionFlowActions` reads from a new React context. But `FlowDashboard`, `FlowArchitect`, `FlowAgentDetail`, `FlowArchitectDetail`, and `FlowSummary` need `flowState`/`architectState` objects that exist only in App.tsx local state and **are not on `DashboardSession`**. The frozen v0.x slot consumer passes only `{ session }`. Migrating these "content slot" components requires either (a) adding `flowState`/`architectState` to `DashboardSession`, (b) extending the frozen slot prop contracts, or (c) keeping them as direct JSX. This change picks **(a)**: bridge populates these on the session object so components can self-derive uniformly with the session-card claims.

A side-effect of the half-finished migration is that `App.tsx` renders `<FlowArchitect>` at three call sites and `<FlowDashboard>` at two (overlapping conditional branches). Any slot migration must deduplicate these first or the duplication is carried into the plugin layer.

This change ships the remaining work as four sequential layers — Layer 1 already landed in commit `80c99ce`. The cross-repo move (moving source to `pi-flows`) is **out of scope**: it requires standing up React tooling in pi-flows and is independently large.

## Layer Numbering

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │                                                                        │
   │   Layer 0 — Foundation: kill deep imports                              │
   │     Extract shared client utilities into TWO published workspace      │
   │     packages so flows-plugin and jj-plugin import via npm names      │
   │     instead of cross-package relative paths. Defuses the CI hazard   │
   │     permanently. Touches ~22 source files, ~60 import sites, three   │
   │     build-pipeline lists, and a documentation index.                 │
   │                                                                        │
   │   Layer 1 — Plugin runtime bug fixes  ✅ SHIPPED (commit 80c99ce)    │
   │     • vite plugin emits predicates as named imports                  │
   │     • build-time validation of manifest references                   │
   │     • sync-versions.js preserves non-semver overrides                │
   │                                                                        │
   │   Layer 2 — Finish the flows-plugin                                    │
   │     Adapt 7 components to {session} entry signatures. Create two    │
   │     React contexts for callbacks. Populate manifest claims with      │
   │     predicates. Bridge augments DashboardSession with flow state.   │
   │                                                                        │
   │   Layer 3 — Dashboard shell surgery                                    │
   │     Deduplicate the 3× FlowArchitect / 2× FlowDashboard rendering    │
   │     in App.tsx. Wrap providers. Remove direct flow JSX from         │
   │     App.tsx, SessionCard, SessionHeader. Without this, Layer 2's    │
   │     plugin claims do nothing — App.tsx still hard-wires the         │
   │     components.                                                        │
   │                                                                        │
   │   Layer 4 — Verification + docs                                        │
   │                                                                        │
   └──────────────────────────────────────────────────────────────────────┘
```

The renumbering reflects that Layer 0 is the foundation everything else depends on. Layer 1 is bug-fixes that are independent but shipped together because the same release should ship both.

## What Changes

### Layer 0a — `client-utils` workspace package

- **NEW**: `packages/client-utils/` published as `@blackbelt-technology/pi-dashboard-client-utils`. Houses small, low-dependency UI primitives used by both the dashboard shell and external plugins.
- File list (12 sources + 4 colocated tests + 2 supporting modules):
  - `AgentCardShell.tsx`, `agent-card-utils.ts`
  - `DialogPortal.tsx`, `ConfirmDialog.tsx`, `SearchableSelectDialog.tsx`
  - `ZoomControls.tsx`
  - `useZoomPan.ts`, `useMobile.tsx`, `useMediaQuery.ts`
  - `extension-ui/AgentMetricSlot.tsx`, `extension-ui/BreadcrumbSlot.tsx`, `extension-ui/GateSlot.tsx`, `extension-ui/decorator-utils.ts`
  - co-located tests: `DialogPortal.test.tsx`, `useMobile.test.tsx`, `useZoomPan.test.ts`
- `useMediaQuery.ts` and `decorator-utils.ts` are explicitly listed because they are **required dependencies** of moved files (the original 12-file list was incomplete).
- Per-subpath exports map. Per-symbol imports — no barrel.
- Runtime deps: `@mdi/js`, `@mdi/react`, `@blackbelt-technology/pi-dashboard-shared`. Peer deps: `react`, `react-dom`. **No markdown stack** — that lives in the second package.
- Published with `publishConfig.access: "public"`, lockstep version with other runtime workspaces.

### Layer 0b — `markdown-content` workspace package

- **NEW**: `packages/markdown-content/` published as `@blackbelt-technology/pi-dashboard-markdown-content`. Separate package because the markdown rendering stack (`react-markdown`, `remark-*`, `rehype-*`, `katex`, `react-syntax-highlighter`, mermaid) totals ~1.1 MB at install time and is consumed by only a subset of plugins. Plugins that don't render markdown (e.g. `jj-plugin`) stay clean.
- File list:
  - `MarkdownContent.tsx` (the heavy renderer, 410 LOC)
  - `ThemeProvider.tsx` + `useTheme.ts` (consumed by MarkdownContent via `useThemeContext()`)
  - `SessionAssetsContext.tsx` (consumed by MarkdownContent for `pi-asset:<hash>` resolution)
  - `CopyButton.tsx`, `MermaidBlock.tsx`, `ImageLightbox.tsx` (rendered inside MarkdownContent)
  - `syntax-theme.ts` (theme-driven highlighter selection)
  - co-located test: `MarkdownContent.test.tsx`
- Depends on `client-utils` for `DialogPortal`, `useZoomPan`, `ZoomControls` (used by `ImageLightbox` and `MermaidBlock`).
- Runtime deps: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-raw`, `rehype-katex`, `katex`, `react-syntax-highlighter`, `mermaid` (dynamic import). Peer deps: `react`, `react-dom`. Workspace deps: `@blackbelt-technology/pi-dashboard-shared`, `@blackbelt-technology/pi-dashboard-client-utils`.

### Layer 0c — Re-export shims at original locations

For every moved file, `packages/client/src/<original-path>` becomes a thin re-export shim pointing at the new package path. Internal dashboard imports keep compiling without churn (~55 dashboard-side imports stay working untouched). The 12 shim files contain only an `export *` statement and a one-line comment.

### Layer 0d — Plugin import rewrites

`packages/flows-plugin/src/client/*` and `packages/jj-plugin/src/client/*` rewrite their cross-package relative imports to use the new package names:
- `from "../../../client/src/components/AgentCardShell.js"` → `from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell"`
- `from "../../../client/src/components/MarkdownContent.js"` → `from "@blackbelt-technology/pi-dashboard-markdown-content/MarkdownContent"`
- (etc., 14 imports across 6 flows-plugin files; 1 import in jj-plugin's `SessionFlowActions.tsx` analogue)

Both plugins add the new packages as runtime `dependencies`.

### Layer 0e — Lint + sync-versions + publish ordering

- New repo-lint `packages/shared/src/__tests__/no-cross-package-deep-imports.test.ts` fails CI when any `packages/*/src/` file imports from another package via a path that escapes the package boundary.
- `scripts/sync-versions.js` already hardened in Layer 1 to preserve non-semver pins.
- `.github/workflows/publish.yml` PACKAGES array adds `client-utils` and `markdown-content` BEFORE `flows-plugin` and `jj-plugin`. `publish-workflow-contract.test.ts` pins the new ordering.
- `packages/electron/scripts/bundle-server.mjs` — four hardcoded lists of `["server", "shared", "extension"]` need extending IF client-utils or markdown-content is needed at electron-server runtime. Spec says: include both packages so the bundle is self-contained even if a future change makes the server import them.
- `packages/client/vite.config.ts` adds path aliases for both packages so Vite resolves to source `.ts`/`.tsx` files in dev (matching the existing alias pattern for `pi-dashboard-shared`).

### Layer 0f — Test mock-path migration

About 10 client-side test files use `vi.mock("../../hooks/useMobile.js", ...)` style relative paths. These mocks would silently no-op after the move (vi.mock matches the literal specifier). The shim chain saves them — mocking the shim is equivalent to mocking the real module — but the dynamic `vi.doMock` cases must be verified explicitly. Mock-path migration is part of Layer 0d/e cleanup.

### Layer 2 — Plugin internals (unchanged from original proposal)

- **MODIFIED**: `packages/shared/src/types.ts` `DashboardSession` adds three optional fields populated by the bridge: `flowState?: FlowState | null`, `flowStates?: ReadonlyMap<string, FlowState>`, `architectState?: ArchitectState | null`. (These types already exist in `packages/shared/src/types.ts:547+` and `:620+`, simplifying this step.)
- The bridge (`packages/extension/src/flow-event-wiring.ts` + `session-sync.ts`) maintains the per-session FlowState/ArchitectState map and folds it into outgoing session payloads. Server's `MemorySessionManager` carries the augmented fields through `sessions_snapshot`. No new gateway message types.
- **MODIFIED**: `packages/flows-plugin/package.json#pi-dashboard-plugin.claims` populated with the full set:
  - `session-card-badge` → `FlowActivityBadge` w/ predicate `hasActiveFlow`
  - `session-card-action-bar` → `SessionFlowActions`
  - `content-header-sticky` → `FlowDashboard` w/ predicate `hasActiveFlow`
  - `content-header-sticky` → `FlowArchitect` w/ predicate `hasActiveArchitect`
  - `content-view` → `FlowAgentDetail` (route `flow-agent-detail`)
  - `content-view` → `FlowArchitectDetail` (route `flow-architect-detail`)
  - `content-inline-footer` → `FlowSummary` w/ predicate `hasActiveFlow`
- **NEW** contexts: `packages/flows-plugin/src/client/FlowsActionsContext.tsx` (action-bar callbacks + commands list) and `FlowActionsContext.tsx` (flow-control callbacks). Two contexts because they have different lifecycles (action-bar is per-session-card, flow-control is per-active-session).
- **NEW exported predicates** in `packages/flows-plugin/src/client/index.tsx`: `hasActiveFlow(session)`, `hasActiveArchitect(session)`. Required because the predicate names referenced in the manifest must be exported from the client entry (Layer 1's vite-plugin validation).
- All seven flow components refactor to accept `{ session }` (or `{ session, routeParams, onClose }` for content-view claims) and pull state + callbacks from session + context. Component internals unchanged below the entry signature.

### Layer 3 — Shell surgery

- **REMOVED**: direct imports + JSX for `FlowDashboard`, `FlowArchitect`, `FlowAgentDetail`, `FlowArchitectDetail`, `FlowSummary`, `FlowActivityBadge`, `SessionFlowActions` from `App.tsx` and `SessionCard.tsx`.
- **REMOVED**: the triple-rendering of `FlowArchitect` (App.tsx:1020, 1040, 1081) and double-rendering of `FlowDashboard` (App.tsx:1053, 1094) — replaced by single slot consumer calls.
- **NEW** `<FlowsActionsProvider>` wraps the main app content; **NEW** `<FlowActionsProvider>` wraps the per-session content area. Both fed from existing App.tsx state — no new top-level state.
- **NEW** regression test `packages/client/src/__tests__/session-card-no-double-flow.test.tsx` — fails if both the slot consumer and a direct flow JSX import render in the same SessionCard.
- **MODIFIED** `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts::SCAN_FILES` adds `MobileShell.tsx`.

### Out of scope

- Cross-repo move to `pi-flows` (Layer 5 in the spec-coherence map). pi-flows has no React tooling; standing that up is independently large.
- Pluggable reducer registry. The shell's `event-reducer.ts` keeps importing `reduceFlowEvent` / `reduceArchitectEvent` from `flows-plugin` (workspace import).
- Slot prop contract changes. The frozen v0.x contracts (`{ session }` for session-scoped, `{ session, routeParams, onClose }` for content-view) are preserved exactly.
- Hard-cut elimination of the 12 re-export shims. They become re-export shims; a future change MAY rewrite client-side imports to use the package name directly and delete the shims.
- The committed-with-absolute-paths `plugin-registry.tsx` issue. It already exists; this change does not make it worse and does not fix it. A separate proposal can address it.

## Capabilities

### New Capabilities

- `client-utils-package`: defines the published `@blackbelt-technology/pi-dashboard-client-utils` package, what lives in it (small UI primitives, hooks, extension-ui slot consumers), the per-subpath export map, the no-cross-package-deep-import lint, and the rule that any future plugin needing client utilities depends on this package (not deep relative imports).
- `markdown-content-package`: defines the published `@blackbelt-technology/pi-dashboard-markdown-content` package, what lives in it (`MarkdownContent` + its theme/asset/copy/mermaid/lightbox dependencies + the markdown rendering stack), why it is separate from `client-utils` (heavy install footprint, narrow consumer set), and the relationship to `client-utils` (depends on it for primitives like `DialogPortal`).

### Modified Capabilities

- `dashboard-shell-slots`: `DashboardSession` SHALL carry optional `flowState`, `flowStates`, `architectState` fields, populated by the bridge and consumed by flow-related claims (which SHALL self-gate via predicates). Slot prop contracts (`{ session }` for session-scoped slots, `{ session, routeParams, onClose }` for content-view) are NOT changed; the augmentation rides through the `session` object.
- `monorepo-workspace-structure`: SHALL include the new `packages/client-utils/` and `packages/markdown-content/` workspaces, SHALL forbid deep relative imports across plugin/client boundary (enforced by lint), and SHALL document `packages/flows-plugin`'s status as a fully-wired dashboard plugin.
- `workspace-publishing`: publish ordering SHALL place `client-utils` before `markdown-content`, and both before any plugin that depends on them. Cross-package specifiers SHALL use real semver ranges. The contract test SHALL pin the ordering.

### Specs not modified by this change

- `dashboard-plugin-loader` already updated by Layer 1 (commit `80c99ce`). No further changes.
- `flow-*` specs (flow-agent-detail, flow-architect-view, flow-card-grid, flow-controls, etc.) — behavioral specs unchanged; components do the same things they did before, just with new entry signatures and new context providers.

## Impact

### Code

- `packages/client-utils/` — new, ~14 source files + 3 tests + package.json + tsconfig.
- `packages/markdown-content/` — new, ~8 source files + 1 test + package.json + tsconfig.
- `packages/client/src/{components,hooks,components/extension-ui}/` — 12 files become re-export shims (1-line files).
- `packages/client/src/App.tsx` — ~250 LOC removed (flow JSX + duplicated branches), ~30 LOC added (provider wrapping). Layer 3.
- `packages/client/src/components/SessionCard.tsx` — flow imports + JSX removed. Layer 3.
- `packages/client/src/components/SessionHeader.tsx` — flow imports + JSX removed. Layer 3.
- `packages/client/src/lib/event-reducer.ts` — unchanged. Reducer dispatch via plugin reducer registry is out of scope.
- `packages/flows-plugin/src/client/*.tsx` — 7 components refactor entry signatures; internals unchanged. 14 import paths rewritten.
- `packages/flows-plugin/src/client/{Flows,Flow}ActionsContext.tsx` — new.
- `packages/flows-plugin/src/client/index.tsx` — adds `hasActiveFlow`, `hasActiveArchitect` exports. Re-exports actions providers.
- `packages/flows-plugin/package.json` — manifest claims populated; deps on `client-utils` + `markdown-content`.
- `packages/jj-plugin/package.json` — dep on `client-utils` (no markdown-content needed). Source files: import-path rewrites if any cross into client/.
- `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` — already updated by Layer 1.
- `packages/extension/src/flow-event-wiring.ts` (or `session-sync.ts`) — folds `FlowState`/`ArchitectState` into outgoing session payloads. Layer 2.
- `packages/shared/src/types.ts` — three optional fields added to `DashboardSession`. Layer 2.
- `packages/shared/src/__tests__/no-cross-package-deep-imports.test.ts` — new lint.
- `packages/client/src/__tests__/session-card-no-double-flow.test.tsx` — new regression. Layer 3.
- `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts` — `SCAN_FILES` extended. Layer 3.
- `packages/client/vite.config.ts` — path aliases for both new packages.
- `.github/workflows/publish.yml` — PACKAGES array extended.
- `packages/electron/scripts/bundle-server.mjs` — four package lists extended.
- `packages/shared/src/__tests__/publish-workflow-contract.test.ts` — pins the new ordering.
- Test mock paths in ~10 client-side test files — verified to keep working through shims; `vi.doMock` cases inspected and updated where necessary.
- `docs/file-index-client.md` and other docs file-index splits — paths updated for the moved files.

### Protocol / API

- No breaking protocol changes. `DashboardSession.flowState`/`flowStates`/`architectState` are optional — older browsers ignore them.
- No new REST endpoints. No new WS message types.

### Dependencies

- Two new published packages: `@blackbelt-technology/pi-dashboard-client-utils`, `@blackbelt-technology/pi-dashboard-markdown-content`.
- `flows-plugin` gains both as deps. `jj-plugin` gains only `client-utils`.
- Markdown stack moves into `markdown-content` (not `client-utils`) so plugins not rendering markdown stay light at install time.
- The `fdb8593` `"*"` quickfix era ends after Layer 0d. Specifiers go back to `^<version>` for good.

### Risk surface

- **Triple rendering deduplication** (Layer 3): the three FlowArchitect call sites have subtle differences in `onDismiss` reset behavior. Parity test required.
- **Bridge augmentation persists across reconnects**: a flow active on session X must still appear when the browser reconnects mid-flow. Verified via `sessions_snapshot` integration test.
- **CI publish ordering**: the contract test pins the new ordering. A misconfigured workflow step republishes a dependent before its dependencies, breaking the registry.
- **Markdown stack tree-shaking**: per-subpath exports are designed to make `import { useMobile } from "@blackbelt-technology/pi-dashboard-client-utils/useMobile"` not pull markdown deps. The split into two packages eliminates the question entirely — plugins that don't import from `markdown-content` never see those deps.
- **Mock-path silent regressions**: 10+ test files use `vi.mock` paths. Re-export shims keep them working but require verification.
- **plugin-registry.tsx absolute paths** (pre-existing): not a Layer 0 regression but co-exists with this change. Documented as out of scope; can be addressed separately.
- **Bundle-server.mjs hidden dependency**: four hardcoded package lists need updating. If missed, the Electron app silently doesn't bundle the new packages and fails at runtime.
- **flows-anthropic-bridge-plugin coexistence**: that plugin uses `ctx.events.on(...)` for custom events forwarded via the bridge. Layer 2 changes don't touch that mechanism. Cross-referenced as a known parallel concern, not a blocker.
