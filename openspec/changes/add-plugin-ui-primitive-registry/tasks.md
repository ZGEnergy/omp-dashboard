## 1. Define the primitive contracts in shared

- [ ] 1.1 Create `packages/shared/src/dashboard-plugin/ui-primitives.ts`. Define `UI_PRIMITIVE_KEYS` const (object literal) with `as const` assertion, eight keys per the spec.
- [ ] 1.2 Define `UiPrimitiveKey` type as `typeof UI_PRIMITIVE_KEYS[keyof typeof UI_PRIMITIVE_KEYS]`.
- [ ] 1.3 Define `UiPrimitiveMap` interface mapping each key to its contract type. Component contracts use `React.ComponentType<P>`; helper contracts use function signatures.
- [ ] 1.4 Re-export `SelectOption` type if needed for the searchable-select-dialog contract — pull from existing `client-utils/SearchableSelectDialog.tsx` types.
- [ ] 1.5 Add to `packages/shared/src/dashboard-plugin/index.ts` (or shared/src/index.ts) so `import from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives"` resolves cleanly.
- [ ] 1.6 Verify `npm run build -w @blackbelt-technology/pi-dashboard-shared` is clean.

## 2. Build the registry runtime

- [ ] 2.1 Create `packages/dashboard-plugin-runtime/src/ui-primitive-registry.ts`. Define the `UiPrimitiveRegistry` interface (a Map<key, impl> wrapper). Export `createUiPrimitiveRegistry()`.
- [ ] 2.2 Export `registerUiPrimitive<K extends UiPrimitiveKey>(reg, key, impl)`. Throw `Error('UI primitive "${key}" is already registered. Each primitive can only have one registration.')` on duplicate.
- [ ] 2.3 Create `packages/dashboard-plugin-runtime/src/ui-primitive-context.tsx`. Define a React context with type `UiPrimitiveRegistry | null`. Export `<UiPrimitiveProvider value={registry}>` component.
- [ ] 2.4 Export strict hook `useUiPrimitive<K>(key: K): UiPrimitiveMap[K]`. Throw clear errors for: (a) called outside provider; (b) key not registered. Error messages name the missing piece concretely.
- [ ] 2.5 Export soft hook `useUiPrimitiveOrNull<K>(key: K): UiPrimitiveMap[K] | null`. Returns null for missing key; still throws if called outside provider.
- [ ] 2.6 Re-export from `packages/dashboard-plugin-runtime/src/index.ts` so consumers import via `@blackbelt-technology/dashboard-plugin-runtime`.

## 3. Tests for the registry

- [ ] 3.1 Create `packages/dashboard-plugin-runtime/src/__tests__/ui-primitive-registry.test.tsx`. Cover:
  - 3.1.1 Empty registry — `useUiPrimitiveOrNull` returns null for every key.
  - 3.1.2 Successful registration — `useUiPrimitive` returns the registered impl.
  - 3.1.3 Type lookup — TypeScript infers correct type from key (compile-time check via `// @ts-expect-error` for misuse).
  - 3.1.4 Double-registration throws with clear error.
  - 3.1.5 First-write-wins after the throw — original registration is retained.
  - 3.1.6 Strict hook outside provider throws "must be called inside <UiPrimitiveProvider>".
  - 3.1.7 Soft hook outside provider throws (same as strict — no provider means no context).
  - 3.1.8 Strict hook for missing key throws "is not registered" with key name.
  - 3.1.9 Soft hook for missing key returns null.
  - 3.1.10 Multiple consumers in the same tree all see the same registry.
- [ ] 3.2 Run `HOME=$(mktemp -d) NODE_OPTIONS="--localstorage-file=$(mktemp)" npx vitest run --project @blackbelt-technology/dashboard-plugin-runtime`. All passing.

## 4. Test helper for plugin tests

- [ ] 4.1 Create `packages/dashboard-plugin-runtime/test-support/withUiPrimitiveProvider.tsx`. Export `withUiPrimitiveProvider(partialImpls: Partial<UiPrimitiveMap>, children: React.ReactNode)`.
- [ ] 4.2 The helper SHALL build a fresh registry, register everything in `partialImpls`, and wrap `children` in `<UiPrimitiveProvider>`.
- [ ] 4.3 Re-export from `packages/dashboard-plugin-runtime/test-support/index.ts`.
- [ ] 4.4 Smoke-test the helper inside the registry test file (one case using it).

## 5. Wire dashboard registrations at startup

- [ ] 5.1 Read `packages/client/src/main.tsx` (or wherever `<App>` is mounted). Add imports for: `createUiPrimitiveRegistry`, `registerUiPrimitive`, `<UiPrimitiveProvider>` from dashboard-plugin-runtime; `UI_PRIMITIVE_KEYS` from shared.
- [ ] 5.2 Add imports from existing locations: `AgentCardShell`, `ConfirmDialog`, `DialogPortal`, `SearchableSelectDialog`, `ZoomControls`, `formatTokens`, `formatDuration` from client-utils. `MarkdownContent` from `client/src/components/MarkdownContent.js` (still in client/, not in client-utils).
- [ ] 5.3 Inside main.tsx (synchronous setup before render):
  ```typescript
  const primitiveRegistry = createUiPrimitiveRegistry();
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.agentCard, AgentCardShell);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.markdownContent, MarkdownContent);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.confirmDialog, ConfirmDialog);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.dialogPortal, DialogPortal);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.searchableSelectDialog, SearchableSelectDialog);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.zoomControls, ZoomControls);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.formatTokens, formatTokens);
  registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.formatDuration, formatDuration);
  ```
- [ ] 5.4 Wrap `<App>` in `<UiPrimitiveProvider value={primitiveRegistry}>`. Place outside the existing `<PluginContextProvider>` if there is one.
- [ ] 5.5 Build clean: `npm run build`. No TS errors for missing registrations (TypeScript should now require all keys be registered if main.tsx references them via the typed registration helper).

## 6. Migrate flows-plugin to use the registry

- [ ] 6.1 `FlowAgentCard.tsx`: replace `import { AgentCardShell } from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell"` with `useUiPrimitive(UI_PRIMITIVE_KEYS.agentCard)`. Same for `formatTokens`, `formatDuration` (but note: those are functions, not components — use them directly after lookup, no JSX).
- [ ] 6.2 `FlowAgentCard.tsx`: `AgentMetricSlot` STAYS as a direct import (slot consumer, not registered primitive).
- [ ] 6.3 `FlowAgentDetail.tsx`: `MarkdownContent` direct import → `useUiPrimitive(UI_PRIMITIVE_KEYS.markdownContent)`.
- [ ] 6.4 `FlowArchitect.tsx`: `MarkdownContent` direct import → `useUiPrimitive(UI_PRIMITIVE_KEYS.markdownContent)`. `AgentCardShell` → registry.
- [ ] 6.5 `FlowDashboard.tsx`: `useMobile` STAYS as direct import (hook). `BreadcrumbSlot` STAYS as direct import (slot consumer).
- [ ] 6.6 `FlowGraph.tsx`: `ZoomControls` → registry. `useZoomPan` STAYS as direct import (hook).
- [ ] 6.7 `FlowLaunchDialog.tsx`: `DialogPortal` → registry. `GateSlot` and `aggregateGateState` STAY as direct imports (slot consumer + pure helper).
- [ ] 6.8 `SessionFlowActions.tsx`: `ConfirmDialog` → registry. `SearchableSelectDialog` → registry.
- [ ] 6.9 Verify each rewritten import: TypeScript types for the looked-up impl must match what the component expects. `tsc --noEmit` clean.
- [ ] 6.10 Drop `@blackbelt-technology/pi-dashboard-client-utils` from `packages/flows-plugin/package.json#dependencies` IF flows-plugin still uses no symbols from it. (Note: flows-plugin still imports `useMobile`, `useZoomPan`, the three `extension-ui/*` slot consumers, and `aggregateGateState` from client-utils — so the dep stays.) Document in package.json comment which symbols justify the retained dep.
- [ ] 6.11 Run `npm run build -w @blackbelt-technology/pi-dashboard-flows-plugin`. Clean.

## 7. Update flows-plugin tests

- [ ] 7.1 Audit `packages/flows-plugin/src/__tests__/`. Find every test file that renders a flow component.
- [ ] 7.2 For each test, wrap the rendered tree in `withUiPrimitiveProvider({...mockImpls})` providing whichever primitives the rendered component looks up. Use real impls from client-utils + MarkdownContent where the test wants visual fidelity, or stub mocks where the test only verifies behavior.
- [ ] 7.3 Run `HOME=$(mktemp -d) NODE_OPTIONS="--localstorage-file=$(mktemp)" npx vitest run --project @blackbelt-technology/pi-dashboard-flows-plugin`. All tests pass.

## 8. Lint: forbid direct primitive imports in plugin source

- [ ] 8.1 Create `packages/shared/src/__tests__/no-primitive-direct-import.test.ts`. Scan every `*.ts`/`*.tsx` under `packages/*-plugin/src/` (NOT `packages/client-utils/`, NOT `packages/dashboard-plugin-runtime/`).
- [ ] 8.2 Forbidden: import specifiers matching `@blackbelt-technology/pi-dashboard-client-utils/{AgentCardShell,MarkdownContent,ConfirmDialog,DialogPortal,SearchableSelectDialog,ZoomControls,agent-card-utils}`.
- [ ] 8.3 Allowed: imports from `@blackbelt-technology/pi-dashboard-client-utils/{useMobile,useZoomPan,useMediaQuery}` and `@blackbelt-technology/pi-dashboard-client-utils/extension-ui/*`.
- [ ] 8.4 Test: with the migration applied, the lint passes against current flows-plugin.
- [ ] 8.5 Test: planted bad import in a fixture file fails the lint with a clear message naming the recommended `useUiPrimitive(KEY)` call.
- [ ] 8.6 Run `npm run build -w @blackbelt-technology/pi-dashboard-shared` and `npx vitest run --project @blackbelt-technology/pi-dashboard-shared no-primitive-direct-import`. Both pass.

## 9. Documentation

- [ ] 9.1 Create `docs/plugin-ui-primitives.md`. Cover:
  - 9.1.1 What primitives are and when to use them.
  - 9.1.2 The eight initial keys and their contracts.
  - 9.1.3 How to consume — `useUiPrimitive(key)` example.
  - 9.1.4 Strict vs soft hook — when to use each.
  - 9.1.5 Hook exception — Rules of Hooks; useMobile/useZoomPan stay as direct imports.
  - 9.1.6 Test pattern — `withUiPrimitiveProvider({…})`.
  - 9.1.7 Adding a new primitive — step-by-step (UI_PRIMITIVE_KEYS + UiPrimitiveMap + main.tsx + lint allow-list if needed).
- [ ] 9.2 Add row to AGENTS.md "Key Files":
  ```
  | `packages/shared/src/dashboard-plugin/ui-primitives.ts` | UI primitive registry contracts (keys + typed map) |
  | `packages/dashboard-plugin-runtime/src/ui-primitive-{registry,context}.tsx` | Registry runtime + provider + hooks |
  ```
- [ ] 9.3 Update `docs/file-index-shared.md` and `docs/file-index-plugins.md` (or whichever splits apply) with the new files.
- [ ] 9.4 Update `CHANGELOG.md ## [Unreleased] ### Added` with a single entry summarizing the registry.

## 10. Final verification

- [ ] 10.1 `npm run build` — clean across all workspaces.
- [ ] 10.2 `npm test` — full suite green; aim for ≥ pre-change pass count.
- [ ] 10.3 Vite dev smoke — `npm run dev`; spawn a flow; verify FlowDashboard renders with full visual fidelity (markdown, agent cards, zoom controls, dialogs all behave identically to before).
- [ ] 10.4 Production build smoke — open `packages/client/dist/` after `npm run build`; verify no regression in bundle size.
- [ ] 10.5 `pnpm pack -F flows-plugin --dry-run` (or `npm pack`); inspect the tarball metadata; confirm `@blackbelt-technology/pi-dashboard-client-utils` is still listed (because of hooks) but no DIRECT primitive imports appear in source files.
- [ ] 10.6 (Optional) Manual: confirm that strict-mode error fires correctly — temporarily comment out one registration in main.tsx, run dev, verify the error appears clearly in the browser when the corresponding flow component renders. Restore.

## 11. Mark superseded change as obsolete

- [ ] 11.1 Verify the SUPERSEDED note at the top of `openspec/changes/complete-flows-plugin-migration/proposal.md` is in place.
- [ ] 11.2 Plan: archive `complete-flows-plugin-migration` as `2026-05-08-complete-flows-plugin-migration-superseded` after this change lands. (Leave for `/opsx:archive` when ready.)
