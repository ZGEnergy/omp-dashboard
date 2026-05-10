## Why

The dashboard shell currently knows about flows in seven distinct places:
flow-specific scalars on `DashboardSession`, server-side flow event
reduction, client-side flow reducer dispatch in `event-reducer.ts`, JSX
call sites in `App.tsx` (3× FlowArchitect, 2× FlowDashboard, 3×
FlowLaunchDialog), `<FlowActivityBadge>` and `<SessionFlowActions>` in
`SessionCard.tsx`, `<FlowLaunchDialog>` in `SessionHeader.tsx`, and a
slash-command interception block in `App.tsx`. After this change, the
shell SHALL contain zero references to flows. The substring `flow`
SHALL not appear in any shell file.

`add-plugin-ui-primitive-registry` (commit `48011c2`) shipped the
primitive registry that lets plugins consume dashboard React primitives
without deep imports. flows-plugin already migrated its primitive
imports. The remaining work is moving every piece of flow knowledge out
of the shell.

The `command-route` slot (already used by jj-plugin for `/jj`) covers
slash-command registration via static manifest claims. The
`session-card-badge` / `session-card-action-bar` /
`content-header-sticky` / `content-view` / `content-inline-footer`
slots cover all rendering. The primitive registry covers internal
component dependencies (`MarkdownContent`, `DialogPortal`, etc.). The
only mechanism the plugin runtime is missing is event-stream access:
plugins today can only `useSessionState(id)` to read the frozen
`DashboardSession`; they cannot derive their own state from the event
stream.

This change adds **one** new plugin-runtime API,
`useSessionEvents(sessionId)`, that exposes the raw event stream the
shell already receives via `case "event"` in
`useMessageHandler.ts`. Plugins use it to run their own reducers in
their own contexts. With that primitive in hand, the entire flow
migration becomes plugin-internal work plus shell deletions.

## What Changes

### Part A — DELETE flow knowledge from the shell

**`packages/shared/src/types.ts`** — remove four fields from
`DashboardSession`:

- `activeFlowName?: string` (line 93)
- `flowAgentsDone?: number` (line 95)
- `flowAgentsTotal?: number` (line 97)
- `flowStatus?: FlowStatus` (line 99)

The `FlowStatus` type itself stays (it's used by `FlowState` inside the
plugin's reducer). The `FlowState` and `ArchitectState` types stay
exported from `shared/types.ts` because they're shared between
flows-plugin and any future consumer that wants to render flow data.

**`packages/server/src/event-status-extraction.ts`** — remove every
flow-specific branch (`activeFlowName`, `flowAgentsDone`,
`flowAgentsTotal`, `flowStatus` setters, lines 11-14, 92-107). The
server SHALL not look at flow events.

**`packages/client/src/lib/event-reducer.ts`** — remove imports of
`isFlowEvent` / `reduceFlowEvent` / `isArchitectEvent` /
`reduceArchitectEvent` from `flows-plugin/reducer` (lines 5-7), remove
`flowState` / `flowStates` / `architectState` fields from
`SessionState` (lines 120-123), remove the dispatch branches (lines
1292-1313). Shell's `SessionState` becomes flow-free.

**`packages/client/src/App.tsx`** — remove every `Flow*` JSX call site
(3× FlowArchitect, 2× FlowDashboard, FlowAgentDetail,
FlowArchitectDetail, 3× FlowLaunchDialog), every flow-related state
variable (`flowDetailAgent`, `architectDetailOpen`, `sourceOpenAgent`,
`flowYamlPreview`, `flowPickerOpen`, `flowNewOpen`,
`flowEditPickerOpen`, `flowEditFlowName`, `flowDeletePickerOpen`,
`flowDeleteFlowName`, `flowLaunchTarget`), every flow-related callback
(`openFlowYaml`, `toggleFlowAgentSource`), and every flow branch in
`wrappedHandleSend` (lines 600-630). Imports of `Flow*` from
`flows-plugin/client` SHALL be removed.

**`packages/client/src/components/SessionCard.tsx`** — remove imports
of `FlowActivityBadge` and `SessionFlowActions`, remove all three JSX
call sites (lines 434, 615, 646).

**`packages/client/src/components/SessionHeader.tsx`** — remove import
of `FlowLaunchDialog`, remove the JSX (line 536), remove the
`flowLaunchTarget` state.

After these deletions, `grep -rn flow packages/client/src
packages/server/src packages/shared/src --include='*.ts*' -i` SHALL
return zero matches in shell files (allow-list: workspace import of
`/reducer` from `event-reducer.ts` is removed; types `FlowState` /
`ArchitectState` exported from shared are referenced only by tests in
shared and by the plugin itself).

### Part B — ADD `useSessionEvents` to plugin runtime

**`packages/dashboard-plugin-runtime/src/plugin-context.tsx`** — add
one method to `PluginContextValue`:

```ts
useSessionEvents(sessionId: string): readonly DashboardEvent[];
```

Wired from `useMessageHandler.ts`'s existing event accumulator (the
shell already has the event stream per session). Returns events in
arrival order. The hook is reactive: when a new event arrives for the
subscribed session, the consuming component re-renders.

This is the **only** new public plugin-runtime API. Plugins now have
read access to the raw event stream and can derive any state they
want.

### Part C — ADD `route?` field to `PluginClaim`

**`packages/shared/src/dashboard-plugin/manifest-types.ts`** — add an
optional `route?: string` field to `PluginClaim`. Used by
`content-view` claims so multiple claims for the same slot can coexist
and be selected by route. This is a 5-line type addition + a 10-line
filter in `ContentViewSlot`. Existing claims without `route` continue
to match the empty-route default.

**`packages/dashboard-plugin-runtime/src/slot-consumers.tsx`**
`ContentViewSlot` SHALL filter `claims` by matching `claim.route`
against the active route extracted from `routeParams`. If multiple
claims match, priority order applies as today. If no claims match,
nothing renders.

**`packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`** — the
existing manifest validator gains awareness of the `route` field; no
new validation required (route is a free-form string).

### Part D — flows-plugin owns ALL flow logic

**Plugin-internal session-state context.** New file
`packages/flows-plugin/src/client/FlowsSessionStateContext.tsx`
exports `<FlowsSessionStateProvider>` and `useFlowsSessionState(sessionId)`.
The provider takes a `sessionId`, calls
`pluginContext.useSessionEvents(sessionId)`, runs `reduceFlowEvent` and
`reduceArchitectEvent` over the events via `useMemo`, and exposes:

```ts
interface FlowsSessionState {
  flowState: FlowState | null;
  flowStates: Map<string, FlowState>;
  architectState: ArchitectState | null;
}
```

`useFlowsSessionState(sessionId)` returns this for the requested
session. The reducer code is the existing
`packages/flows-plugin/src/reducer.ts` — already a workspace export
(`/reducer`); no changes needed there.

**Plugin-internal UI-state context.** New file
`packages/flows-plugin/src/client/FlowsUiStateContext.tsx` exports
`<FlowsUiStateProvider>` and `useFlowsUiState()`. Owns
`flowDetailAgent`, `architectDetailOpen`, `sourceOpenAgent`,
`flowYamlPreview`, plus setters. Plugin renders this provider inside
its content-view route handlers and any session-card children that
need to read selection state.

**Plugin-internal dialog state.** `<SessionFlowActions>` keeps its
launcher dialog state via local `useState` and renders it via the
registry's `dialogPortal` primitive. The three `FlowLaunchDialog`
instances previously rendered from `App.tsx` collapse into one
dialog rendered conditionally inside `SessionFlowActions`.

**Predicate-free badge gating.** The session-card-badge claim does NOT
use a predicate. Instead, `<FlowActivityBadge>` reads
`useFlowsSessionState(session.id).flowState`; if null, returns null.
Same pattern for `<FlowArchitect>` and `<FlowDashboard>`. This works
because the slot system already accepts components returning null and
re-renders when their internal state changes.

**Slash commands via `command-route` claims.** Manifest declares four
new `command-route` claims for `/flows`, `/flows:new`, `/flows:edit`,
`/flows:delete`. Components for each: `FlowsListRoute`,
`FlowsNewRoute`, `FlowsEditRoute`, `FlowsDeleteRoute` (small wrapper
components that mount the appropriate launcher dialog or picker).
`/flows` opens the picker; `/flows:new` opens the architect dialog;
`/flows:edit` opens the edit picker; `/flows:delete` opens the delete
picker. All four route through the existing `command-route` slot —
zero shell changes.

**`content-view` route claims.** `FlowAgentDetail` claims `content-view`
with `route: "flow-agent-detail"`. `FlowArchitectDetail` claims with
`route: "flow-architect-detail"`. `FlowYamlPreview` (the YAML viewer
that today is `flowYamlPreview` state in App.tsx) claims with
`route: "flow-yaml-preview"`. The `routeParams` carry the active agent
name and source path.

**Component refactors to slot-consumer signatures.** Seven components
adopt the slot prop contracts:

| Component | Slot | Route | Predicate |
|---|---|---|---|
| `FlowActivityBadge` | `session-card-badge` | — | (none — self-gates on internal state) |
| `SessionFlowActions` | `session-card-action-bar` | — | (none) |
| `FlowDashboard` | `content-header-sticky` | — | (self-gates) |
| `FlowArchitect` | `content-header-sticky` | — | (self-gates) |
| `FlowAgentDetail` | `content-view` | `flow-agent-detail` | — |
| `FlowArchitectDetail` | `content-view` | `flow-architect-detail` | — |
| `FlowYamlPreview` | `content-view` | `flow-yaml-preview` | — |
| `FlowSummary` | `content-inline-footer` | — | (self-gates) |
| `FlowsListRoute` / `New` / `Edit` / `Delete` | `command-route` | (via `command`) | — |

Internal callbacks that previously came from `App.tsx` props now come
from `pluginContext.send()` (for WS dispatch) and the plugin-internal
UI-state context (for selection state and dialog open/close).

**Manifest claims (full set).**

```json
"claims": [
  { "slot": "session-card-badge", "component": "FlowActivityBadge" },
  { "slot": "session-card-action-bar", "component": "SessionFlowActions" },
  { "slot": "content-header-sticky", "component": "FlowDashboard" },
  { "slot": "content-header-sticky", "component": "FlowArchitect" },
  { "slot": "content-view", "component": "FlowAgentDetail", "route": "flow-agent-detail" },
  { "slot": "content-view", "component": "FlowArchitectDetail", "route": "flow-architect-detail" },
  { "slot": "content-view", "component": "FlowYamlPreview", "route": "flow-yaml-preview" },
  { "slot": "content-inline-footer", "component": "FlowSummary" },
  { "slot": "command-route", "component": "FlowsListRoute", "command": "/flows" },
  { "slot": "command-route", "component": "FlowsNewRoute", "command": "/flows:new" },
  { "slot": "command-route", "component": "FlowsEditRoute", "command": "/flows:edit" },
  { "slot": "command-route", "component": "FlowsDeleteRoute", "command": "/flows:delete" }
]
```

The `//pi-dashboard-plugin-deferred-claims` field SHALL be removed.

**Provider wiring.** flows-plugin exports a single root
`<FlowsRootProvider>` from
`packages/flows-plugin/src/client/index.tsx`. The provider wraps both
`<FlowsSessionStateProvider>` and `<FlowsUiStateProvider>` and accepts
`{ children, pluginContext }`. Slot consumers wrap their contributions
in the root provider via the plugin-runtime's existing
`SlotErrorBoundary` mechanism — but the simpler path is: each
contribution component calls `useFlowsSessionState(session.id)`
internally; the provider lives at the contribution boundary, scoped
per-claim.

Actually: because slot consumers render multiple contributions
side-by-side (badges from many plugins on one session card), the root
provider must wrap the **entire dashboard** so contribution components
in different slots share one provider tree. Solution: flows-plugin
manifest gains a top-level `wrapper` field
(or registers via plugin context) that the slot system mounts above
all of its contributions. **Simpler path:** plugin runtime already
mounts a `<PluginContextProvider>` per plugin around its
contributions; flows-plugin re-uses that as the place to mount its
internal providers. Concretely, the plugin's client entry exports a
`PluginRoot` symbol that the runtime detects and wraps around
contributions. This SHALL be added to the plugin runtime as part of
this change.

### Part E — Tests

- `packages/shared/src/__tests__/no-flow-references-in-shell.test.ts`
  (new): scans `packages/shared/src/`, `packages/server/src/`,
  `packages/client/src/`, and any other shell file (allow-list:
  `packages/shared/src/types.ts` may export `FlowState` /
  `ArchitectState` types since they're shared types referenced by the
  plugin's `/reducer` export). Fails CI on case-insensitive substring
  match of `flow` in shell sources, with allow-list exemptions
  documented inline.
- `packages/dashboard-plugin-runtime/src/__tests__/use-session-events.test.tsx`
  (new): asserts `useSessionEvents(sessionId)` returns events in order,
  re-renders on new events, and is scoped per-session.
- `packages/dashboard-plugin-runtime/src/__tests__/content-view-route-filtering.test.tsx`
  (new): asserts `ContentViewSlot` filters claims by route and
  priority-resolves ties.
- `packages/flows-plugin/src/__tests__/predicates.test.ts` (deleted —
  predicates removed; component-level self-gate tests added instead).
- `packages/flows-plugin/src/__tests__/FlowsSessionStateContext.test.tsx`
  (new): unit-tests the reducer composition and re-render semantics
  given a mock `pluginContext.useSessionEvents`.
- Existing flows-plugin component tests SHALL be updated to wrap
  rendered components in `withUiPrimitiveProvider({...})` plus
  `<FlowsRootProvider>` (or the test-support equivalent).

### Out of scope

- **Cross-repo move to `pi-flows`.** Source stays in this monorepo.
  pi-flows extension changes are independent.
- **Pluggable reducer registry.** Not needed. Plugins consume
  `useSessionEvents` and run their own reducers internally.
- **`registerSlashCommand` runtime API.** Not needed. The existing
  `command-route` manifest slot covers all four flow commands.
- **`openPopover` runtime API.** Not needed. Dialog state stays
  plugin-internal.
- **Deleting `FlowState` / `ArchitectState` from `shared/types.ts`.**
  These remain exported because they're the type contract between the
  plugin's `/reducer` workspace export and any consumer that wants to
  render flow data. `flows-plugin` is the sole consumer today; future
  consumers (e.g. a CLI flow-status reporter) would import the same
  types.

## Capabilities

### Modified Capabilities

- `dashboard-plugin-loader`: `PluginContextValue` SHALL gain
  `useSessionEvents(sessionId): readonly DashboardEvent[]`. The plugin
  manifest's `PluginClaim` SHALL gain optional `route?: string` for
  content-view claims. Plugins SHALL be able to declare a `PluginRoot`
  client export that the runtime wraps around all of the plugin's
  contributions for shared per-plugin context.
- `dashboard-shell-slots`: `DashboardSession` SHALL NOT carry any
  flow-specific scalars (`activeFlowName`, `flowAgentsDone`,
  `flowAgentsTotal`, `flowStatus` REMOVED). The shell SHALL render
  flow content exclusively through plugin slot claims. The substring
  `flow` SHALL not appear in any shell source file (enforced by lint).
  `ContentViewSlot` SHALL filter claims by `route` against the active
  route.
- `extension-ui-system`: unchanged. Decorators stay scoped to the five
  declared kinds. Flows do NOT use the decorator channel; they use
  their own internal context derived from `useSessionEvents`.

### Specs not modified by this change

- `command-routing`, `command-autocomplete`: unchanged. The four
  flow slash commands route via the existing `command-route` slot.
- `flow-*` capability specs: behavioral specs unchanged. Components
  do the same things; entry signatures and state derivation change
  only.
- `plugin-ui-primitive-registry`: unchanged. Flows already consume
  the eight registered primitives.

## Impact

### Code

- `packages/shared/src/types.ts` — DELETE 4 flow scalar fields from
  `DashboardSession`. `FlowState` / `ArchitectState` exports unchanged.
- `packages/shared/src/dashboard-plugin/manifest-types.ts` — add
  `route?: string` to `PluginClaim`.
- `packages/server/src/event-status-extraction.ts` — DELETE flow
  scalar extraction (lines 11-14, 92-107). Server flow knowledge gone.
- `packages/dashboard-plugin-runtime/src/plugin-context.tsx` — add
  `useSessionEvents` to `PluginContextValue`. Wire from existing
  client-side per-session event accumulator (new in this change:
  shell exposes the events via the same hook the plugin context
  consumes; ~30 LOC).
- `packages/client/src/hooks/useMessageHandler.ts` — accumulate per-
  session events in a new `Map<sessionId, DashboardEvent[]>` so
  `useSessionEvents` has a source of truth. `case "event"` writes
  to it; `case "session_register"` initializes it; etc. ~25 LOC.
- `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` —
  `ContentViewSlot` filters by route. ~15 LOC.
- `packages/dashboard-plugin-runtime/src/plugin-registry.tsx` (build
  output) — vite-plugin generates the `PluginRoot` wrapper detection.
- `packages/client/src/lib/event-reducer.ts` — DELETE flow-related
  imports, fields, and dispatch branches.
- `packages/client/src/App.tsx` — DELETE ~270 LOC across all flow
  state, callbacks, JSX, and slash-command branches.
- `packages/client/src/components/SessionCard.tsx` — DELETE flow
  imports + 3 JSX call sites.
- `packages/client/src/components/SessionHeader.tsx` — DELETE flow
  import + 1 JSX call site + state.
- `packages/flows-plugin/src/client/FlowsSessionStateContext.tsx` —
  NEW. ~80 LOC.
- `packages/flows-plugin/src/client/FlowsUiStateContext.tsx` — NEW.
  ~60 LOC.
- `packages/flows-plugin/src/client/FlowsRootProvider.tsx` — NEW.
  ~30 LOC composing the two contexts.
- `packages/flows-plugin/src/client/{FlowsListRoute,FlowsNewRoute,FlowsEditRoute,FlowsDeleteRoute,FlowYamlPreview}.tsx`
  — NEW. ~50 LOC each.
- `packages/flows-plugin/src/client/index.tsx` — exports the
  four route components, `FlowYamlPreview`, `FlowsRootProvider`.
  Removes `hasActiveFlow` (replaced by self-gating).
- `packages/flows-plugin/src/client/{FlowAgentDetail,FlowArchitect,FlowArchitectDetail,FlowDashboard,FlowSummary,FlowActivityBadge,SessionFlowActions}.tsx`
  — entry-signature refactor; internals unchanged. Each component
  pulls state from `useFlowsSessionState(session.id)` and
  `useFlowsUiState()`, callbacks via `pluginContext.send()`.
- `packages/flows-plugin/src/client/FlowSummary.tsx` and
  `FlowAgentDetail.tsx` — replace local `formatTokens` /
  `formatDuration` with `useUiPrimitive(...)` lookups (PH-2 fix from
  validation).
- `packages/flows-plugin/package.json` — populated `claims` (12
  entries: 8 components + 4 command routes); removed
  `//pi-dashboard-plugin-deferred-claims`.
- `packages/shared/src/__tests__/no-flow-references-in-shell.test.ts`
  — NEW lint.
- `packages/dashboard-plugin-runtime/src/__tests__/use-session-events.test.tsx`
  — NEW unit test.
- `packages/dashboard-plugin-runtime/src/__tests__/content-view-route-filtering.test.tsx`
  — NEW unit test.
- `packages/flows-plugin/src/__tests__/FlowsSessionStateContext.test.tsx`
  — NEW unit test.
- Existing flows-plugin component tests — wrapped in providers.
- `migrate-flows-content-slots/proposal.md`,
  `migrate-flows-jsx-to-slots/proposal.md`,
  `remove-flow-dialog-interceptors/proposal.md` — SUPERSEDED banners
  added.

### Protocol / API

- **One new plugin-runtime API:** `useSessionEvents(sessionId)`.
- **One new manifest field:** `route?` on `PluginClaim`.
- **One new plugin-runtime convention:** `PluginRoot` exported symbol
  that the runtime wraps around contributions.
- **Four BREAKING removals from `DashboardSession`:** `activeFlowName`,
  `flowAgentsDone`, `flowAgentsTotal`, `flowStatus`. No other code
  reads these (verified by grep). The session-card scalars used in
  the previous `FlowActivityBadge` are recomputed inside the badge
  from event-derived state.
- No new gateway message types. No new REST endpoints.

### Dependencies

- No new published packages.
- flows-plugin keeps existing deps on
  `@blackbelt-technology/pi-dashboard-client-utils` (hooks +
  extension-ui slot consumers) and
  `@blackbelt-technology/dashboard-plugin-runtime` (registry hook +
  test helper + new `useSessionEvents`).

### Risk surface

- **Per-session event Map memory.** The shell starts caching every
  event per session indefinitely. For a long-running session with
  thousands of events, this grows the client's memory footprint.
  Mitigation: `useMessageHandler.ts` already retains all events in
  `SessionState` for the existing reducer; this change moves the
  retention from `SessionState` to a parallel Map, net zero memory
  delta. (The existing `SessionState.entries` is the chat history; it
  is already retained.) Eviction strategies (cap per session, LRU
  across sessions) can be added later as a separate change without
  breaking the contract.
- **`PluginRoot` mount lifecycle.** flows-plugin's
  `<FlowsRootProvider>` runs reducers via `useMemo` over events. On
  every event, every plugin contribution re-renders. Mitigation:
  reducer output is stable across no-op events; React.memo on slot
  contributions absorbs the re-renders. Verified by component-render
  tests.
- **Removing scalars from `DashboardSession` is a breaking type
  change.** Anything that reads `session.activeFlowName` outside the
  shell breaks at type-check time. Search confirms zero external
  consumers. The scalars were also exposed via REST `/api/sessions`
  responses; the response type is the same `DashboardSession`, so
  the field disappears from JSON. Old browsers that read it will
  receive `undefined` — same as today when no flow is active. No
  protocol break.
- **Slash commands via `command-route`.** The existing slot dispatches
  to a `content-view`-shaped component; today flow commands open
  *dialogs*, not full content views. The `FlowsListRoute` /
  `FlowsNewRoute` / etc. components SHALL render dialogs (via
  `dialogPortal` primitive) inside the content-view rendering area
  and call `onClose` on dismiss. This works because the slot system
  doesn't constrain what the rendered component does.
- **`PluginRoot` is a new convention.** Other plugins (jj-plugin,
  demo-plugin) don't need it today; making it optional ensures
  backward compatibility.

## Supersedes

- `complete-flows-plugin-migration` (already marked SUPERSEDED).
- `migrate-flows-content-slots` (banner SHALL be added in this
  change).
- `migrate-flows-jsx-to-slots` (banner SHALL be added in this
  change).
- `remove-flow-dialog-interceptors` (banner SHALL be added in this
  change — its scope is fully absorbed by Part D's command-route
  claims).
