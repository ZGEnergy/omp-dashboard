## Context

Six source files have grown past 700 lines each, mixing multiple responsibilities. The largest — `App.tsx` (1,259 lines) and `server.ts` (1,153 lines) — are difficult to navigate, test in isolation, and modify safely. This refactor is purely structural: extract cohesive units into separate files without changing any behavior or public APIs.

Current state of the six files:

| File | Lines | Core problem |
|------|-------|-------------|
| `src/client/App.tsx` | 1,259 | 20+ useState, giant message handler switch, 15+ action callbacks, 3 layout variants in one render |
| `src/server/server.ts` | 1,153 | 25+ route definitions, 250-line event wiring callback, session bootstrap, idle timer |
| `src/server/browser-gateway.ts` | 837 | 30+ case message handler in one switch |
| `src/extension/bridge.ts` | 790 | Session sync, model tracking, event wiring, flow wiring all interleaved |
| `src/client/lib/event-reducer.ts` | 700 | Main reducer + flow state machine + interactive UI state in one file |
| `src/client/components/SessionList.tsx` | 663 | Group rendering, toolbar, pure grouping functions, drag-and-drop all together |

## Goals / Non-Goals

**Goals:**
- Each extracted module has a single, clear responsibility
- Existing tests pass without modification
- No behavioral changes — identical runtime behavior before and after
- Files stay under ~300 lines after extraction
- Extracted modules are independently testable

**Non-Goals:**
- Changing any public API, protocol, or message format
- Adding new features or capabilities
- Refactoring internal logic (just moving code to new homes)
- Modifying test files (they should just pass as-is)
- Optimizing performance

## Decisions

### 1. App.tsx: Custom hooks + layout components

**Decision**: Extract state and logic into custom hooks; extract layout JSX into components.

**Rationale**: React's custom hook pattern is the idiomatic way to separate state logic from rendering. Each hook encapsulates a cohesive slice of state and its related callbacks.

**Extracted units**:
- `hooks/useAppState.ts` — All useState/useRef declarations, returns a typed state object
- `hooks/useMessageHandler.ts` — The `handleMessage` switch callback, takes state setters as params
- `hooks/useSessionActions.ts` — `handleSend`, `handleAbort`, `handleResume`, `handleSpawn`, `handleHide`, `handleRename`, `handleShutdown`, `handleTerminal*` callbacks
- `hooks/useOpenSpecActions.ts` — `handleOpenSpecRefresh`, `handleBulkArchive`, `handleReadArtifact`, `handleAttachProposal`, `handleDetachProposal`
- `hooks/useContentViews.ts` — `handleOpenPiResources`, `handleViewPiResourceFile`, `handleViewReadme`, preview/resource/readme state and fetch logic
- `components/SessionDetailView.tsx` — The `sessionDetail` JSX block (header + content area routing)
- `components/ContentRouter.tsx` — The nested ternary chain that picks which content view to show (archive, specs, preview, diff, flow, chat)

**Alternative considered**: Single mega-hook. Rejected because it would just move the problem without decomposing it.

### 2. server.ts: Route modules + wiring extraction

**Decision**: Group Fastify routes by domain into separate registration functions; extract event wiring and bootstrap logic.

**Rationale**: Fastify's plugin/decorator pattern supports route grouping naturally. Each route module exports a `register(fastify, deps)` function.

**Extracted units**:
- `server/routes/session-routes.ts` — `/api/sessions`, `/api/session-diff`, `/api/events/:id/:seq`
- `server/routes/git-routes.ts` — `/api/git/branches`, `/api/git/checkout`, `/api/git/init`, `/api/git/stash-pop`
- `server/routes/file-routes.ts` — `/api/file`, `/api/readme`, `/api/pi-resource-file`, `/api/browse`
- `server/routes/openspec-routes.ts` — `/api/openspec-archive`, `/api/pi-resources`
- `server/routes/system-routes.ts` — `/api/config`, `/api/health`, `/api/shutdown`, `/api/tunnel-*`, `/api/editors`, `/api/open-editor`
- `server/event-wiring.ts` — The `piGateway.onEvent` handler
- `server/idle-timer.ts` — Auto-shutdown idle timer
- `server/session-bootstrap.ts` — Startup session scanning, restoration, directory service init

**Alternative considered**: Fastify plugins with `fastify.register()`. Rejected as overkill — simple function exports with explicit dependency injection are simpler and more transparent.

### 3. browser-gateway.ts: Per-domain message handlers

**Decision**: Extract message handling into domain-specific handler functions that receive a shared context object.

**Rationale**: The current switch statement handles 25+ message types spanning different domains. Grouping by domain (subscriptions, session actions, session metadata, terminals, directories) makes each handler independently readable and testable.

**Extracted units**:
- `server/browser-handlers/subscription-handler.ts` — `subscribe`, `unsubscribe`, event replay
- `server/browser-handlers/session-action-handler.ts` — `send_prompt`, `abort`, `resume_session`, `spawn_session`, `shutdown`, `flow_control`
- `server/browser-handlers/session-meta-handler.ts` — `rename_session`, `hide_session`, `unhide_session`, `attach/detach_proposal`, `fetch_content`, `list_sessions`
- `server/browser-handlers/terminal-handler.ts` — `create_terminal`, `kill_terminal`, `rename_terminal`
- `server/browser-handlers/directory-handler.ts` — `pin_directory`, `unpin_directory`, `reorder_*`, `openspec_refresh`, `openspec_bulk_archive`

Each handler receives a typed context with the dependencies it needs (sessionManager, piGateway, etc.).

### 4. bridge.ts: Logical extraction by concern

**Decision**: Extract coherent blocks into focused modules.

**Extracted units**:
- `extension/session-sync.ts` — `sendStateSync()`, `replaySessionEntries()`, `handleSessionChange()`
- `extension/model-tracker.ts` — `sendModelUpdateIfChanged()`, model/thinking level state
- `extension/flow-event-wiring.ts` — Flow event listener registration (`flow:*` → `event_forward`)

### 5. event-reducer.ts: Flow reducer extraction

**Decision**: Extract the flow state machine into `lib/flow-reducer.ts`.

**Rationale**: The flow state machine (agent tracking, status transitions, tool/text accumulation) is a self-contained subsystem that the main reducer calls into. Extracting it makes both files focused.

### 6. SessionList.tsx: Component + utility extraction

**Decision**: Extract the group header rendering and pure utility functions.

**Extracted units**:
- `components/DirectoryGroupHeader.tsx` — The group header block (collapse toggle, pin, editors, spawn, terminal, OpenSpec section)
- `components/SessionListToolbar.tsx` — Top toolbar (theme, filters, pin button, settings, tunnel)
- `lib/session-grouping.ts` — Pure functions: `groupSessionsByDirectory`, `filterSessions`, `sortSessionsByOrder`, `getUnifiedOrder`

## Risks / Trade-offs

- **[Risk] Circular imports** → Mitigation: Each extracted module imports only from shared types and receives dependencies via parameters. No cross-module imports between extracted files.
- **[Risk] Regressions from move errors** → Mitigation: All existing tests must pass green before and after each extraction. Run `npm test` after each file extraction.
- **[Risk] Merge conflicts with parallel work** → Mitigation: Do extractions in small, atomic commits. Each extraction is independently mergeable.
- **[Trade-off] More files to navigate** → Accepted: More files with clear names is better than fewer files with tangled responsibilities. IDE navigation (go-to-definition) handles this well.
- **[Trade-off] Slightly more boilerplate** → Accepted: Explicit parameter passing and typed context objects add a few lines but make dependencies visible and testable.
