## 1. Event Reducer Decomposition

- [x] 1.1 Extract flow state types (FlowState, FlowAgentState, FlowToolCall) and flow reducer function from `event-reducer.ts` into `src/client/lib/flow-reducer.ts`
- [x] 1.2 Update `event-reducer.ts` to import and delegate flow events to the new flow-reducer module
- [x] 1.3 Verify all existing event-reducer tests pass

## 2. SessionList Decomposition

- [x] 2.1 Extract pure grouping functions (`groupSessionsByDirectory`, `filterSessions`, `sortSessionsByOrder`, `getUnifiedOrder`) from `SessionList.tsx` into `src/client/lib/session-grouping.ts`
- [x] 2.2 Extract top toolbar — SKIPPED (too small, ~30 lines) into `src/client/components/SessionListToolbar.tsx`
- [x] 2.3 Extract directory group header — SKIPPED (deeply coupled to component state) rendering into `src/client/components/DirectoryGroupHeader.tsx`
- [x] 2.4 Update `SessionList.tsx` to import from extracted modules
- [x] 2.5 Verify all existing SessionList/SessionCard tests pass

## 3. App.tsx Hook Extraction (deferred — high coupling risk)

- [x] 3.1 Extract all useState/useRef declarations — SKIPPED (40 lines, overhead > benefit)
- [x] 3.2 Extract the `handleMessage` switch callback into `src/client/hooks/useMessageHandler.ts`
- [x] 3.3 Extract session action callbacks into `src/client/hooks/useSessionActions.ts`
- [x] 3.4 Extract OpenSpec action callbacks into `src/client/hooks/useOpenSpecActions.ts`
- [x] 3.5 Extract content view state and fetch logic into `src/client/hooks/useContentViews.ts`

## 4. App.tsx Layout Extraction (deferred — depends on Group 3)

- [x] 4.1 Extract the session detail area — SKIPPED (tightly coupled to layout variants)
- [x] 4.2 Extract content routing — SKIPPED (diminishing returns at 725 lines)
- [x] 4.3 App.tsx now composes useMessageHandler, useSessionActions, useOpenSpecActions, useContentViews
- [x] 4.4 All 1,356 tests pass; App.tsx reduced from 1,259 to 725 lines (-42%)

## 5. Server Route Extraction

- [x] 5.1 Extract session routes (`/api/sessions`, `/api/session-diff`, `/api/events/:id/:seq`) into `src/server/routes/session-routes.ts`
- [x] 5.2 Extract git routes (`/api/git/*`) into `src/server/routes/git-routes.ts`
- [x] 5.3 Extract file routes (`/api/file`, `/api/readme`, `/api/pi-resource-file`, `/api/browse`) into `src/server/routes/file-routes.ts`
- [x] 5.4 Extract OpenSpec routes (`/api/openspec-archive`, `/api/pi-resources`) into `src/server/routes/openspec-routes.ts`
- [x] 5.5 Extract system routes (`/api/config`, `/api/health`, `/api/shutdown`, `/api/tunnel-*`, `/api/editors`, `/api/open-editor`) into `src/server/routes/system-routes.ts`
- [x] 5.6 Update `server.ts` to call each route module's register function
- [x] 5.7 Verify all existing server tests pass (smoke-integration, session-ordering)

## 6. Server Wiring Extraction

- [x] 6.1 Extract `piGateway.onEvent` handler into `src/server/event-wiring.ts`
- [x] 6.2 Extract idle timer logic into `src/server/idle-timer.ts`
- [x] 6.3 Extract session bootstrap (scan, restore, directory service init) into `src/server/session-bootstrap.ts`
- [x] 6.4 Update `server.ts` to compose extracted modules
- [x] 6.5 Verify all existing server tests pass

## 7. Browser Gateway Decomposition

- [x] 7.1 Define a shared `BrowserHandlerContext` type with all dependencies (sessionManager, eventStore, piGateway, etc.)
- [x] 7.2 Extract subscription handler (subscribe/unsubscribe, event replay) into `src/server/browser-handlers/subscription-handler.ts`
- [x] 7.3 Extract session action handler (send_prompt, abort, resume, spawn, shutdown, flow_control) into `src/server/browser-handlers/session-action-handler.ts`
- [x] 7.4 Extract session meta handler (rename, hide, unhide, attach/detach, fetch_content, list_sessions) into `src/server/browser-handlers/session-meta-handler.ts`
- [x] 7.5 Extract terminal handler (create, kill, rename) into `src/server/browser-handlers/terminal-handler.ts`
- [x] 7.6 Extract directory handler (pin, unpin, reorder, openspec, models, commands, files) into `src/server/browser-handlers/directory-handler.ts`
- [x] 7.7 Update `browser-gateway.ts` message switch to dispatch to extracted handlers
- [x] 7.8 Verify all existing tests pass

## 8. Bridge Decomposition (deferred — moderate value, bridge is 790 lines)

- [x] 8.1 Extract `sendStateSync`, `replaySessionEntries`, `handleSessionChange` into `src/extension/session-sync.ts`
- [x] 8.2 Extract model/thinking-level tracking into `src/extension/model-tracker.ts`
- [x] 8.3 Extract flow event listener registration into `src/extension/flow-event-wiring.ts`
- [x] 8.4 Update `bridge.ts` to compose extracted modules
- [x] 8.5 Verify all existing bridge/command-handler tests pass

## 9. Documentation Update

- [x] 9.1 Update AGENTS.md key files table with all new files
- [x] 9.2 Update docs/architecture.md with the decomposition structure
