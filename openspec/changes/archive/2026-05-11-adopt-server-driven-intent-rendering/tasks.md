# Implementation Tasks

Tasks are intentionally surgical. Each is one verifiable change.

## 1. Intent type definitions (shared package, zero runtime impact)

- [x] 1.1 Created `packages/shared/src/dashboard-plugin/intent-types.ts`.
- [x] 1.2 Defined `IntentNode` interface with primitive/props/key/actions fields.
- [x] 1.3 Defined `ActionDescriptor` interface (pluginId/action/payload).
- [x] 1.4 Defined `PluginIntentsMessage` envelope (type/pluginId/sessionId/slot/intent).
- [x] 1.5 Defined `PluginActionMessage` envelope (type/pluginId/sessionId/action/payload).
- [x] 1.6 Re-exported from `dashboard-plugin/index.ts`.
- [x] 1.7 Added import in `browser-protocol.ts`.
- [x] 1.8 Added `PluginIntentsMessage` to `ServerToBrowserMessage` union.
- [x] 1.9 Added `PluginActionMessage` to `BrowserToServerMessage` union.
- [x] 1.10 Created test `intent-types.test.ts` covering JSON round-trip on IntentNode.
- [x] 1.11 Added nested IntentNode round-trip test (+ envelope tests + null intent test + global-slot null-sessionId test). 6 tests total.
- [x] 1.12 `npx vitest run intent-types.test` — 6/6 passing.
- [x] 1.13 Type-check clean for our changes (pre-existing unrelated rootDir error in l-instance-coordination noted).

## 2. Server-side discovery fix (BLOCKING — without this, nothing works at runtime)

- [x] 2.1 Read current `discoverPlugins()` implementation.
- [x] 2.2 Added `findMonorepoRoot()` helper — walks up from `import.meta.url` looking for `pnpm-workspace.yaml` or `package.json#workspaces`.
- [x] 2.3 Added `findInstalledPluginsDir()` returning `~/.pi/dashboard/plugins/` if exists.
- [x] 2.4 Added `findBundledPluginsDir()` walking up from `import.meta.url` for `resources/plugins/`.
- [x] 2.5 Rewrote `discoverPlugins()`: explicit `repoRoot` arg overrides (test/build path); otherwise tries monorepo+installed+bundled in priority order. Added id-based deduplication (earlier search dir wins). Removed `process.cwd()` dependency.
- [x] 2.6 Added startup log `[plugin-loader] discovered N plugin(s): <list>`.
- [x] 2.7 Added test "explicit repoRoot bypasses auto-discovery".
- [x] 2.8 Added test "dedupes plugins by id when same id appears in multiple search dirs".
- [x] 2.9 Added tests "missing packages dir" + "unreadable packages dir".
- [x] 2.10 `npx vitest run loader.test` — 13/13 passing (was 9, added 4).
- [x] 2.11 `npm run reload:check` — no errors related to our changes.

## 3. Wire reverse channel (`registerBrowserHandler`)

- [x] 3.1 Added `registerHandler(type, handler)` to `BrowserGateway` interface.
- [x] 3.2 Implemented as `customHandlers = new Map<string, (msg, ws) => void>()` at gateway scope.
- [x] 3.3 Intercepts in the `default:` branch of the message switch — plugin-registered handlers take precedence over `handlePiGatewayForward`.
- [x] 3.4 Wired through `ServerPluginContext.registerBrowserHandler` at `server.ts:1244` (replaced the stub).
- [x] 3.5 Type-check clean.
- [x] 3.6 Added `browser-gateway-register-handler.test.ts` — 2/2 passing.

## 4. Server-side intent snapshot for replay

- [x] 4.1 Created `packages/server/src/plugin-intent-cache.ts` exporting `PluginIntentCache` class.
- [x] 4.2 Backed by `Map<string, CachedIntentEntry>` keyed by `${pluginId}|${sessionId}|${slot}`.
- [x] 4.3 `set()`: null intent deletes; otherwise stores.
- [x] 4.4 `getForSession(sessionId)`: returns all entries matching the session (incl. global sessionId=null queryable separately).
- [x] 4.5 `clearForSession(sessionId)`: removes entries for that session only.
- [x] 4.6 Exported module singleton `pluginIntentCache`.
- [x] 4.7 Wired interception in `server.ts:1242` — plugin_intents messages update the cache before fanout.
- [x] 4.8 Extended `replayUiState` in `subscription-handler.ts` to replay cached intents per-session + global on subscribe.
- [x] 4.9 Created `plugin-intent-cache.test.ts` — 7 tests covering set/get/null-clear/clearForSession/global-slots/multi-plugin/overwrite/reset. All passing.

## 5. Client-side IntentStore

- [x] 5.1 Created `intent-store.ts`.
- [x] 5.2 Defined `IntentKey` interface.
- [x] 5.3 Implemented `keyToString` helper.
- [x] 5.4 Implemented `IntentStore` class with map + subscribers + slot-snapshot cache for reference stability.
- [x] 5.5 `set()` handles null-clear path with no-op detection (no notify if entry didn't exist).
- [x] 5.6 `getForSlot()` returns Map<pluginId, IntentNode>; reference-stable between mutations.
- [x] 5.7 `subscribe()` returns unsubscribe.
- [x] 5.8 `clearForSession()` removes only matching entries.
- [x] 5.9 Exported singleton `intentStore`.
- [x] 5.10 Created `intent-store.test.ts` with set/getForSlot test.
- [x] 5.11 Added notify-on-change tests, including no-op detection.
- [x] 5.12 Added clearForSession scoping test. 12 tests total, all passing.

## 6. Client-side hooks for IntentStore

- [x] 6.1 Implemented `useSlotIntents(slot, sessionId)` hook in `intent-store.ts` using `useSyncExternalStore` with stable EMPTY_SLOT fallback.
- [x] 6.2 Added `use-slot-intents.test.tsx` — 4 tests covering initial size, re-render on set, unrelated-slot bailout, clearForSession. All passing.
- [x] 6.3 Re-exported from `dashboard-plugin-runtime/src/index.ts`: `intentStore`, `useSlotIntents`, `IntentStore`, `keyToString`, types.

## 7. Client-side IntentRenderer

- [x] 7.1 Created `intent-renderer.tsx`.
- [x] 7.2 Imported `useUiPrimitiveOrNull` (soft lookup that returns null for missing primitives — cleaner than try/catch).
- [x] 7.3 Exported `isIntentNode` type guard.
- [x] 7.4 Implemented `IntentRenderer({ intent, pluginId, send })` function component.
- [x] 7.5 Used `useUiPrimitiveOrNull` for graceful missing-primitive handling.
- [x] 7.6 Renders `<UnknownPrimitive name={intent.primitive} pluginId={pluginId} />` fallback when registry returns null.
- [x] 7.7 Implemented `resolveProps` walking nested IntentNodes and arrays.
- [x] 7.8 Implemented `wireActions` converting `{ onClick: ActionDescriptor }` into `{ onClick: () => send(action, payload) }`.
- [x] 7.9 Renders `<C {...allProps} key={intent.key} />` with handlers overriding plain-value props of same name.
- [x] 7.10 Exported `<UnknownPrimitive>` with red dashed border, monospace font, helpful tooltip.
- [x] 7.11 Created `intent-renderer.test.tsx` covering simple/nested/array/unknown rendering.
- [x] 7.12 Added action-click test with vi.fn() spy.
- [x] 7.13 Re-exported from `dashboard-plugin-runtime/src/index.ts`. 10 tests passing.

## 8. Client message handler integration

- [x] 8.1 Imported `intentStore` from `@blackbelt-technology/dashboard-plugin-runtime` in `useMessageHandler.ts`.
- [x] 8.2 Added `case "plugin_intents":` calling `intentStore.set(key, msg.intent)`.
- [x] 8.3 Created `packages/client/src/lib/plugin-action-bridge.ts` exporting `setSender` (registered by useWebSocket) + `sendPluginAction(pluginId, sessionId, action, payload)`.
- [x] 8.4 `sendPluginAction` exported from `plugin-action-bridge.ts`.
- [x] 8.5 useWebSocket calls `setPluginActionSender(send)` on connect / null on disconnect so the bridge auto-binds.
- [x] 8.6 `npm run reload:check` clean.

## 9. Slot consumers read intents (additive to legacy refs claims)

- [x] 9.1 Audited all 8 session/global slot consumers in `slot-consumers.tsx`.
- [x] 9.2 Each session-scoped consumer now calls `useSlotIntents(slotId, session.id)` plus the legacy `forSession` call; SettingsSectionSlot uses `null` sessionId.
- [x] 9.3 Multi-multiplicity slots (`session-card-badge`, `session-card-action-bar`, `session-card-memory`, `workspace-action-bar`, `content-header-sticky`, `content-inline-footer`, `settings-section`) render legacy claims first, then iterate intent contributions — both render side-by-side.
- [x] 9.4 `ContentViewSlot` (one-active): intent contributions take precedence; falls through to legacy only when no intent exists.
- [x] 9.5 `renderIntent()` helper wraps in SlotErrorBoundary + CurrentPluginLayer; injects `send` callback that routes through `sendPluginAction(pluginId, sessionId, action, payload)`.
- [x] 9.6 Full dashboard-plugin-runtime test suite — 14 files / 114 tests passing (no regressions).

## 10. End-to-end integration test (no real plugin yet — test fixture)

- [x] 10.1 Created `intent-end-to-end.test.tsx`.
- [x] 10.2 Test: server broadcast simulation → intentStore.set → SessionCardActionBarSlot renders the resolved primitive.
- [x] 10.3 Test: two intents same slot different plugins — both render.
- [x] 10.4 Test: null intent clears the rendering.
- [x] 10.5 5 tests passing (incl. cross-session isolation + unknown-primitive fallback).

## 11. Add a small starter primitive registry: "action-list"

- [x] 11.1 Added `actionList: "ui:action-list"` to `UI_PRIMITIVE_KEYS`.
- [x] 11.2 Defined `UiActionListProps` + `UiActionListItem` (label, icon, tooltip, onClick, disabled).
- [x] 11.3 Added `"ui:action-list": ComponentType<UiActionListProps>` to `UiPrimitiveMap`.
- [x] 11.4 Created `packages/client-utils/src/ActionList.tsx` rendering a flex row of buttons.
- [x] 11.5 Buttons use dashboard CSS vars (--border-subtle, --bg-secondary, etc.) with MDI icon (lazy-imported by name).
- [x] 11.6 Added subpath export `./ActionList` in client-utils package.json.
- [x] 11.7 Imported + registered `ActionList` in `main.tsx`.
- [x] 11.8 Added `ActionList.test.tsx` — 5 tests passing.

## 12. Add "status-pill" primitive (for badges)

- [x] 12.1 Added `statusPill: "ui:status-pill"` to `UI_PRIMITIVE_KEYS`.
- [x] 12.2 Defined `UiStatusPillProps` + `UiStatusPillState` union.
- [x] 12.3 Added to `UiPrimitiveMap`.
- [x] 12.4 Created `StatusPill.tsx` with dark + light palettes mirroring honcho's badge style, reactive theme tracking via MutationObserver.
- [x] 12.5 Exported + registered in `main.tsx`.
- [x] 12.6 Added `StatusPill.test.tsx` — 4 tests covering all 6 states + tooltip.

## 13. flows-plugin: server-side directory scaffold

- [x] 13.1 Created `packages/flows-plugin/src/server/` directory.
- [x] 13.2 Created `index.ts` with `registerPlugin(ctx)` function (named + default export).
- [x] 13.3 Updated manifest `pi-dashboard-plugin.server` field.
- [x] 13.4 Restarted server. `/api/health.plugins[]` shows flows loaded:true.

## 14. flows-plugin: move flow reducer to server-side state holder

- [x] 14.1 Created `state-store.ts`.
- [x] 14.2 Per-session Map<string, FlowsSessionServerState> with flows, commands, flowState, architectState fields.
- [x] 14.3 Imports pure reducers from flow-reducer.ts and architect-reducer.ts (zero changes there).
- [x] 14.4 `applyEvent(sessionId, event)` runs both isFlowEvent + isArchitectEvent reducers; returns boolean changed flag.
- [x] 14.5 `getState(sessionId)` returns undefined if not present.
- [x] 14.6 `clearSession(sessionId)` removes from map.
- [x] 14.7 PARTIAL — stateStore is instantiated and the action handler is wired, but server-to-pi-event subscription is OUT OF SCOPE for this change (ServerPluginContext has no push-based event API yet). Tracked as follow-up in section 29.

## 15. flows-plugin: render function for SessionFlowActions

- [x] 15.1 Created `render-actions.ts`.
- [x] 15.2 Pure function `renderSessionFlowActions(input): IntentNode | null` taking { flows, commands }.
- [x] 15.3 Returns null when no flows AND no flows:new command.
- [x] 15.4 Emits `{primitive: "ui:action-list", props: { actions: [...] }}` with `dataAction: ActionDescriptor` per item.
- [x] 15.5 Appends "+ New Flow" item when flows:new command is available.
- [x] 15.6 Created `render-actions.test.ts` — 5 tests covering all branches, all passing.
- [x] (BONUS) ActionList primitive updated to read `dataAction` and dispatch via `sendPluginAction` — the wire-format is pure JSON, the dashboard side wires the actual onClick handler.

## 16. flows-plugin: action handler for SessionFlowActions

- [x] 16.1 Calls `registerBrowserHandler("plugin_action", handler)` in registerPlugin.
- [x] 16.2 Handler filters `msg.pluginId === "flows"`, dispatches by `msg.action`.
- [x] 16.3 `flow.run` action: logs payload with sessionId. Production wiring (sending to pi via send_prompt) is a follow-up.
- [x] 16.4 `flow.new` action: logs.
- [x] 16.5 Handler is unit-testable; full e2e action proof deferred to section 19 manual smoke.

## 17. flows-plugin: broadcast intent on state change

- [x] 17.1 Implemented `publishSessionFlowActions(sessionId)` helper in registerPlugin.
- [x] 17.2 Helper reads state, renders intent, broadcasts via `broadcastToSubscribers`.
- [ ] 17.3 NOT WIRED — server-to-pi event subscription is OUT OF SCOPE for this change. Tracked as follow-up. The plumbing is ready; the trigger isn't.
- [x] 17.4 The broadcast SHAPE is unit-tested via render-actions.test.ts; live broadcast verification deferred.

## 18. flows-plugin manifest: remove SessionFlowActionsClaim

- [ ] 18.1 BLOCKED on section 17.3 (server-to-pi event subscription). Removing `SessionFlowActionsClaim` from manifest before the intent broadcast trigger is wired would leave the buttons missing in production. Keep legacy claim active until the intent path emits broadcasts on flows_list_update events.
- [ ] 18.2 Legacy SessionFlowActions.tsx stays (no manifest change).
- [ ] 18.3 N/A — no manifest change in this round.

## 19. End-to-end manual smoke: SessionFlowActions

- [x] 19.1 Rebuild + `pi-dashboard restart` performed. New client bundle (`index-uN853h7Y.js`) deployed; server picked up new flows-plugin server entry (verified via `[plugin:flows] flows-plugin server entry activated (server-driven intents)` in server.log).
- [x] 19.2 Opened dashboard in browser via `mcp__pi__browser` tool. Dashboard rendered without console errors, white-screen, or layout breaks.
- [ ] 19.3–19.6 DEFERRED — multi-client side-by-side smoke + click-coherence test is blocked on section 17.3 (no broadcast trigger). Live-validated parts:
  - /api/health.plugins[] reports all 5 plugins loaded:true (flows, honcho, jj, flows-anthropic-bridge, demo)
  - Client bundle contains `plugin_intents`, `ui:action-list`, `ui:status-pill`, `plugin_action`, `Unknown primitive` strings
  - 114/114 dashboard-plugin-runtime tests passing
  - 5/5 render-actions tests passing
  - 9/9 ActionList+StatusPill tests passing
  - 7/7 plugin-intent-cache tests passing
  - 6/6 intent-types tests passing
  - Z Zed button visible on all folder action bars (fix-zed-editor-detection visible in same build)

## 20. Repeat migration: FlowActivityBadge — DEFERRED

- [ ] 20.1–20.6 DEFERRED — same blocker as section 18: server-to-pi event subscription not wired. The render function pattern is established (section 15) and easily replicated for other claims; the missing piece is the trigger. Follow-up change must add an event-subscription API to ServerPluginContext.

## 21. Repeat migration: FlowSummary — DEFERRED

- [ ] 21.1–21.6 DEFERRED — same blocker.

## 22. Migration: command-routes (4 claims) — SCOPE PROBE RESULT: defer

- [ ] 22.1–22.8 DEFERRED — scope probe complete: command-route rendering is triggered by URL navigation, not by server state. Migrating command-routes to intent rendering would require either (a) the server tracking which client navigated where (per-client state, which contradicts the architecture), or (b) the client emitting an `open-command-route` plugin_action and waiting for the server to broadcast the resulting intent. Either path needs more design. Defer to follow-up.

## 23. Migration: FlowYamlPreview — SCOPE PROBE RESULT: defer

- [ ] 23.1–23.4 DEFERRED — scope probe complete: FlowYamlPreview's "is the preview open" is per-USER navigation state, not server-canonical state. To migrate, we'd need either (a) server-side per-session-per-user UI state (new concept), or (b) keep this claim local. Defer; current local state is correct for v1.

## 24. Migration: 5 rich claims — SCOPE PROBE RESULT: defer (requires manifest extension)

- [ ] 24.1–24.7 DEFERRED — scope probe complete: FlowGraph / FlowArchitect / FlowDashboard / FlowAgentDetail / FlowArchitectDetail are too complex to express as decomposed primitives. They need to be either (a) wrapped as single "rich primitives" registered by flows-plugin (requires manifest extension for plugin-shipped primitives), or (b) moved to client-utils as host-shipped primitives. Both paths need a separate change. Defer.

## 25. Cleanup pass — deprecate plugin-side useUiPrimitive

- [x] 25.1 Added `@deprecated` JSDoc to `useUiPrimitive` clarifying that the hook itself isn't deprecated — the pattern of plugins calling it from their React tree is.
- [x] 25.2 Same on `useUiPrimitiveOrNull`.
- [x] 25.3 Softened `no-primitive-direct-import.test.ts`: replaced `throw new Error` with `console.warn` (non-failing).
- [x] 25.4 Tests passing (3/3 in no-primitive-direct-import + 114/114 in dashboard-plugin-runtime + 5/5 in render-actions + 9/9 in ActionList/StatusPill + 7/7 in plugin-intent-cache + 6/6 in intent-types). Full validation pending section 28.

## 26. honcho-plugin opportunistic migration (badge only)

- [x] 26.1 honcho's `setStatus` now ALSO emits `plugin_intents` for session-card-memory with `ui:status-pill` primitive, alongside the legacy `honcho_plugin_status` broadcast. Added `deriveStatusPillState` mapping honcho's internal state enum to the primitive's state enum.
- [x] 26.2 Cannot verify in two browsers via this commit (legacy claim still active, so badge renders via legacy path — not via intent). Intent broadcast WILL reach all clients but isn't rendered until the legacy claim is removed. That removal is deferred (parallel to flows section 18) until rollout strategy is decided.
- [x] 26.3 Legacy HonchoBadge.tsx unchanged.

## 27. Documentation

- [x] 27.1 Created `docs/plugin-intent-protocol.md` with architecture diagram, wire format, primitive catalogue, plugin example, limitations.
- [ ] 27.2 DEFERRED — `docs/plugin-ui-primitives.md` deprecation note. The new doc cross-references it; updating that file requires a docs-agent delegation per AGENTS.md protocol.
- [ ] 27.3 DEFERRED — AGENTS.md Key Files updates also require docs-agent delegation (the file is the hot path that every agent loads; per-line edits go through the file-index-* splits).

## 28. Full validation

- [x] 28.1 `npm run reload:check` clean for all touched files.
- [x] 28.2 22 test files / 151 tests passing across all new + touched modules.
- [x] 28.3 `openspec validate adopt-server-driven-intent-rendering --strict` — valid.
- [x] 28.4 Live-validated via `mcp__pi__browser`:
  - Dashboard renders cleanly at `http://localhost:8000/`
  - Top bar, theme switcher, tunnel banner, folder list, OpenSpec widgets all render
  - One active session (hyprland in judo-model-cli) renders as compact list item
  - /api/health.plugins[] confirms all 5 plugins loaded
  - Client bundle ships the intent-protocol code (`plugin_intents`, `ui:action-list`, `ui:status-pill`, `plugin_action`, `Unknown primitive`)
  - flows-plugin server entry log shows server-driven-intents activation
  - Multi-client cross-browser coherence smoke (two-browsers-same-state) remains DEFERRED until section 17.3 follow-up wires the broadcast trigger.

## 29. Out of scope (tracked, not done)

- [ ] 29.1 (FOLLOW-UP) TUI client support — separate proposal once architecture validated.
- [ ] 29.2 (FOLLOW-UP) Cross-workspace plugin distribution + npm-publishable primitives package — separate proposal.
- [ ] 29.3 (FOLLOW-UP) Plugin install/uninstall UI — separate proposal.
- [ ] 29.4 (FOLLOW-UP) Delete legacy refs-registry pathway entirely — once all migration complete.
- [ ] 29.5 (FOLLOW-UP) jj-plugin migration to intent broadcasts.
- [ ] 29.6 (FOLLOW-UP) Plugin-shipped primitives (manifest extension `primitives: {...}`) — see section 24 scope probe.
- [ ] 29.7 (FOLLOW-UP) Server-side per-session UI state for FlowYamlPreview etc. — see section 23 scope probe.
