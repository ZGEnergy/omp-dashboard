## Context

Flow rendering is the dashboard's reaction to `flow_*` events emitted by the external `pi-flows` extension. Today that reaction is hard-wired into the client shell across 12 components and 2 reducers (~250 LOC of conditional rendering in `App.tsx`, plus direct imports in `SessionCard.tsx`). The umbrella change `dashboard-plugin-architecture` introduces a slot taxonomy and a plugin loader; the runtime change `add-dashboard-shell-slots-runtime` lands the loader and slot consumer components. This change consumes both to relocate every flow-rendering file into a first-class plugin package and remove flow-specific knowledge from the shell.

**Scope**: client UI + reducer slice only. There is no server entry (flow events are forwarded by the existing `event-wiring.ts` server module without any flow-specific logic) and no bridge entry (pi-flows is its own pi extension, owned upstream).

**Dependencies**:
- `dashboard-plugin-architecture` — slot taxonomy frozen, plugin manifest schema defined.
- `add-dashboard-shell-slots-runtime` — `<ContentViewSlot/>`, `<ContentHeaderStickySlot/>`, `<ContentInlineFooterSlot/>`, `<SessionCardBadgeSlot/>`, `<SessionCardActionBarSlot/>` components exist; `pluginContext.registerReducerSlice` API is in place.

**Stakeholders**: dashboard maintainers (App.tsx + SessionCard.tsx surface area), flow plugin author (will own `packages/flows-plugin/` going forward), test suite owners (~30 test files paths shift).

## Goals / Non-Goals

**Goals:**
- Move all 12 flow-rendering files + 2 reducers from `packages/client/src/` into `packages/flows-plugin/client/` using `git mv` to preserve history.
- Replace ~250 LOC of conditional rendering in `App.tsx` with slot consumers.
- Replace direct imports in `SessionCard.tsx` with slot consumers.
- Delegate every `flow_*` event from `event-reducer.ts` to a plugin-registered reducer slice.
- Ensure the dashboard builds, runs, and passes tests with `flows-plugin` disabled (no flow dashboard, no agent cards, no architect view, no badges, no summary).
- Preserve sticky-header stacking order (architect on top, flow dashboard below) when both states are active.

**Non-Goals:**
- Touching the `pi-flows` pi extension itself (separate repo, separate ownership).
- Modifying the wire format of `flow_*` events (`packages/shared/src/browser-protocol.ts` flow types stay where they are; the plugin imports the existing types).
- Server-side changes beyond import path updates (no new REST routes, no new event types, no new persistence).
- Bundling-vs-not policy decisions for flows-plugin (covered by `add-dashboard-shell-slots-runtime` "bundled-by-default" concept).
- Changing the user-visible flow UI (this is a refactor; the rendered output must be pixel-identical pre/post).

## Decisions

### Decision 1: `flowState` and `architectState` stay on the same `SessionState` shape

Both reducer slices continue to write to the same `SessionState` object (not an isolated plugin-local store). Rationale:
- Sibling code (mobile shell, session card) already reads `session.flowState` and `session.architectState` for decision-making (e.g. "is there a flow running?" → show badge). Splitting state into a plugin-local store would force every consumer through `usePluginConfig` or similar, multiplying the refactor surface.
- The umbrella's "full state" decision (resolved open question #1 in `dashboard-plugin-architecture/design.md`) explicitly endorses plugins writing to the central state for now, with sliced state deferred until usage stabilizes.

**Alternative considered**: plugin-local Zustand store accessed via `usePluginState`. Rejected because slot consumers already receive `SessionState` as a prop (`SlotProps<"content-header-sticky">` includes `session: Session`); pulling out a parallel store doubles the wiring without benefit at this stage.

### Decision 2: Reducer slice registration via `pluginContext.registerReducerSlice(eventTypes, reducer)`

The plugin's client entry point (`flows-plugin/client/index.tsx`) calls:
```ts
pluginContext.registerReducerSlice(
  ["flow_started", "flow_agent_started", "flow_agent_complete", "flow_tool_call", "flow_tool_result", "flow_assistant_text", "flow_thinking_text", "flow_loop_iteration", "flow_complete", "flow:architect-start", "flow:architect-update", "flow:architect-complete"],
  flowReducerSlice,
);
```
- `event-reducer.ts` switch statement keeps every non-flow event type (no behavioral change for OpenSpec, tool calls, message streaming, etc.) and ends with a fall-through that walks the registry of plugin slices, invoking the first whose `eventTypes` list includes the current event type.
- Slice signature: `(state: SessionState, event: DashboardEvent) → SessionState`. Pure, same contract as the core reducer.
- Registration order is deterministic (manifest discovery order); first match wins. Two plugins registering for the same event type is a manifest validation error (caught at load time, not runtime).

**Alternative considered**: have plugins return *patches* (Immer-style) instead of full `SessionState`. Rejected because the core reducer is plain functional today; introducing a patch layer would be a separate refactor.

### Decision 3: Sticky header stacking via slot multiplicity

The `content-header-sticky` slot supports multiple concurrent contributions (frozen multiplicity in the slot taxonomy). The plugin contributes two claims:
- `FlowArchitect` with `predicate: (s) => s.architectState != null` and `priority: 10`.
- `FlowDashboard` with `predicate: (s) => s.flowState != null` and `priority: 20`.

Lower-priority renders first (top of stack). Today's `App.tsx` renders architect above flow dashboard; the priority assignment preserves that order. The slot consumer renders both stacked vertically with no extra spacing (today's behavior is `<div>` siblings inside the sticky container).

**Alternative considered**: a single composite component that owns both. Rejected because it forces a hard-coded couple between architect and flow lifecycles inside one render tree, which is exactly what the plugin model is meant to eliminate.

### Decision 4: `FlowYamlPreview`, `FlowAgentDetail`, `FlowArchitectDetail` claim `content-view` routes

These three are full-page content views opened from a flow card / agent card / architect card. The plugin claims:
- `content-view` route `flow-yaml/:flowName` → `FlowYamlPreview`
- `content-view` route `flow-agent-detail/:agentId` → `FlowAgentDetail`
- `content-view` route `architect-detail` → `FlowArchitectDetail`

Routes encode the parameters needed by each view. Navigation goes through `pluginRouter.push(route)` (provided by `add-dashboard-shell-slots-runtime`) instead of the legacy `setActiveView` callback that App.tsx currently passes around.

**Alternative considered**: keep `setActiveView` and have plugins push string ids into it. Rejected because every plugin would need to coordinate string ids with the shell's hard-coded `ActiveView` union; route-based dispatch is the slot model's intended pattern.

### Decision 5: `FlowSummary` as `content-inline-footer`

`FlowSummary` is a post-completion banner rendered below the chat (currently inside `App.tsx`). The plugin claims `content-inline-footer` with `predicate: (s) => s.flowState?.status === "complete" || s.flowState?.status === "error"`. Multiple inline-footer contributions stack; flow summary uses default priority (50).

### Decision 6: `FlowActivityBadge` and `SessionFlowActions` use plugin context for navigation

Both components navigate (e.g. badge click → opens flow dashboard view; actions menu → launches a new flow via `FlowLaunchDialog`). Today they call shell-owned callbacks passed via props. After extraction:
- Badge click → `pluginRouter.push("flow-dashboard")` (a `content-view` route the plugin will additionally claim, replacing the sticky-only mounting? — see Open Question 1).
- Actions menu → opens `FlowLaunchDialog` as a plugin-local modal (not a slot, not navigated to).

### Decision 7: Move test files alongside their subjects

All flow-related tests in `packages/client/src/__tests__/` and `packages/client/src/lib/__tests__/` move to `packages/flows-plugin/__tests__/` via `git mv`. Vitest config picks them up automatically (workspace-aware). This keeps tests co-located with the code they cover and lets future flow plugin work happen in one directory.

## Risks / Trade-offs

- **Reducer slice ordering & precedence** → Mitigated by deterministic manifest discovery order + load-time validation that no two plugins register for the same event type. A test asserts that with `flows-plugin` disabled, `flow_*` events are silently dropped (no runtime errors).
- **Sticky stacking regression** → Mitigated by a screenshot/regression test that boots a session with both `flowState` and `architectState` populated and verifies the rendered stack matches the pre-extraction baseline.
- **Hidden coupling via shared utilities** → `truncate-path.ts`, `useZoomPan.ts`, etc. are shared between flow components and core. These stay in `packages/client/src/lib/` and the plugin imports them via the plugin's allowed shared-imports list (defined by `dashboard-plugin-architecture`). A grep audit during implementation enumerates every `import` in the moved files and classifies it (intra-plugin / shared-allowed / shared-violating).
- **Mobile shell flow-specific behavior** → `MobileShell.tsx` has flow-aware swipe transitions today. Verify slot consumers receive enough props (route metadata, session state) for `MobileShell` to remain flow-agnostic. If not, escalate the missing prop into the slot's `SlotProps` definition (frozen taxonomy → minor bump).
- **App.tsx LOC reduction sets up next refactor** → Removing 250 LOC of flow logic from App.tsx still leaves OpenSpec / Subagents / Git logic in place; combined with `extract-openspec-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin` the eventual App.tsx is significantly smaller. Sequence the four extracts so each one's diff is reviewable in isolation.

## Migration Plan

1. Land `dashboard-plugin-architecture` (design only).
2. Land `add-dashboard-shell-slots-runtime` (plugin loader + slot consumers + `registerReducerSlice` API).
3. Scaffold `packages/flows-plugin/` with manifest, package.json (`"private": true` initially), and empty client/ subdir.
4. `git mv` the 12 flow components + 2 reducers + their tests into `packages/flows-plugin/`.
5. Wire the manifest's slot claims (one PR section per slot kind for reviewer manageability).
6. Register the reducer slice in the plugin's client entry.
7. Remove flow imports + JSX from `App.tsx`, `SessionCard.tsx`, `event-reducer.ts`. Run the full test suite.
8. Validate: a session with no flows-plugin loaded shows zero flow UI and emits no errors when `flow_*` events arrive (events flow through the reducer fall-through unchanged).
9. Update `AGENTS.md` Key Files table and `docs/architecture.md` Flow Dashboard Data Flow section.

**Rollback**: revert the four PRs in reverse order. `git mv` history preservation makes the revert clean.

## Open Questions

1. Should `FlowDashboard` *also* claim a `content-view` route (so the badge can navigate to a full-page version on mobile) in addition to its `content-header-sticky` claim? Today's UI uses the sticky-only mounting; punted to implementation-time once the slot consumers are real.
2. Does `FlowLaunchDialog` need to be a slot contribution (e.g. `anchored-popover`) or stay a plugin-local modal opened by `SessionFlowActions`? Leaning toward plugin-local modal — no other plugin needs to mount it.
3. The "register reducer slice" API needs to accept either a synchronous registration (called during plugin client entry) or a hook (called inside `usePluginContext`). Which one is the runtime change going to expose? Confirm during `add-dashboard-shell-slots-runtime` review before writing the plugin's client entry.
