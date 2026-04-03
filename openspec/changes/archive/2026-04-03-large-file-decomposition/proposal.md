## Why

Six source files have grown past 700 lines each, concentrating multiple responsibilities into single modules. `App.tsx` (1,259 lines) holds all app state, message handling, 20+ action callbacks, and three layout variants. `server.ts` (1,153 lines) mixes route definitions, event wiring, session bootstrap, and idle-timer logic. `browser-gateway.ts` (837 lines) handles every browser message type in one giant switch. This makes the codebase harder to navigate, test in isolation, and modify without risk of regressions.

## What Changes

- Extract custom hooks from `App.tsx` to separate state management, message handling, session actions, and content-view logic into focused units
- Extract layout components (`SessionDetailView`, `DesktopLayout`, `MobileLayout`) from `App.tsx` render tree
- Extract route groups from `server.ts` into per-domain route modules (session, git, file, system, openspec)
- Extract the `piGateway.onEvent` wiring from `server.ts` into a dedicated event-wiring module
- Extract session bootstrap and idle-timer logic from `server.ts`
- Extract browser message handlers from `browser-gateway.ts` into per-domain handler modules (subscription, session-actions, session-meta, terminal, directory)
- Extract session sync, model tracking, and flow/event wiring from `bridge.ts`
- Extract flow state machine from `event-reducer.ts` into a dedicated flow reducer
- Extract directory group rendering and pure grouping functions from `SessionList.tsx`

No public APIs or protocols change. No behavioral changes — this is a pure structural refactor.

## Capabilities

### New Capabilities
- `app-decomposition`: Extraction of App.tsx into hooks (useAppState, useMessageHandler, useSessionActions, useOpenSpecActions, useContentViews) and layout components (SessionDetailView, DesktopLayout, MobileLayout)
- `server-decomposition`: Extraction of server.ts into route modules (session-routes, git-routes, file-routes, system-routes, openspec-routes), event-wiring, session-bootstrap, and idle-timer modules
- `browser-gateway-decomposition`: Extraction of browser-gateway.ts message handlers into per-domain handler modules (subscription, session-actions, session-meta, terminal, directory)
- `bridge-decomposition`: Extraction of bridge.ts into session-sync, model-tracker, and event-wiring modules
- `event-reducer-decomposition`: Extraction of flow state machine from event-reducer.ts into a standalone flow-reducer module
- `session-list-decomposition`: Extraction of SessionList.tsx rendering into DirectoryGroupHeader, SessionListToolbar, and pure grouping utilities

### Modified Capabilities
_(none — no spec-level behavior changes, only internal structure)_

## Impact

- **Client code** (`src/client/`): App.tsx, SessionList.tsx, event-reducer.ts gain new sibling files; imports change but all exports remain the same
- **Server code** (`src/server/`): server.ts and browser-gateway.ts gain new sibling files; createServer and createBrowserGateway signatures stay the same
- **Extension code** (`src/extension/`): bridge.ts gains new sibling files; the default export and initBridge behavior are unchanged
- **Tests**: Existing tests should pass without modification since no behavior changes; new unit tests can target extracted modules individually
- **Build/packaging**: No dependency or config changes
