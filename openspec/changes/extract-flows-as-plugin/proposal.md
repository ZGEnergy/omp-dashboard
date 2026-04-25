## Why

The dashboard's flow rendering is currently 12 client files (`FlowDashboard`, `FlowAgentCard`, `FlowAgentDetail`, `FlowSummary`, `FlowGraph`, `FlowArchitect`, `FlowArchitectDetail`, `FlowActivityBadge`, `FlowLaunchDialog`, `FlowTabBar`, `SessionFlowActions`, plus `flow-reducer.ts`, `architect-reducer.ts`). `App.tsx` has hard-coded conditional rendering for `FlowAgentDetail`, `FlowArchitectDetail`, `FlowYamlPreview`. `SessionCard.tsx` directly imports `FlowActivityBadge` and `SessionFlowActions`. `App.tsx` mounts `FlowArchitect` and `FlowDashboard` as sticky content headers.

pi-flows itself is an external pi extension (separate repo). The dashboard's flow rendering is the dashboard's *reaction* to pi-flows events (`flow_started`, `flow_agent_started`, `flow_complete`, etc.). That reaction is the candidate for extraction.

The umbrella proposal `dashboard-plugin-architecture` introduces the plugin loader and slot taxonomy. This change uses that infrastructure to **move flow rendering into a first-class plugin package** at `packages/flows-plugin/`, register its UI via slot claims, and remove flow-rendering knowledge from the dashboard shell.

After this lands, the dashboard works without flows-plugin (no flow dashboard, no agent cards, no architect view, no flow badges) and flow rendering can ship independently. pi-flows remains the source of flow events; the dashboard's reaction is now a removable plugin.

This change DEPENDS ON `dashboard-plugin-architecture` and `add-dashboard-shell-slots-runtime` being implemented first.

## What Changes

- **NEW**: `packages/flows-plugin/` package with `pi-dashboard-plugin` manifest and a `client/` subdir (no server entry — flow events are forwarded by the existing dashboard event-wiring; no bridge entry — pi-flows is its own pi extension).
  - `client/` — `FlowDashboard`, `FlowAgentCard`, `FlowAgentDetail`, `FlowSummary`, `FlowGraph`, `FlowArchitect`, `FlowArchitectDetail`, `FlowActivityBadge`, `FlowLaunchDialog`, `FlowTabBar`, `SessionFlowActions`, plus `flow-reducer.ts`, `architect-reducer.ts`.
- **MOVE** (not copy): every flow-rendering file from `packages/client/src/` into `packages/flows-plugin/`. Use `git mv` to preserve history.
- **NEW**: Slot claims in the manifest:
  - `session-card-badge` → `FlowActivityBadge` (predicate: sessions with `activeFlowName`)
  - `session-card-action-bar` → `SessionFlowActions`
  - `content-header-sticky` → `FlowDashboard` (predicate: session has `flowState`) and `FlowArchitect` (predicate: session has `architectState`)
  - `content-view` (route `flow-agent-detail/:agentId`) → `FlowAgentDetail`
  - `content-view` (route `architect-detail`) → `FlowArchitectDetail`
  - `content-view` (route `flow-yaml`) → `FlowYamlPreview`
  - `content-inline-footer` → `FlowSummary` (predicate: flowState exists)
- **NEW**: Reducer slice — flow state is currently merged into the per-session reducer. The plugin's reducer slice continues to live at the same conceptual layer; `event-reducer.ts` delegates flow event types to `flowsPlugin.flowReducer` exported from the plugin package.
- **REMOVE** from `App.tsx`: ~250 LOC of flow-specific conditional rendering and sticky header mounting (replaced by `<ContentViewSlot/>` and `<ContentHeaderStickySlot/>`).
- **REMOVE** from `SessionCard.tsx`: direct imports of `FlowActivityBadge`, `SessionFlowActions`.
- **REMOVE** from `event-reducer.ts`: hard-coded knowledge of flow event types; replaced by a delegate registry where each plugin can register its event handlers.

## Capabilities

### New Capabilities

None. This change is a refactor that uses `dashboard-shell-slots` and `dashboard-plugin-loader` already established by the umbrella.

### Modified Capabilities

- `event-reducer`: SHALL accept reducer slices from plugins via `pluginContext.registerReducerSlice(eventTypes, reducer)`. The plugin loader invokes plugin client entries to collect slices before the reducer runs.
- Existing flow capabilities in `openspec/specs/`: `flow-card-grid`, `flow-card-status`, `flow-card-launcher`, `flow-summary-view`, `flow-agent-detail`, `flow-architect-view`, etc. — their main spec files in `openspec/specs/` move under `packages/flows-plugin/specs/` and become plugin-internal documentation.

## Impact

- `packages/client/src/App.tsx` — ~250 LOC reduction.
- `packages/client/src/components/SessionCard.tsx` — replace direct imports with slot consumers.
- `packages/client/src/lib/event-reducer.ts` — accept reducer slices.
- `packages/flows-plugin/` — NEW package with all moved files.
- ~30 test files — paths in import statements update; behavioral assertions unchanged.
- `AGENTS.md` Key Files — replace internal flow entries with the plugin package and its manifest.
- `docs/architecture.md` — update Flow Dashboard Data Flow section to reference the plugin package.

## Migration Risks

- **Reducer integration**: the existing `event-reducer.ts` has tightly-coupled flow logic. The cleanest migration is to introduce a `registerReducerSlice` mechanism in the loader and have plugin client entries register their slice on import. Validation: a session that runs a flow should reach the same final reducer state pre- and post-extraction.
- **Architect lifecycle**: pi-flows' architect lifecycle (`flow:architect-*` events) goes through `architect-reducer.ts`. That moves to `flows-plugin` but the bridge still emits the events; verify the protocol is unchanged.
- **Sticky header stacking**: `FlowDashboard` and `FlowArchitect` can both render simultaneously when both states exist. The `content-header-sticky` slot must support multiple concurrent contributions and stack them correctly. Validation: confirm the stacking rule matches today's `App.tsx` behavior (architect on top, flow dashboard below).
- **Mobile shell**: `MobileShell` currently has flow-specific behavior. Verify the slot consumers work in both desktop and mobile layouts.

## References

- Umbrella: `openspec/changes/dashboard-plugin-architecture/`
- Sibling extraction: `openspec/changes/extract-openspec-as-plugin/`
- pi-flows source repo: external (referenced by name only).
- Layout scan results: `openspec/changes/dashboard-plugin-architecture/design.md` §"Current dashboard layout"
