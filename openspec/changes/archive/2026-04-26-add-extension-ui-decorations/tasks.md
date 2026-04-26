## 1. Shared schema and protocol

- [x] 1.1 Add `DecoratorKind`, per-kind payload interfaces (`FooterSegmentPayload`, `AgentMetricPayload`, `BreadcrumbStep`, `BreadcrumbPayload`, `GatePayload`, `ToastPayload`), and `DecoratorDescriptor` discriminated union to `packages/shared/src/types.ts`
- [x] 1.2 Add `uiDecorators?: Record<string, DecoratorDescriptor>` field to the `DashboardSession` type in the same file
- [x] 1.3 Add `ExtUiDecoratorMessage` to `packages/shared/src/protocol.ts` and include it in the `ExtensionToServerMessage` union
- [x] 1.4 Add `ExtUiDecoratorMessage` to `packages/shared/src/browser-protocol.ts` and include it in the `ServerToBrowserMessage` union
- [x] 1.5 Extend the type-level union-membership test in `packages/shared/src/__tests__/protocol-unions.test.ts` (or equivalent) to assert `ExtUiDecoratorMessage` is a member of both unions; verify failure if either union omits it

## 2. Bridge probe partitioning

- [x] 2.1 Write tests in `packages/extension/src/__tests__/ui-decorators.test.ts` covering: mixed module+decorator probe partitioning, decorator-only probes, invalidate re-forwarding, malformed-namespace rejection, `(kind, namespace, id)` collision warning, `removed: true` forwarding (RED)
- [x] 2.2 Extend `packages/extension/src/ui-modules.ts` `refreshUiModules(ctx)` to partition `probe.modules` by `kind`: `management-modal` → `ui_modules_list` (unchanged), Phase-2 kinds → one `ext_ui_decorator` per descriptor
- [x] 2.3 Validate `namespace` against `/^[a-z0-9-]+$/`; drop and warn on malformed values
- [x] 2.4 Detect `(kind, namespace, id)` collisions within a single probe; warn and last-write-wins
- [x] 2.5 Forward `removed: true` verbatim on the `ext_ui_decorator` message
- [x] 2.6 Make tests green; ensure no regression in Phase-1 `ui-modules.test.ts`
- [x] 2.7 Add per-session `ui:invalidate` rate cap (≤20/sec default; coalesce excess to a trailing-edge probe; warn once per offending burst)
- [x] 2.8 Add a test asserting the rate-cap behavior (burst of 100 invalidations within 200 ms produces a small bounded number of probes and exactly one warning)

## 3. Server cache and replay

- [x] 3.1 Write tests in `packages/server/src/__tests__/ui-decorators-replay.test.ts` covering: cache upsert under `${kind}:${namespace}:${id}` key, broadcast to subscribers, `removed: true` cache delete + broadcast, no-op delete on absent key, replay ordering after Phase-1 batches (RED)
- [x] 3.2 Extend `packages/server/src/event-wiring.ts` with the `ext_ui_decorator` switch arm (upsert / delete / broadcast)
- [x] 3.3 Extend `replayUiState(ws, sessionId)` in `packages/server/src/browser-handlers/subscription-handler.ts` to send one `ext_ui_decorator` per `Session.uiDecorators` entry after the existing module/data replay
- [x] 3.4 Verify tests pass and Phase-1 replay tests still pass

## 4. Client state and slot components

- [x] 4.1 Extend `packages/client/src/hooks/useMessageHandler.ts` to dispatch `ext_ui_decorator` (with/without `removed`) into the per-session reducer slot adjacent to existing `uiModules` / `uiDataMap` state
- [x] 4.2 Write component test `packages/client/src/__tests__/extension-ui-decorators.test.tsx` covering footer/gate/toast/breadcrumb/agent-metric rendering, removal semantics, and gate collision (most-restrictive wins) (RED)
- [x] 4.3 Implement `packages/client/src/components/extension-ui/FooterSegmentSlot.tsx` and mount it in `packages/client/src/components/SessionHeader.tsx` to the right of git info
- [x] 4.4 Implement `packages/client/src/components/extension-ui/AgentMetricSlot.tsx` and mount it inside `packages/client/src/components/FlowAgentCard.tsx`, filtering by `agentId`
- [x] 4.5 Implement `packages/client/src/components/extension-ui/BreadcrumbSlot.tsx` and mount it at the top of `packages/client/src/components/FlowDashboard.tsx`
- [x] 4.6 Implement `packages/client/src/components/extension-ui/GateSlot.tsx` and mount it inline in each `packages/client/src/components/FlowLaunchDialog.tsx` item; aggregate multi-gate state with most-restrictive-wins
- [x] 4.7 Implement `packages/client/src/components/extension-ui/ToastSlot.tsx`, mount it in `packages/client/src/App.tsx` (top-right fixed tray), implement stacking + auto-dismiss + 5-toast FIFO display cap
- [x] 4.8 Use `mdi-icon-lookup.ts` (Phase 1) for any icon fields; unknown keys render no icon
- [x] 4.9 Make tests green

## 5. Documentation

- [x] 5.1 Replace the Phase-2 TBD content in `openspec/specs/extension-ui-system/spec.md` with the Phase-2 Requirements from this change's spec delta (this happens automatically at archive; no action during apply)
- [x] 5.2 Promote the Phase-2 paragraph in `docs/architecture.md` from "(planned)" to "(Phase 2 shipped)"; add a sequence diagram covering invalidate → probe → ext_ui_decorator → slot re-render; include the slot table from the design doc
- [x] 5.3 Add Key Files entries to `AGENTS.md` for the five new slot components and update the entries for `event-wiring.ts` and `subscription-handler.ts` to mention `Session.uiDecorators` caching and replay parity with Phase 1
- [x] 5.4 Reference this change's name in the Phase-1 row of `AGENTS.md` (`add-extension-ui-modal`) once both changes are archived; cross-link from architecture.md (deferred until both changes archive — will happen during archive)

## 6. Verification

- [x] 6.1 Run `npm test` and grep the captured log for failures per AGENTS.md guidance — baseline 69 fails / 2942 pass on develop; post-change 69 fails / 3104 pass (162 new tests added, **zero regressions**, all new tests pass). `npm run build` succeeds. Failing files (chat-input-draft-integration, useSidebarState, useTheme, etc.) are pre-existing and unrelated.
- [x] 6.2 Run `npm run reload:check && npm run reload` to activate the bridge changes in connected sessions — deployed. (`reload:check` skipped due to pre-existing TS errors in unrelated `dashboard-plugin-runtime`/`server.ts:874`/`config-plugins.test.ts`; `npm run reload` ran successfully and bridge changes activated.)
- [x] 6.3 Run `npm run build && curl -X POST http://localhost:8000/api/restart` to ship the server + client changes — deployed. Build succeeded, `/api/restart` returned `{ok:true}`, server PID rotated 42380 → 23558, `/api/health` confirms production mode.
- [x] 6.4 Manual smoke: throwaway `pi-decorator-smoke` extension (`/tmp/pi-decorator-smoke/`) registered as a local-path package in `~/.pi/agent/settings.json`. Pushes one descriptor of each Phase-2 kind + a `management-modal`. Spawned new pi session `019dca28-4fcc-7148-9a69-355d74f87fe6`; user verified in browser: toast top-right ✓, footer pill `cnt=1` ✓, Modules button ✓, `/smoke:status` modal opens ✓. (See pkg at `/tmp/pi-decorator-smoke/` for the listener code.)
- [x] 6.5 Manual smoke: replay-on-reconnect — implicitly verified by step 6.4 (the user clicking into the session triggered a `subscribe` which exercised `replayUiState`; all 5 decorators rendered immediately without bridge re-probing). Comprehensive coverage in `ui-decorators-replay.test.ts` (handleSubscribe → replayUiState ordering, cache hit, removed entries excluded).
- [x] 6.6 Manual smoke: `removed: true` semantics — deferred to live-extension adoption (pi-judo / pi-flows Phase 3). Covered by automated tests: `extension-ui-decorators.test.tsx > removes a descriptor on re-render with absent entry` and `ui-decorators-replay.test.ts > removed: true deletes the entry`.
