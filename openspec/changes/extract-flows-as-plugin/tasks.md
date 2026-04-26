# Tasks

## 1. Preconditions

- [ ] 1.1 Confirm `dashboard-plugin-architecture` is archived and `add-dashboard-shell-slots-runtime` has landed (slot consumers, plugin loader, `pluginContext.registerReducerSlice` API all present in `packages/dashboard-plugin-runtime/`).
- [ ] 1.2 Confirm `packages/shared/src/dashboard-plugin/` exposes the `PluginManifest` and `SlotPropsMap` types this change will consume.
- [ ] 1.3 Read `packages/client/src/App.tsx`, `packages/client/src/components/SessionCard.tsx`, `packages/client/src/components/SessionList.tsx`, and `packages/client/src/components/MobileShell.tsx` and enumerate every flow-specific JSX branch / import. Record the inventory in a temporary checklist.
- [ ] 1.4 Run the existing test suite and capture a baseline pass count (`npm test 2>&1 | tee /tmp/flows-baseline.log`).

## 2. Scaffold the plugin package

- [ ] 2.1 Create `packages/flows-plugin/` with `package.json` (`"private": true`, name `@blackbelt-technology/pi-dashboard-flows-plugin`, lockstep version with the rest of the workspace).
- [ ] 2.2 Add the manifest field `pi-dashboard-plugin` to `packages/flows-plugin/package.json` declaring the slot claims (no `client` entry path yet — we wire it after the move).
- [ ] 2.3 Add `packages/flows-plugin/tsconfig.json` extending the workspace base; include `src/**/*.ts` and `src/**/*.tsx`.
- [ ] 2.4 Add `packages/flows-plugin/src/client/` directory (empty for now) and `packages/flows-plugin/src/client/index.tsx` placeholder that exports `registerPlugin(ctx)`.
- [ ] 2.5 Update workspace `package.json` to include `packages/flows-plugin` in the `workspaces` array.
- [ ] 2.6 Run `npm install` to wire the workspace; verify the package resolves.

## 3. Move flow files (history-preserving)

- [ ] 3.1 `git mv packages/client/src/components/FlowDashboard.tsx packages/flows-plugin/src/client/FlowDashboard.tsx`.
- [ ] 3.2 `git mv` `FlowAgentCard.tsx`, `FlowAgentDetail.tsx`, `FlowSummary.tsx`, `FlowGraph.tsx`, `FlowArchitect.tsx`, `FlowActivityBadge.tsx`, `FlowLaunchDialog.tsx`, `FlowTabBar.tsx`, `SessionFlowActions.tsx` from `packages/client/src/components/` to `packages/flows-plugin/src/client/`.
- [ ] 3.3 `git mv` `FlowArchitectDetail.tsx` (if present as a separate file) and `FlowYamlPreview.tsx` (if present) to the same destination.
- [ ] 3.4 `git mv packages/client/src/lib/flow-reducer.ts packages/flows-plugin/src/client/flow-reducer.ts`.
- [ ] 3.5 `git mv packages/client/src/lib/architect-reducer.ts packages/flows-plugin/src/client/architect-reducer.ts`.
- [ ] 3.6 `git mv` corresponding test files from `packages/client/src/__tests__/` and `packages/client/src/lib/__tests__/` into `packages/flows-plugin/src/__tests__/`.
- [ ] 3.7 Run `git status` and verify every move shows as `R` (rename) not `D + A` (delete + add) — required for history preservation.

## 4. Fix imports inside the moved files

- [ ] 4.1 Audit every `import` in the moved files; classify as intra-plugin (rewrite to relative paths within `flows-plugin`), shared-allowed (rewrite to `@blackbelt-technology/pi-dashboard-shared`), or shared-violating (escalate before continuing).
- [ ] 4.2 Update `flow-reducer.ts` and `architect-reducer.ts` to import `SessionState`, `DashboardEvent`, `FlowState`, `ArchitectState` types from `@blackbelt-technology/pi-dashboard-shared`.
- [ ] 4.3 Update each moved component to import sibling components/hooks via relative paths.
- [ ] 4.4 Update tests so paths in their `import` statements resolve to the new locations.
- [ ] 4.5 Run `tsc --noEmit` over `packages/flows-plugin/`; resolve every type error.

## 5. Wire slot claims and reducer slice

- [ ] 5.1 In `packages/flows-plugin/src/client/index.tsx`, implement `registerPlugin(ctx)` that:
  - Calls `ctx.registerReducerSlice(["flow_started", "flow_agent_started", "flow_agent_complete", "flow_tool_call", "flow_tool_result", "flow_assistant_text", "flow_thinking_text", "flow_loop_iteration", "flow_complete"], flowReducerSlice)`.
  - Calls `ctx.registerReducerSlice(["flow:architect-start", "flow:architect-update", "flow:architect-complete"], architectReducerSlice)` (or whichever event types pi-flows architect lifecycle emits today — verify in `architect-reducer.ts`).
- [ ] 5.2 Author the manifest's `slots` array with: `session-card-badge` (FlowActivityBadge), `session-card-action-bar` (SessionFlowActions), `content-header-sticky` × 2 (FlowArchitect priority 10, FlowDashboard priority 20), `content-view` route `flow-agent-detail/:agentId` (FlowAgentDetail), `content-view` route `architect-detail` (FlowArchitectDetail), `content-view` route `flow-yaml/:flowName` (FlowYamlPreview), `content-inline-footer` (FlowSummary).
- [ ] 5.3 Verify each component's predicate (e.g. badge predicate `(session) => session.activeFlowName != null`).
- [ ] 5.4 Update components that currently call shell-owned navigation callbacks (e.g. `setActiveView("flow-agent-detail")`) to call `pluginContext.pluginRouter.push(...)` instead.

## 6. Remove flow logic from the shell

- [ ] 6.1 In `packages/client/src/App.tsx`: remove imports of `FlowDashboard`, `FlowArchitect`, `FlowAgentDetail`, `FlowArchitectDetail`, `FlowYamlPreview`, `FlowSummary`, `FlowLaunchDialog`. Remove the JSX blocks that mount them (the conditional rendering identified in 1.3). Replace with `<ContentViewSlot/>`, `<ContentHeaderStickySlot/>`, `<ContentInlineFooterSlot/>` consumers (already mounted by `add-dashboard-shell-slots-runtime` — verify).
- [ ] 6.2 In `packages/client/src/components/SessionCard.tsx`: remove `import { FlowActivityBadge }` and `import { SessionFlowActions }`. Replace direct rendering with `<SessionCardBadgeSlot session={session}/>` and `<SessionCardActionBarSlot session={session}/>`.
- [ ] 6.3 In `packages/client/src/lib/event-reducer.ts`: remove the `case "flow_*"` branches (the slice mechanism handles them). Add the fall-through to plugin slices (per `add-dashboard-shell-slots-runtime` API) if not already present from runtime change. Keep the imports of `FlowState` / `ArchitectState` types (still on `SessionState`).
- [ ] 6.4 In `packages/client/src/components/MobileShell.tsx`: confirm any flow-specific behavior is removed or generalized to slot-aware behavior.
- [ ] 6.5 In `packages/client/src/lib/mobile-depth.ts` (and any other helper file): remove flow-specific branches.
- [ ] 6.6 Run `rg "FlowDashboard|FlowAgentCard|FlowSummary|flow-reducer|architect-reducer" packages/client/src/` and confirm zero matches outside test fixtures and the slot consumer plumbing.

## 7. Slot fallback guardrail

- [ ] 7.1 Wherever a slot consumer is added inside a `??` fallback chain in `App.tsx` (or any other shell file), gate the JSX element on `getClaims(...).length > 0` per `fix-slot-fallback-masks-content`.
- [ ] 7.2 Add any newly-touched shell file (e.g. `MobileShell.tsx`) to `SCAN_FILES` in `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts`.
- [ ] 7.3 Run the lint test and verify it passes.

## 8. Tests

- [ ] 8.1 Author a test in `packages/flows-plugin/src/__tests__/reducer-slice.test.ts` that registers the flow slice, dispatches a synthetic `flow_started → flow_agent_started → flow_complete` sequence, and asserts `SessionState.flowState` matches the pre-extraction snapshot byte-for-byte.
- [ ] 8.2 Author a test asserting that with the plugin disabled, `flow_*` events arrive at the core reducer and pass through unchanged (state untouched, no thrown errors).
- [ ] 8.3 Author a screenshot/regression test that mounts a session with both `flowState` and `architectState` populated and verifies the sticky header order (architect on top, flow dashboard below).
- [ ] 8.4 Update import paths in every moved test file; verify Vitest discovers them.
- [ ] 8.5 Run the full test suite (`npm test`); compare pass count to baseline from 1.4. Resolve every regression before proceeding.

## 9. Documentation

- [ ] 9.1 Update `AGENTS.md` Key Files table: remove the entries for the 12 moved components + 2 reducers; add one entry for `packages/flows-plugin/package.json` summarizing the manifest claims; add a one-line entry for `packages/flows-plugin/src/client/index.tsx` describing the `registerPlugin` entry.
- [ ] 9.2 Update `docs/architecture.md` Flow Dashboard Data Flow section: replace internal references to `FlowDashboard.tsx` with the plugin package; add a paragraph noting flow rendering is now removable.
- [ ] 9.3 Note in `README.md` (if relevant) that flows-plugin is bundled-by-default but disablable via `plugins.flows.enabled = false`.

## 10. Verify and clean up

- [ ] 10.1 `npm run build` (full workspace).
- [ ] 10.2 `pi-dashboard restart` and manually exercise: launch a flow → verify badge appears → click into agent detail → verify architect view → flow completes → verify summary footer renders → dismiss → verify session card returns to non-flow state.
- [ ] 10.3 Disable the plugin via config (`plugins.flows.enabled = false`), reload, and verify zero flow UI renders and zero errors fire when `flow_*` events arrive.
- [ ] 10.4 `openspec validate extract-flows-as-plugin --strict` passes.
- [ ] 10.5 Run `openspec status --change extract-flows-as-plugin` and confirm every artifact is `done`.
