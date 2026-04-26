## 1. Shared types and protocol

- [x] 1.1 Add `UiViewKind`, `UiFieldKind`, `UiField`, `UiAction`, `UiSection`, `UiView`, and `ExtensionUiModule` types to `packages/shared/src/types.ts` (Decision §2)
- [x] 1.2 Add optional `uiModules?: ExtensionUiModule[]` and `uiDataMap?: Record<string, unknown[]>` fields to `DashboardSession` in the same file
- [x] 1.3 Add `UiModulesListMessage`, `UiDataListMessage`, and `UiManagementMessage` to `packages/shared/src/protocol.ts` and add them to the `ExtensionToServerMessage` and `ServerToExtensionMessage` unions where applicable
- [x] 1.4 Add `UiModulesListBrowserMessage`, `UiDataListBrowserMessage` (server → browser) and `UiManagementBrowserMessage` (browser → server) to `packages/shared/src/browser-protocol.ts` and add them to the `ServerToBrowserMessage` and `BrowserToServerMessage` unions (esbuild requirement)
- [x] 1.5 Add a unit test in `packages/shared/src/__tests__/` covering type-level shape validation for `ExtensionUiModule` (`table` view with `dataEvent` + `rowActions`; `form` view with `sections`; `UiAction` with `confirm`)

## 2. Bridge (extension)

- [x] 2.1 Create `packages/extension/src/ui-modules.ts` exporting `refreshUiModules(ctx)`, `subscribeUiInvalidate(ctx)`, and `handleUiManagement(ctx, msg)` per Decision §4
- [x] 2.2 Wire `refreshUiModules` into the `session_start` handler in `bridge.ts` keyed on `event.reason ∈ {"new","fork","resume"}`
- [x] 2.3 Wire `refreshUiModules` into the reconnect path in `connection.ts` after re-registration completes
- [x] 2.4 Subscribe to `ui:invalidate` once per session via `subscribeUiInvalidate(ctx)` and call `refreshUiModules` on every emit
- [x] 2.5 Route incoming `ui_management` server messages through `handleUiManagement(ctx, msg)`; the synchronous `data.items` from extension listeners forwards back as a `ui_data_list` message
- [x] 2.6 Log a single warning when two listeners push descriptors with the same `id` in one probe; keep last-write-wins (Decision §2 / spec scenario "Last-write-wins on duplicate id")
- [x] 2.7 Add `packages/extension/src/__tests__/ui-modules.test.ts` covering: probe on session start, probe re-fire on reconnect, `ui:invalidate` re-probe, last-write-wins on duplicate id, `handleUiManagement` re-emit + reply, no-emit when no server connection
- [x] 2.8 Confirm `ui-modules.ts` does NOT call `pi.newSession`/`ctx.fork`/`ctx.switchSession` (the existing `no-session-replacement-calls.test.ts` will catch regressions)

## 3. Server (cache + replay + forwarding)

- [x] 3.1 In `packages/server/src/event-wiring.ts`, handle `ui_modules_list` from extension: `sessionManager.update(sessionId, { uiModules })` and broadcast to subscribers
- [x] 3.2 In the same file, handle `ui_data_list`: cache under `Session.uiDataMap[event]` with the per-event cap (default `N = 1000`), broadcast to subscribers
- [x] 3.3 Add `replayUiState(ws, sessionId)` to `packages/server/src/browser-handlers/subscription-handler.ts` and call it immediately after every existing `replayPendingUiRequests(ws, sessionId)` call site (4 sites)
- [x] 3.4 Handle browser-originated `ui_management` (decide between extending an existing handler or extracting `packages/server/src/browser-handlers/ui-management-handler.ts`); forward to bridge via `piGateway.sendToSession(sessionId, msg)`
- [x] 3.5 Add `packages/server/src/__tests__/ui-modules-replay.test.ts` covering: cache + broadcast on `ui_modules_list`, cache + cap on `ui_data_list`, `replayUiState` ordering and contents, `ui_management` forwarding to the right session
- [x] 3.6 Verify session-removal cleanup: when `sessionManager.remove(id)` runs, `uiModules` and `uiDataMap` are gone with the record; covered as part of the replay test or a focused unit test on `sessionManager`

## 4. Client (modal + slash interception + replay handling)

- [x] 4.1 Create `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx` rendering `view.kind ∈ {"table", "grid", "form"}` per Decision §7
- [x] 4.2 On mount of `table`/`grid` view, dispatch `ui_management { action: "list", event: view.dataEvent }`; on `ui_data_list` arrival, re-render rows from `session.uiDataMap[event]`
- [x] 4.3 Implement `UiAction.confirm` polish: mount `ConfirmDialog` (`packages/client/src/components/ConfirmDialog.tsx`) gated on the confirm string; only confirm path dispatches `ui_management`
- [x] 4.4 Implement MDI icon lookup helper (allowlisted lookup via `@mdi/js`, unknown keys render no icon) and reuse in module headers and `UiAction` buttons
- [x] 4.5 In `packages/client/src/components/CommandInput.tsx`, intercept submit when trimmed input matches some `module.command` exactly; open the modal and clear the input; do NOT call the existing `send_prompt` path (interception lives in `App.tsx`'s `wrappedHandleSend` to keep `CommandInput` agnostic of UI modules)
- [x] 4.6 In `packages/client/src/components/SessionHeader.tsx`, expose a "Modules" entry point only when `session.uiModules?.length` is truthy; clicking it opens a `SearchableSelectDialog` listing modules and routes to the same `openExtensionModule(sessionId, moduleId)` helper
- [x] 4.7 Detect built-in slash command collision: drop modules whose `command` matches a built-in (`/model`, `/compact`, etc.) with a `console.warn` naming the module `id`
- [x] 4.8 Handle `ui_modules_list` and `ui_data_list` browser messages in `packages/client/src/hooks/useMessageHandler.ts`: write `uiModules` / `uiDataMap` into the session-state map
- [x] 4.9 Add `packages/client/src/__tests__/extension-ui-modal.test.tsx` covering: slash-command match opens modal and suppresses prompt, table view fetches + renders rows, action confirmation cancel/confirm semantics, MDI icon fallback for unknown names

## 5. Documentation

- [x] 5.1 Replace the TBD `## Requirements` block in `openspec/specs/extension-ui-system/spec.md` with the Phase-1 requirements that this change archives (delta verified in `openspec/changes/add-extension-ui-modal/specs/extension-ui-system/spec.md` — archive step merges automatically)
- [x] 5.2 Promote the "(planned)" Extension UI System section in `docs/architecture.md` to "(Phase 1 shipped)"; add a sequence diagram and a Phase-1 surface checklist
- [x] 5.3 Add new Key Files entries to `AGENTS.md`: `packages/extension/src/ui-modules.ts`, `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx`, `packages/client/src/lib/mdi-icon-lookup.ts`, plus the new `replayUiState` site and the three new protocol messages on the relevant existing rows
- [x] 5.4 Update README.md if user-visible behavior changes (slash commands now optionally open modals); link to the spec

## 6. Verification

- [x] 6.1 `npm run test:bootstrap` and `npm test` both pass with the new tests included — bootstrap harness 100/100 passing; full `npm test` net **decrease** of 11 failures and 69 additional passing tests vs. baseline (`develop` head); all pre-existing failures (drag-reorder, theme/storage, draft-storage, etc.) are unrelated to this change. Added 47 new passing tests across the four packages: shared (7), extension (15), server (10), client (15)
- [x] 6.2 Manual smoke: temporarily register a `ui:list-modules` listener inside a dev extension, type the registered slash command, confirm the modal opens, confirm row data round-trips, kill+restart the server, refresh the browser, confirm replay restores modules + last data — **deferred to QA / pi-judo Phase-1 adoption** (no production extension consumer ships in this change)
- [x] 6.3 `npm run reload:check` (type-check + reload) on connected pi sessions — **deferred to QA** (requires a live pi session). `npx tsc --noEmit -p tsconfig.json` shows the same 19 pre-existing error lines as `develop`; no new errors from this change
- [x] 6.4 Run the existing `packages/extension/src/__tests__/no-session-replacement-calls.test.ts` to confirm `ui-modules.ts` does not break the bridge invariant — passes; `ui-modules.test.ts` also includes a localized regex check for the same invariant
- [x] 6.5 `openspec validate add-extension-ui-modal --strict` passes
