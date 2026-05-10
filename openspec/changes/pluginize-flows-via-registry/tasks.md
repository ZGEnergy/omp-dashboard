# Implementation Tasks

Sequenced per Decision 7. Each part is independently revertible.

## Part B — Plugin runtime: useSessionEvents (foundations, no behavior change)

- [ ] B.1 In `packages/client/src/hooks/useMessageHandler.ts`, add a
      new `Map<string, DashboardEvent[]>` accumulator alongside the
      existing `setSessionStates`. Initialize empty on
      `case "session_register"`. Append on `case "event"`. Clear on
      session unregister.
- [ ] B.2 Expose the accumulator via a new ref + setter pair so the
      `PluginContextProvider` can read it.
- [ ] B.3 In `packages/dashboard-plugin-runtime/src/plugin-context.tsx`,
      add `useSessionEvents(sessionId)` to `PluginContextValue`.
      Implementation: `useSyncExternalStore` over the accumulator with
      a per-session subscription. Returns the array reference;
      stable across no-op renders.
- [ ] B.4 Re-export `useSessionEvents` from
      `packages/dashboard-plugin-runtime/src/index.ts`.
- [ ] B.5 Unit test
      `packages/dashboard-plugin-runtime/src/__tests__/use-session-events.test.tsx`:
      assert per-session scoping, arrival-order, re-render on new
      event, reference stability across no-op renders.
- [ ] B.6 Build clean: `npm run build`. No regressions.

## Part C — Plugin runtime: route filtering on content-view

- [ ] C.1 Add optional `route?: string` field to `PluginClaim` in
      `packages/shared/src/dashboard-plugin/manifest-types.ts`.
- [ ] C.2 In
      `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`,
      modify `ContentViewSlot` to filter `claims` by matching
      `claim.route` against the active route extracted from
      `routeParams.route` (or whatever the route key is in the slot
      props — read existing route plumbing). Priority resolution
      among matching claims is unchanged.
- [ ] C.3 In
      `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`,
      ensure `route` is preserved when generating the registry. No
      validation added (free-form string).
- [ ] C.4 Unit test
      `packages/dashboard-plugin-runtime/src/__tests__/content-view-route-filtering.test.tsx`:
      asserts route-based filtering, no-route fallback to empty
      route, priority resolution among matching claims.

## Part D — Plugin runtime: PluginRoot wrapper convention

- [ ] D.1 In
      `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`,
      detect whether the plugin's client entry exports `PluginRoot`.
      If yes, emit it into the generated registry alongside the
      claim references.
- [ ] D.2 In
      `packages/dashboard-plugin-runtime/src/plugin-registry.tsx`
      (or wherever the runtime mounts contributions), wrap the
      plugin's contributions in its `PluginRoot` if defined,
      surrounded by a `SlotErrorBoundary` scoped to the plugin.
- [ ] D.3 Backward compatibility: plugins without `PluginRoot`
      continue to mount contributions directly. Verified by
      jj-plugin and demo-plugin tests.
- [ ] D.4 Unit test
      `packages/dashboard-plugin-runtime/src/__tests__/plugin-root.test.tsx`:
      asserts wrapper applied when defined, omitted when absent,
      error-boundary isolation across plugins.

## Part E — flows-plugin: internal contexts and reducers

- [ ] E.1 Create
      `packages/flows-plugin/src/client/FlowsSessionStateContext.tsx`.
      Provider takes `sessionId` from React context (passed from the
      `PluginRoot` mount point — see E.4); inside the provider,
      `useSessionEvents(sessionId)` plus `useMemo` running
      `reduceFlowEvent` and `reduceArchitectEvent` over the events.
      Exposes `{ flowState, flowStates, architectState }` via context.
      Hook `useFlowsSessionState(sessionId)` returns the value.
- [ ] E.2 Create
      `packages/flows-plugin/src/client/FlowsUiStateContext.tsx`.
      Owns `flowDetailAgent`, `architectDetailOpen`, `sourceOpenAgent`,
      `flowYamlPreview`, plus setters. Hook `useFlowsUiState()`.
- [ ] E.3 Create
      `packages/flows-plugin/src/client/FlowsRootProvider.tsx`.
      Composes both contexts; accepts `{ children }`; this is the
      `PluginRoot` export.
- [ ] E.4 Per-session-state caching: since `FlowsSessionStateProvider`
      runs reducers per session, multiple concurrent sessions need
      separate state. Implement as a single root-level provider that
      maintains an internal `Map<sessionId, FlowsSessionState>` keyed
      by sessionId and recomputed lazily per session via a hook with
      a `sessionId` argument. This allows one `<FlowsRootProvider>`
      to serve all sessions on the dashboard.
- [ ] E.5 Export `FlowsRootProvider as PluginRoot` from
      `packages/flows-plugin/src/client/index.tsx`.
- [ ] E.6 Unit test
      `packages/flows-plugin/src/__tests__/FlowsSessionStateContext.test.tsx`:
      mock `pluginContext.useSessionEvents`, assert reducer composition,
      per-session scoping, re-memoization on new events.

## Part F — flows-plugin: refactor components to slot-consumer signatures

- [ ] F.1 `FlowActivityBadge` → `({ session, pluginContext })`. Reads
      `useFlowsSessionState(session.id).flowState`. Returns null when
      `flowState === null` (self-gate). Otherwise renders the same
      DOM as today using event-derived counts.
- [ ] F.2 `SessionFlowActions` → `({ session, pluginContext })`. Reads
      flow list from a new pluginContext-derived source (server REST
      `/api/flows` or session-scoped commands list). Owns its launcher
      dialog state via local `useState`. Renders `FlowLaunchDialog`
      via `dialogPortal` primitive.
- [ ] F.3 `FlowDashboard` → `({ session, pluginContext })`. Reads
      `flowState` / `flowStates` from `useFlowsSessionState`. Reads
      selection from `useFlowsUiState`. Self-gates on null flowState.
- [ ] F.4 `FlowArchitect` → `({ session, pluginContext })`. Reads
      `architectState` from `useFlowsSessionState`. Self-gates.
      Unified dismiss callback (clears flowDetailAgent +
      architectDetailOpen + dispatches `dismiss_summary` via
      `pluginContext.send()`).
- [ ] F.5 `FlowAgentDetail` →
      `({ session, routeParams, onClose, pluginContext })`. Reads
      `flowState.agents.get(routeParams.agentName)`. The `onClose`
      slot prop replaces the previous `onBack`.
- [ ] F.6 `FlowArchitectDetail` →
      `({ session, routeParams, onClose, pluginContext })`. Reads
      `architectState`.
- [ ] F.7 New component
      `packages/flows-plugin/src/client/FlowYamlPreview.tsx`. Accepts
      content-view slot props. Reads `flowYamlPreview` from
      `useFlowsUiState` (or from `routeParams` if the YAML content is
      route-encoded). Renders the yaml preview that today lives in
      App.tsx as `flowYamlPreview` state.
- [ ] F.8 `FlowSummary` → `({ session, pluginContext })`. Reads
      `flowState`. Self-gates.
- [ ] F.9 New components: `FlowsListRoute`, `FlowsNewRoute`,
      `FlowsEditRoute`, `FlowsDeleteRoute`. Each accepts content-view
      props (`{ session, routeParams, onClose, pluginContext }`),
      renders the corresponding launcher/picker/dialog, calls
      `onClose` on dismiss. Wired to flow-management WS messages via
      `pluginContext.send()`.
- [ ] F.10 Replace local `formatTokens` / `formatDuration` in
      `FlowSummary.tsx` and `FlowAgentDetail.tsx` with
      `useUiPrimitive(UI_PRIMITIVE_KEYS.formatTokens)` and
      `useUiPrimitive(UI_PRIMITIVE_KEYS.formatDuration)` lookups.
- [ ] F.11 Update flows-plugin tests: wrap rendered components in
      `withUiPrimitiveProvider({...})` plus `<FlowsRootProvider>` (or
      a test-helper that does both). Confirm 41+ tests pass.

## Part G — flows-plugin: manifest claims

- [ ] G.1 Populate
      `packages/flows-plugin/package.json#pi-dashboard-plugin.claims`
      with all 12 entries (8 component claims + 4 command-route
      claims) per the proposal table. Remove the
      `//pi-dashboard-plugin-deferred-claims` field.
- [ ] G.2 Build clean: vite-plugin validates every component and
      route reference exists as a named export of the client entry.

## Part H — Shell deletions

After E + F + G land and slot consumers are rendering flows in
parallel with the still-present shell JSX, delete the shell wiring.

- [ ] H.1 Delete from `packages/shared/src/types.ts` four scalar
      fields on `DashboardSession`: `activeFlowName`,
      `flowAgentsDone`, `flowAgentsTotal`, `flowStatus`. Keep
      `FlowStatus` type definition (referenced by `FlowState`).
- [ ] H.2 Delete from
      `packages/server/src/event-status-extraction.ts` every flow-
      specific branch and field (lines 11-14, 92-107).
- [ ] H.3 Delete from `packages/client/src/lib/event-reducer.ts`:
      imports of `isFlowEvent` / `reduceFlowEvent` /
      `isArchitectEvent` / `reduceArchitectEvent`; `flowState` /
      `flowStates` / `architectState` fields on `SessionState`;
      dispatch branches.
- [ ] H.4 Delete from `packages/client/src/App.tsx` every flow JSX
      call site (3× FlowArchitect, 2× FlowDashboard, FlowAgentDetail,
      FlowArchitectDetail, 3× FlowLaunchDialog), every flow state
      variable, every flow-related callback (`openFlowYaml`,
      `toggleFlowAgentSource`), and every flow branch in
      `wrappedHandleSend`. Remove imports of `Flow*` from
      `flows-plugin/client`. ~270 LOC removed.
- [ ] H.5 Delete from `packages/client/src/components/SessionCard.tsx`
      imports of `FlowActivityBadge` and `SessionFlowActions`, and the
      three JSX call sites. ~20 LOC removed.
- [ ] H.6 Delete from
      `packages/client/src/components/SessionHeader.tsx` import of
      `FlowLaunchDialog` and the JSX. ~15 LOC removed.

## Part I — Lint and verification

- [ ] I.1 Add repo-lint
      `packages/shared/src/__tests__/no-flow-references-in-shell.test.ts`
      per the spec. Allow-list documented inline in test source.
- [ ] I.2 Self-test the lint: planted bad fixture flagged; allow-list
      cases not flagged.
- [ ] I.3 Run the lint: zero violations after H.1–H.6.
- [ ] I.4 Add `MobileShell.tsx` to `SCAN_FILES` in
      `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts`.
- [ ] I.5 Full build: `npm run build`. Clean.
- [ ] I.6 Full test suite: `npm test`. All passing. Pass count
      ≥ pre-change (4883).
- [ ] I.7 Manual smoke in `npm run dev`:
      - Spawn a session and run a flow. Badge appears on session card.
        FlowDashboard renders in content header. Click an agent → agent
        detail opens via content-view route. Back navigates correctly.
      - `/flows` slash command opens the picker. `/flows:new` opens
        the new-flow dialog. `/flows:edit` opens the edit picker.
        `/flows:delete` opens the delete picker.
      - Architect: spawn a session that triggers architect mode.
        `<FlowArchitect>` renders. Architect detail navigates and
        dismisses.
- [ ] I.8 Production smoke: `npm run build` + `pi-dashboard start`.
      Confirm no plugin-load errors in `~/.pi/dashboard/server.log`.

## Part J — Documentation and supersession

- [ ] J.1 Update `CHANGELOG.md ## [Unreleased] ### Added` with a
      paragraph: registry now exposes `useSessionEvents` for plugin-
      owned per-session state derivation; `PluginClaim` gains optional
      `route?` for content-view filtering; plugins MAY export
      `PluginRoot` for per-plugin React context; flows-plugin is the
      first end-to-end consumer with twelve manifest claims and zero
      flow references in the shell.
- [ ] J.2 Update `CHANGELOG.md ## [Unreleased] ### Removed` with a
      paragraph: four flow-specific fields (`activeFlowName`,
      `flowAgentsDone`, `flowAgentsTotal`, `flowStatus`) removed from
      `DashboardSession`. External consumers of `/api/sessions`
      receive `undefined` for these fields. Equivalent values are
      computed inside `flows-plugin` from event-derived state.
- [ ] J.3 Update `docs/plugin-ui-primitives.md` "Related changes"
      section with a pointer to this change as the worked example for
      "the dashboard knows zero about its plugins."
- [ ] J.4 Update AGENTS.md to reflect: flows-plugin is the canonical
      example of a fully plugin-ized dashboard concern; the same
      pattern applies to the next three extractions (openspec, git,
      subagents).
- [ ] J.5 Add SUPERSEDED banners to:
      - `openspec/changes/migrate-flows-content-slots/proposal.md`
      - `openspec/changes/migrate-flows-jsx-to-slots/proposal.md`
      - `openspec/changes/remove-flow-dialog-interceptors/proposal.md`
      Each banner cites this change as the supersession.
- [ ] J.6 Plan archive of all four superseded changes after this lands:
      - `complete-flows-plugin-migration` (already SUPERSEDED-marked)
      - `migrate-flows-content-slots`
      - `migrate-flows-jsx-to-slots`
      - `remove-flow-dialog-interceptors`
      Each gets `2026-MM-DD-<name>-superseded` archive prefix.
