## 0. Layer 1 — Vite plugin predicate emission ✅ SHIPPED (commit `80c99ce`)

- [x] 0.1 Read `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts::generateRegistryContent` and confirm current emission shape (component-only).
- [x] 0.2 Collect `claim.predicate` names alongside `claim.component`; merge into per-plugin named-import list with deduplication.
- [x] 0.3 Append `, predicate: <name>` to inline ClaimEntry literal whenever `claim.predicate` is set.
- [x] 0.4 Build-time validation: read plugin's resolved client entry source via regex; verify every named ref exists in exports; fail loudly. Soft-skip when source unreadable.
- [x] 0.5 Created `vite-plugin-predicate-emission.test.ts` with 6 cases: predicate emitted; typo fails build; component-typo fails build; no-predicate omits field; soft-skip on unreadable; deduplication.
- [x] 0.6 Tests pass: 64/64 in plugin-runtime project.
- [x] 0.7 Verified jj-plugin's three predicates appear correctly in regenerated `plugin-registry.tsx`.

## 1. Layer 1 — sync-versions.js hardening ✅ SHIPPED (commit `80c99ce`)

- [x] 1.1 Read `scripts/sync-versions.js` and identify the rewrite loop.
- [x] 1.2 Extracted classifier `isRewritableSemverSpec` into `scripts/sync-versions-spec.js` (importable without side effects).
- [x] 1.3 Non-rewritable specifiers preserved with stderr warning.
- [x] 1.4 Updated header docblock with "Specifier preservation" section.
- [x] 1.5 Created `packages/shared/src/__tests__/sync-versions-spec.test.ts` with 30 cases.
- [x] 1.6 Smoke test: `"*"` pin survives a sync-versions run with warning.

## 2. Layer 0a — Create `client-utils` workspace package

- [ ] 2.1 `mkdir -p packages/client-utils/src/extension-ui packages/client-utils/src/__tests__`.
- [ ] 2.2 Create `packages/client-utils/package.json` with: name `@blackbelt-technology/pi-dashboard-client-utils`, version matching root, `"type": "module"`, `publishConfig.access: "public"`, `peerDependencies` for react/react-dom (`>=18.0.0`), `dependencies` for `@mdi/js`/`@mdi/react`/`@blackbelt-technology/pi-dashboard-shared`, `files: ["src/"]`.
- [ ] 2.3 Create `packages/client-utils/tsconfig.json` extending `tsconfig.base.json` with `compilerOptions.jsx: "react-jsx"`.
- [ ] 2.4 No root `package.json#workspaces` change needed — existing `"packages/*"` glob auto-discovers the new package.
- [ ] 2.5 Run `npm install` to wire the workspace symlink; verify `node_modules/@blackbelt-technology/pi-dashboard-client-utils` resolves to `packages/client-utils/`.

## 3. Layer 0a — Move client-utils source files (preserve git history)

- [ ] 3.1 `git mv packages/client/src/components/AgentCardShell.tsx packages/client-utils/src/AgentCardShell.tsx`
- [ ] 3.2 `git mv packages/client/src/components/agent-card-utils.ts packages/client-utils/src/agent-card-utils.ts`
- [ ] 3.3 `git mv packages/client/src/components/DialogPortal.tsx packages/client-utils/src/DialogPortal.tsx`
- [ ] 3.4 `git mv packages/client/src/components/ConfirmDialog.tsx packages/client-utils/src/ConfirmDialog.tsx`
- [ ] 3.5 `git mv packages/client/src/components/SearchableSelectDialog.tsx packages/client-utils/src/SearchableSelectDialog.tsx`
- [ ] 3.6 `git mv packages/client/src/components/ZoomControls.tsx packages/client-utils/src/ZoomControls.tsx`
- [ ] 3.7 `git mv packages/client/src/hooks/useZoomPan.ts packages/client-utils/src/useZoomPan.ts`
- [ ] 3.8 `git mv packages/client/src/hooks/useMobile.tsx packages/client-utils/src/useMobile.tsx`
- [ ] 3.9 `git mv packages/client/src/hooks/useMediaQuery.ts packages/client-utils/src/useMediaQuery.ts` (required dep of useMobile).
- [ ] 3.10 `git mv` AgentMetricSlot/BreadcrumbSlot/GateSlot from `packages/client/src/components/extension-ui/` to `packages/client-utils/src/extension-ui/`.
- [ ] 3.11 `git mv packages/client/src/components/extension-ui/decorator-utils.ts packages/client-utils/src/extension-ui/decorator-utils.ts` (required dep of all three slots).
- [ ] 3.12 Move co-located tests: `useZoomPan.test.ts`, `useMobile.test.tsx`, `DialogPortal.test.tsx` → `packages/client-utils/src/__tests__/`.
- [ ] 3.13 Update intra-package imports inside the moved files (any `from "../hooks/..."` etc. that points to a stale relative location must be rewritten to a same-package path within client-utils).
- [ ] 3.14 Verify `git log --follow packages/client-utils/src/AgentCardShell.tsx` shows pre-move history.

## 4. Layer 0a — Per-subpath exports map for client-utils

- [ ] 4.1 In `packages/client-utils/package.json#exports`, add an entry for each moved file: `./AgentCardShell`, `./agent-card-utils`, `./DialogPortal`, `./ConfirmDialog`, `./SearchableSelectDialog`, `./ZoomControls`, `./useZoomPan`, `./useMobile`, `./useMediaQuery`, `./extension-ui/AgentMetricSlot`, `./extension-ui/BreadcrumbSlot`, `./extension-ui/GateSlot`, `./extension-ui/decorator-utils`.
- [ ] 4.2 No barrel `.` export — each consumer imports per-symbol.
- [ ] 4.3 Smoke test: write a temporary scratch import for each subpath; verify each resolves under both Node and Vite.

## 5. Layer 0b — Create `markdown-content` workspace package

- [ ] 5.1 `mkdir -p packages/markdown-content/src packages/markdown-content/src/__tests__`.
- [ ] 5.2 Create `packages/markdown-content/package.json` with: name `@blackbelt-technology/pi-dashboard-markdown-content`, version matching root, `"type": "module"`, `publishConfig.access: "public"`, `peerDependencies` for react/react-dom, `dependencies` for the markdown stack (`react-markdown`, `remark-gfm`, `remark-math`, `rehype-raw`, `rehype-katex`, `katex`, `react-syntax-highlighter`, `mermaid`, `@mdi/js`, `@mdi/react`) + workspace deps on `pi-dashboard-shared` and `pi-dashboard-client-utils`, `files: ["src/"]`.
- [ ] 5.3 Create `packages/markdown-content/tsconfig.json`.
- [ ] 5.4 Run `npm install`; verify symlink wired.

## 6. Layer 0b — Move markdown-content source files

- [ ] 6.1 `git mv packages/client/src/components/MarkdownContent.tsx packages/markdown-content/src/MarkdownContent.tsx`
- [ ] 6.2 `git mv packages/client/src/components/ThemeProvider.tsx packages/markdown-content/src/ThemeProvider.tsx`
- [ ] 6.3 `git mv packages/client/src/components/CopyButton.tsx packages/markdown-content/src/CopyButton.tsx`
- [ ] 6.4 `git mv packages/client/src/components/MermaidBlock.tsx packages/markdown-content/src/MermaidBlock.tsx`
- [ ] 6.5 `git mv packages/client/src/components/ImageLightbox.tsx packages/markdown-content/src/ImageLightbox.tsx`
- [ ] 6.6 `git mv packages/client/src/lib/SessionAssetsContext.tsx packages/markdown-content/src/SessionAssetsContext.tsx`
- [ ] 6.7 `git mv packages/client/src/lib/syntax-theme.ts packages/markdown-content/src/syntax-theme.ts`
- [ ] 6.8 `git mv packages/client/src/hooks/useTheme.ts packages/markdown-content/src/useTheme.ts` (consumed by ThemeProvider).
- [ ] 6.9 Move co-located test: `MarkdownContent.test.tsx` → `packages/markdown-content/src/__tests__/`.
- [ ] 6.10 Update intra-package imports inside moved files. Where MermaidBlock or ImageLightbox import `DialogPortal`/`useZoomPan`/`ZoomControls`, rewrite to `@blackbelt-technology/pi-dashboard-client-utils/<symbol>`.
- [ ] 6.11 Verify `git log --follow packages/markdown-content/src/MarkdownContent.tsx` shows pre-move history.

## 7. Layer 0b — Per-subpath exports map for markdown-content

- [ ] 7.1 In `packages/markdown-content/package.json#exports`, add: `./MarkdownContent`, `./ThemeProvider`, `./SessionAssetsContext`, `./CopyButton`, `./MermaidBlock`, `./ImageLightbox`, `./syntax-theme`, `./useTheme`.
- [ ] 7.2 Smoke test: import each subpath in a scratch file, verify resolution.

## 8. Layer 0c — Re-export shims at original locations

- [ ] 8.1 Create `packages/client/src/components/AgentCardShell.tsx` as a single re-export line: `export * from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell";` plus a one-line comment indicating the move.
- [ ] 8.2 Repeat 8.1 for each of the other client-utils-moved files at their original locations: `agent-card-utils`, `DialogPortal`, `ConfirmDialog`, `SearchableSelectDialog`, `ZoomControls`, `useZoomPan`, `useMobile`, `useMediaQuery`, three extension-ui slots, `decorator-utils`.
- [ ] 8.3 Create shims for markdown-content-moved files: `MarkdownContent`, `ThemeProvider`, `SessionAssetsContext`, `CopyButton`, `MermaidBlock`, `ImageLightbox`, `syntax-theme`, `useTheme`.
- [ ] 8.4 Verify TypeScript compiles by running `npm run build -w @blackbelt-technology/pi-dashboard-web`.
- [ ] 8.5 Run client tests; existing imports must still resolve through shims.

## 9. Layer 0d — Update flows-plugin imports

- [ ] 9.1 Add `@blackbelt-technology/pi-dashboard-client-utils` and `@blackbelt-technology/pi-dashboard-markdown-content` as dependencies in `packages/flows-plugin/package.json` (caret-range matching root version).
- [ ] 9.2 Rewrite the deep relative imports in `packages/flows-plugin/src/client/` — for each file, change `from "../../../client/src/components/<Symbol>.js"` to `from "@blackbelt-technology/pi-dashboard-client-utils/<Symbol>"` or `@blackbelt-technology/pi-dashboard-markdown-content/<Symbol>` as appropriate.
- [ ] 9.3 Specifically: `FlowAgentCard.tsx` → AgentCardShell, agent-card-utils, AgentMetricSlot (all client-utils). `FlowAgentDetail.tsx` → MarkdownContent (markdown-content). `FlowArchitect.tsx` → AgentCardShell + MarkdownContent. `FlowDashboard.tsx` → useMobile, BreadcrumbSlot. `FlowGraph.tsx` → useZoomPan, ZoomControls. `FlowLaunchDialog.tsx` → DialogPortal, GateSlot, aggregateGateState. `SessionFlowActions.tsx` → ConfirmDialog, SearchableSelectDialog.
- [ ] 9.4 Run `npm test -w @blackbelt-technology/pi-dashboard-flows-plugin` to catch any missed import.

## 10. Layer 0d — Update jj-plugin imports

- [ ] 10.1 Add `@blackbelt-technology/pi-dashboard-client-utils` as a dependency in `packages/jj-plugin/package.json`. Do NOT add `pi-dashboard-markdown-content` — jj-plugin doesn't render markdown.
- [ ] 10.2 Grep `packages/jj-plugin/src/` for any cross-package relative imports; rewrite to package-name imports.
- [ ] 10.3 Run `npm test -w @blackbelt-technology/pi-dashboard-jj-plugin` to catch any missed import.

## 11. Layer 0e — Cross-package deep-import lint

- [ ] 11.1 Create `packages/shared/src/__tests__/no-cross-package-deep-imports.test.ts`. Scan every `*.ts`/`*.tsx` under `packages/*/src/`. For each, check every import specifier; fail when a specifier starts with `..` and resolves outside the importing package's directory.
- [ ] 11.2 Allow re-export shims at `packages/client/src/{components,hooks,lib,components/extension-ui}/` to use package-name imports (which they do).
- [ ] 11.3 Allow intra-package relative imports.
- [ ] 11.4 Run `npm test -w @blackbelt-technology/pi-dashboard-shared`; lint passes against the migrated repo.
- [ ] 11.5 Manual inverse test: temporarily add `import { Foo } from "../../../client/src/Foo.js"` to a flows-plugin file; run lint; confirm it fails with a clear message; revert.

## 12. Layer 0e — Vite alias updates

- [ ] 12.1 In `packages/client/vite.config.ts`, add path aliases mirroring the existing `pi-dashboard-shared` alias:
  - `"@blackbelt-technology/pi-dashboard-client-utils"` → `path.resolve(__dirname, "../client-utils/src")`
  - `"@blackbelt-technology/pi-dashboard-markdown-content"` → `path.resolve(__dirname, "../markdown-content/src")`
- [ ] 12.2 Restart Vite dev server; verify HMR works for edits in both new packages.

## 13. Layer 0e — Electron bundle-server.mjs updates

- [ ] 13.1 Open `packages/electron/scripts/bundle-server.mjs`. Find four hardcoded lists of `["server", "shared", "extension"]` (lines ~52, 120, 232, 340).
- [ ] 13.2 Add `"client-utils"` and `"markdown-content"` to all four lists.
- [ ] 13.3 Add `"packages/client-utils"` and `"packages/markdown-content"` to the synthetic `bundlePkg.workspaces` array (line ~120).
- [ ] 13.4 Run `npm run electron:bundle-server` (or equivalent) and verify both packages appear under `packages/electron/resources/server/packages/`.

## 14. Layer 0e — Publish workflow ordering

- [ ] 14.1 Identify the `PACKAGES=(...)` array in `.github/workflows/publish.yml` (lines ~166-173).
- [ ] 14.2 Add `@blackbelt-technology/pi-dashboard-client-utils` after `pi-dashboard-shared` and before any plugin.
- [ ] 14.3 Add `@blackbelt-technology/pi-dashboard-markdown-content` after `client-utils` and before any plugin.
- [ ] 14.4 Update `packages/shared/src/__tests__/publish-workflow-contract.test.ts` to assert both new packages precede `flows-plugin` and `jj-plugin`, and `client-utils` precedes `markdown-content`.
- [ ] 14.5 Run the contract test; verify it passes.

## 15. Layer 0f — Test mock-path resilience

- [ ] 15.1 Run the full test suite. The shim chain should keep `vi.mock("../../hooks/useMobile.js", ...)` style mocks working.
- [ ] 15.2 If any test fails due to mock resolution, investigate whether the failure is from a dynamic `vi.doMock` in `SessionHeader.attached-proposal-summary.test.tsx` or `SessionHeader.resume.test.tsx`. Update those specific dynamic mock paths to point at the package name.
- [ ] 15.3 Re-run; suite green.

## 16. Layer 0 — Verification gate

- [ ] 16.1 `npm run build` — clean build, no TS errors, no Vite warnings about unresolved imports.
- [ ] 16.2 `npm test` — full suite passes.
- [ ] 16.3 Inspect `packages/client/src/generated/plugin-registry.tsx` — Layer 1's predicate emission still works; jj-plugin's three predicates appear.
- [ ] 16.4 `pnpm pack -F flows-plugin --dry-run` (or `npm pack`); inspect file list and source for any `../../../client/` substring; must be zero hits.
- [ ] 16.5 Same for `jj-plugin` tarball.
- [ ] 16.6 Vite dev smoke: `npm run dev`, open dashboard, confirm browser console clean.
- [ ] 16.7 **CHECKPOINT** — Layer 0 complete. Commit and consider whether to push before continuing into Layer 2.

## 17. Layer 2 — Extend DashboardSession type

- [ ] 17.1 In `packages/shared/src/types.ts`, add three optional fields to `DashboardSession`: `flowState?: FlowState | null`, `flowStates?: ReadonlyMap<string, FlowState>`, `architectState?: ArchitectState | null`. (`FlowState` and `ArchitectState` already exist in this file at lines 547+ and 620+.)
- [ ] 17.2 Run `npm run build`; confirm no TS errors.

## 18. Layer 2 — Bridge populates flow state on session payloads

- [ ] 18.1 Read `packages/extension/src/flow-event-wiring.ts` and `packages/extension/src/session-sync.ts` to locate where `session_register` payloads are constructed.
- [ ] 18.2 Maintain a per-session-id map of latest `FlowState`, `flowStates` map, `architectState` inside the bridge; update on every `flow:*` / `architect:*` event the bridge already listens for.
- [ ] 18.3 At every `session_register` and at every model-tracker push, include the latest known `flowState`, `flowStates`, `architectState` fields on the outgoing payload.
- [ ] 18.4 Verify `MemorySessionManager` carries the augmented fields through to `sessions_snapshot`.
- [ ] 18.5 Add an integration test: spin up a fake bridge that emits `flow_started` then `session_register`; assert the server's session record contains `flowState`.
- [ ] 18.6 Add a reconnect test: with an active flow on session X, simulate browser disconnect + reconnect; assert the first `sessions_snapshot` after reconnect contains `session.flowState`.

## 19. Layer 2 — Create FlowsActionsContext and FlowActionsContext

- [ ] 19.1 Create `packages/flows-plugin/src/client/FlowsActionsContext.tsx` exporting `FlowsActionsContext`, `FlowsActionsProvider`, `useFlowsActions()` hook (throws when called outside provider).
- [ ] 19.2 Create `packages/flows-plugin/src/client/FlowActionsContext.tsx` exporting the per-active-session counterpart with the eight callbacks.
- [ ] 19.3 Add unit tests for both contexts.
- [ ] 19.4 Re-export both providers and hooks from `packages/flows-plugin/src/client/index.tsx`.

## 20. Layer 2 — Adapt flow components to {session} entry signatures

- [ ] 20.1 `FlowActivityBadge`: accept `{ session }`. Self-derive `flowName`/`agentsDone`/`agentsTotal`/`status` from `session.flowState`. Return `null` when falsy.
- [ ] 20.2 `SessionFlowActions`: accept `{ session }`. Pull `flows`/`commands`/`onFlowAction` from `useFlowsActions()`. Self-gate.
- [ ] 20.3 `FlowDashboard`: accept `{ session }`. Self-derive `flowState`/`flowStates`. Pull callbacks from `useFlowActions()`.
- [ ] 20.4 `FlowArchitect`: accept `{ session }`. Self-derive `architectState`. Pull callbacks.
- [ ] 20.5 `FlowAgentDetail`: accept `{ session, routeParams, onClose }`. Look up agent via `session.flowState?.agents.get(routeParams.agentId)`.
- [ ] 20.6 `FlowArchitectDetail`: same shape; derive from `session.architectState`.
- [ ] 20.7 `FlowSummary`: accept `{ session }`. Pull callbacks from `useFlowActions()`.
- [ ] 20.8 Internal rendering logic stays unchanged below the entry boundary.
- [ ] 20.9 Update existing component tests to render with new signatures + provider wrappers.

## 21. Layer 2 — Export predicates from flows-plugin

- [ ] 21.1 In `packages/flows-plugin/src/client/index.tsx`, export `hasActiveFlow(session): boolean` returning `Boolean(session?.flowState)`.
- [ ] 21.2 Export `hasActiveArchitect(session): boolean` returning `Boolean(session?.architectState)`.
- [ ] 21.3 Add unit tests covering true/false/null/undefined inputs for both.

## 22. Layer 2 — Restore manifest claims

- [ ] 22.1 In `packages/flows-plugin/package.json#pi-dashboard-plugin.claims`, populate the seven claims listed in spec `dashboard-shell-slots`.
- [ ] 22.2 Remove the `"//pi-dashboard-plugin-deferred-claims"` comment block.
- [ ] 22.3 Run `npm run build`; verify generated `plugin-registry.tsx` contains the new claim entries with predicate and Component refs.
- [ ] 22.4 Layer 1's build-time validation catches any claim referencing a missing export.

## 23. Layer 3 — Deduplicate flow JSX in App.tsx

- [ ] 23.1 Document the three FlowArchitect call sites + two FlowDashboard call sites with their exact gating conditions and prop differences.
- [ ] 23.2 Create `packages/client/src/__tests__/flow-rendering-parity.test.tsx`. Render scenarios covering (a) architect detail open, (b) flow detail agent open, (c) neither open. Snapshot the rendered JSX. Run against current code; commit baseline.
- [ ] 23.3 Refactor App.tsx to render FlowArchitect at most once with combined gating.
- [ ] 23.4 Refactor App.tsx to render FlowDashboard at most once with combined gating.
- [ ] 23.5 Re-run parity test; snapshots MUST match.
- [ ] 23.6 Manual gate: open a flow, drill into an agent, dismiss the summary. Confirm drill-down clears.

## 24. Layer 3 — Wire context providers in shell

- [ ] 24.1 In App.tsx, import `FlowsActionsProvider` and `FlowActionsProvider` from `@blackbelt-technology/pi-dashboard-flows-plugin/client`.
- [ ] 24.2 Wrap the session-list area with `<FlowsActionsProvider value={{ flows, commands, onFlowAction }}>`. Place above SessionList.
- [ ] 24.3 Wrap per-session content area with `<FlowActionsProvider value={{ onAbort, onToggleAutonomous, ... }}>`.
- [ ] 24.4 Verify React DevTools shows the providers wrapping their respective subtrees.

## 25. Layer 3 — Remove direct flow JSX from shell

- [ ] 25.1 Delete `import { FlowDashboard, FlowAgentDetail, FlowArchitect, FlowArchitectDetail }` from `App.tsx`.
- [ ] 25.2 Delete the deduplicated FlowArchitect block, replaced by `<ContentHeaderStickySlot session={selectedSession} />`.
- [ ] 25.3 Delete the deduplicated FlowDashboard block (same slot consumer renders both via predicate filtering).
- [ ] 25.4 Delete FlowAgentDetail and FlowArchitectDetail content-view JSX, replaced by `<ContentViewSlot session={...} routeParams={...} onClose={...} />`.
- [ ] 25.5 Delete FlowSummary inline-footer JSX, replaced by `<ContentInlineFooterSlot session={...} />`.
- [ ] 25.6 Delete `import { FlowActivityBadge, SessionFlowActions }` from `SessionCard.tsx` and remove inline JSX.
- [ ] 25.7 Delete FlowLaunchDialog imports + JSX from `SessionHeader.tsx` if no longer rendered directly.
- [ ] 25.8 `npm run build` + `npm test`. All pass.

## 26. Layer 3 — Regression tests

- [ ] 26.1 Create `packages/client/src/__tests__/session-card-no-double-flow.test.tsx`. Render a SessionCard with active flow; assert exactly one `FlowActivityBadge` and one `SessionFlowActions` instance.
- [ ] 26.2 Update `no-jsx-slot-nullish-fallback.test.ts::SCAN_FILES` to include `MobileShell.tsx`.
- [ ] 26.3 Run all client tests; pass.

## 27. Layer 4 — Verification

- [ ] 27.1 Full test suite: `npm test 2>&1 | tee /tmp/pi-test.log` — all tests pass.
- [ ] 27.2 `npm run build` — clean TypeScript, no warnings.
- [ ] 27.3 Pack inspection: `pnpm pack -F flows-plugin --dry-run`; grep tarball file list for `../../../`; zero hits.
- [ ] 27.4 Vite dev smoke: `npm run dev`, spawn a flow, verify FlowDashboard renders and is fully interactive.
- [ ] 27.5 Reconnect test (manual): spawn a flow, hard-refresh the browser, confirm flow UI re-renders.
- [ ] 27.6 Plugin status: `/api/health` reports `plugins.flows` with `loaded: true` and 7 claims.
- [ ] 27.7 Predicate filtering: spawn two sessions, run a flow on one only; FlowActivityBadge appears on the active-flow session card and is absent from the other.

## 28. Layer 4 — Documentation + housekeeping

- [ ] 28.1 Update AGENTS.md "Key Files" section: add rows for `packages/client-utils/` and `packages/markdown-content/` (≤ 200 chars each); update `packages/flows-plugin/` row to reflect "fully wired claims".
- [ ] 28.2 Update `docs/file-index.md` and `docs/file-index-client.md`, `docs/file-index-plugins.md` (or whichever splits apply) with rows for the moved files in their new locations.
- [ ] 28.3 Update `CHANGELOG.md` `## [Unreleased]` with a single Internal entry summarizing the migration. Mark `DashboardSession` field additions as additive (not breaking).
- [ ] 28.4 Mark obsolete proposals: `extract-client-utils-package`, `migrate-flows-jsx-to-slots`, `migrate-flows-content-slots`. Append a final note pointing to this change. Archive after this lands.
