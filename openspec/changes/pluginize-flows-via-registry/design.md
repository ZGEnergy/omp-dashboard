## Context

The dashboard's plugin system today supports plugins as renderers of
data already on `DashboardSession`. Plugins consume via
`useSessionState(id)` and contribute components via slot claims. This
works for jj-plugin (which reads `session.jjState`, populated by core
event handling) but doesn't work for flows-plugin, which needs to
derive `FlowState` and `ArchitectState` from the event stream.

Three options were considered:

1. **Server-side reduction.** Have the server run flow reducers and
   attach `flowState` to `DashboardSession`. Forces server to know
   about flows; requires Map-to-array serialization for
   `FlowState.agents`; requires bridge protocol changes; couples server
   release cadence to plugin reducer changes.
2. **Bridge-side reduction.** Have the bridge run flow reducers and
   send state with each `session_register`. Same Map serialization
   problem; bridges become stateful per-session; complicates
   reconnection.
3. **Client-side reduction inside the plugin.** Plugin gets read access
   to the event stream (a new `useSessionEvents` hook) and runs its
   reducers in its own React context. Maps stay client-side. Server
   stays generic. Bridge stays a relay.

Option 3 wins on every axis: smallest surface area, no serialization
issue, no protocol changes, plugin owns its complete state lifecycle,
and the new primitive (`useSessionEvents`) is generic — every future
plugin (openspec, git, subagents) can use it.

This design extends the plugin runtime with the minimum needed to
make Option 3 work, then deletes every flow reference from the shell.

## Goals

1. The dashboard shell SHALL contain zero flow references. The
   substring `flow` SHALL not appear in `packages/{shared,server,client}/src/`
   (allow-list: `FlowState` / `ArchitectState` type exports in
   `shared/types.ts` referenced by the plugin's `/reducer` workspace
   export).
2. flows-plugin SHALL own its complete lifecycle: reducers, state,
   UI selection state, dialog state, slash commands, rendering.
3. Adding a new plugin (openspec, git, subagents) that needs
   event-derived state SHALL require zero shell changes. The
   `useSessionEvents` primitive is the contract.
4. No new gateway message types. No new REST endpoints. No protocol
   changes.

## Non-Goals

- Cross-repo move to `pi-flows`.
- Pluggable reducer registry (replaced by `useSessionEvents` + plugin-
  internal reducer).
- `registerSlashCommand` runtime API (replaced by existing
  `command-route` slot).
- `openPopover` runtime API (replaced by plugin-internal dialog
  state).

## Decisions

### Decision 1 — Plugin owns its session-state reducer via `useSessionEvents`

**Decision.** Add one method to `PluginContextValue`:
`useSessionEvents(sessionId): readonly DashboardEvent[]`. Plugins call
it inside their internal context provider, run their reducers via
`useMemo`, and expose the resulting state via plugin-internal context.

**Why.** Per-session state derivation is the responsibility of the
plugin that owns the events. The shell has no business looking at
`flow_started` or `architect_dag_step_advanced` event types. Generic
event-stream access is the right abstraction: every plugin consumes
the same primitive; each runs whatever reducers it owns.

**Alternatives rejected.**

- *Plugin-registered reducer registry.* Shell would call back into
  plugin code per event. Couples shell event-loop to plugin failure
  modes. Replaced by plugin running reducers in its own React lifecycle
  with `useMemo` — failures contained by `SlotErrorBoundary`.
- *Server-side reduction onto DashboardSession.* Examined in Context
  above. Loses on every axis.
- *Decorator-channel abuse.* The five decorator kinds aren't suited
  for arbitrary structured state. The validation explored this and
  found it fragile.

**Risk.** Every plugin that consumes `useSessionEvents` will subscribe
to the full event stream for its session. With many plugins active,
re-render fan-out grows. Mitigation: reducer output stability via
`useMemo` reference equality; React.memo on slot contributions; future
optimization (only re-render if a plugin's `isXEvent(event)` predicate
matched).

### Decision 2 — Plugin self-gates by returning null instead of using predicates

**Decision.** Manifest claims for flows-plugin do NOT use predicates.
Components self-gate by reading their internal state and returning
null when no flow is active. The slot system already accepts null
returns and re-renders when the component's internal state changes.

**Why.** Predicates registered on the manifest run against
`DashboardSession`. With `activeFlowName` removed, the predicate has
nothing to read. The alternative — keeping the scalars on
`DashboardSession` for the predicate — defeats the architectural
goal.

Self-gating is also closer to React's natural rendering model:
"render if you have data to render." The badge slot is `multiplicity:
"many"`; multiple badge components from multiple plugins can each
render or render-null based on their own state. Performance is the
same as predicate filtering because the slot consumer doesn't
short-circuit either way — it just renders the badge component, which
returns null and produces zero DOM.

**Risk.** Slightly more re-renders than predicate gating (the badge
function is called even when null). Acceptable: badge components are
trivial; React.memo wraps the renders; `useMemo`-stable reducer output
prevents downstream cascade.

**Alternatives rejected.**

- *Predicates referencing plugin-internal state.* Predicates are pure
  functions referenced by name and serialized into the manifest.
  Cannot close over plugin context. Architecturally impossible.
- *Predicates reading a new "computed" field on DashboardSession that
  the plugin populates.* Reintroduces server/bridge state plumbing.
  Same problem this change avoids.

### Decision 3 — `route?` field on `PluginClaim`

**Decision.** Add optional `route?: string` to `PluginClaim`.
`ContentViewSlot` filters by route. Multiple `content-view` claims
coexist when their routes differ.

**Why.** `content-view` is `multiplicity: "one-active"`: today, only
the first matching claim renders. With multiple plugins each owning
their own routes (flows-plugin's `flow-agent-detail`,
`flow-architect-detail`, `flow-yaml-preview`; openspec's future
`spec-detail`; git's future `branch-graph`), some discriminator is
required. Route-based filtering is the smallest, most explicit
mechanism.

**Why not predicates on content-view?** Predicates are session-shaped
(`(session) => boolean`). Routes are intent-shaped ("the user
navigated to this view"). They're orthogonal. A future change can
combine them if needed; today, route is sufficient and matches the
URL-routing the shell already does.

**Risk.** Two claims could declare the same route. Resolution: priority
order (existing slot semantic). The lint can flag duplicate routes
across claims for the same plugin; cross-plugin route collisions are
the user's problem (rare; documented).

### Decision 4 — Slash commands via existing `command-route` slot

**Decision.** Flows-plugin declares four `command-route` claims:
`/flows`, `/flows:new`, `/flows:edit`, `/flows:delete`. Each renders a
small wrapper component that mounts the appropriate dialog/picker.

**Why.** The slot exists. jj-plugin uses it. No new API needed. The
shell's only knowledge becomes: "if the user types a `/foo` command
and a plugin has registered `command-route` for `/foo`, render its
component." Generic, plugin-agnostic.

**Why not the extension-UI-modules path?** `Session.uiModules` is
populated by extensions emitting `ui_modules_list` over the bridge.
That's the right channel for tools shipped with extensions (e.g.
judo's `/judo:status`). For dashboard-side plugins that have no
extension, the manifest-driven `command-route` claim is the
established path.

**Risk.** `command-route` was designed for "open this view" flows. The
flow commands are dialog-launchers, not view-mounters. Solution: the
wrapper component renders `<DialogPortal>` (registry primitive) with
its dialog content, calls `onClose` on dismiss, and the slot consumer
treats it as a content-view that has zero footprint until dismissed.
Tested in the flows-plugin component tests.

### Decision 5 — `PluginRoot` symbol for per-plugin context wrapping

**Decision.** flows-plugin exports a `PluginRoot` named export from
its client entry. The plugin runtime detects this export and wraps it
around all of the plugin's contributions. The runtime mounts one
`PluginRoot` per plugin per dashboard mount.

**Why.** flows-plugin needs `<FlowsRootProvider>` (the composition of
`<FlowsSessionStateProvider>` and `<FlowsUiStateProvider>`) above
every contribution: the badge in a session card, the dashboard
content-header-sticky, the content-view dialogs, the command-route
wrappers. Without per-plugin wrapping, each contribution would have to
mount its own provider, multiplying the reducer work and breaking
selection-state sharing across components.

`PluginRoot` is opt-in: plugins that don't export it (jj-plugin,
demo-plugin today) get no wrapper; their contributions mount directly.
Backward compatible.

**Why not a manifest field?** A wrapper is React code; it can't be
declared in JSON. The named-export convention matches `component`
references in claims (also named exports of the client entry). The
vite plugin already validates that manifest references exist as named
exports — it's a small extension to recognize the optional `PluginRoot`
symbol.

**Risk.** A `PluginRoot` that throws breaks every contribution from
that plugin. Mitigation: wrap in `SlotErrorBoundary` at the plugin
level (one boundary per plugin around its `PluginRoot`). Failures of
one plugin's root don't affect other plugins' contributions.

### Decision 6 — Delete the four flow scalars from `DashboardSession`

**Decision.** `activeFlowName`, `flowAgentsDone`, `flowAgentsTotal`,
`flowStatus` are removed from the `DashboardSession` interface and
from the server's `event-status-extraction.ts`.

**Why.** They're flow-specific. Their existence on a generic session
type is the most visible architectural contamination — every other
plugin's similar fields would multiply this list. Removing them is
the litmus test of "the shell knows zero about flows."

**Migration.** The session-card badge previously read these directly
from `session`. Now it reads from `useFlowsSessionState(session.id).flowState`,
recomputing the same values from event-derived state. The badge is
gated by self-render-null when `flowState === null`. Visual parity is
preserved; the data source moves.

**Risk.** Anything outside the shell that reads these fields breaks at
type-check time. Verified by grep:
`grep -rn 'activeFlowName\|flowAgentsDone\|flowAgentsTotal\|flowStatus'
packages/ --include='*.ts*'` — only consumers are `event-status-extraction.ts`
(server, deleted in this change), `App.tsx` and `SessionCard.tsx`
(shell, deleted in this change), and `FlowActivityBadge.tsx` (plugin,
refactored to read from internal state). No external consumers.

The REST `/api/sessions` response shape changes (these four fields
disappear). External clients (e.g. status pollers) that read them
receive `undefined` — same as today when no flow is active. No protocol
break for any active consumer.

### Decision 7 — Ordering of changes

**Decision.** Sequence:

1. **Foundations (B + C).** Add `useSessionEvents` to plugin runtime;
   accumulate per-session events in `useMessageHandler.ts`; add
   `route?` to `PluginClaim`; update `ContentViewSlot` for route
   filtering. Land independently — pure additions, no behavior change.
2. **`PluginRoot` convention.** Add detection + wrapping in plugin
   runtime. flows-plugin still ships its old shell-coupled rendering;
   `PluginRoot` is opt-in and untested in production until the next
   step.
3. **Plugin-internal contexts + claims.** flows-plugin exports
   `<FlowsRootProvider>` as `PluginRoot`, exports the seven refactored
   components with self-gate logic, exports four command-route
   wrappers. Manifest claims populated. Slot consumers begin rendering
   flows from claims. Shell still renders flow JSX in parallel —
   double rendering allowed during cutover.
4. **Shell deletions (A).** Delete every flow reference from
   `App.tsx`, `SessionCard.tsx`, `SessionHeader.tsx`,
   `event-reducer.ts`, `event-status-extraction.ts`,
   `shared/types.ts`. Land the lint that enforces zero flow references.
5. **Cleanup.** Remove `hasActiveFlow` predicate (no longer used).
   Update tests. Add SUPERSEDED banners to the three superseded
   proposals.

Each step is independently revertible. Step 4 is the dramatic one
(~270 LOC deleted from `App.tsx`); steps 1–3 ship infrastructure with
zero UX change.

## Open Questions

None blocking.

- *How will memory grow per session over time?* The new per-session
  event Map mirrors what `SessionState` already retains. Net memory
  delta is zero. If long sessions become an issue, future change can
  cap retention.
- *Will future plugins follow this pattern?* Yes — the openspec, git,
  and subagents extractions inherit the same `useSessionEvents` +
  plugin-internal context pattern. This change is the proof of concept
  for the next three.
