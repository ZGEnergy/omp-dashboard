
# PI Dashboard

## Project Overview

Web-based dashboard for monitoring and interacting with pi agent sessions remotely. Three-component architecture: bridge extension + Node.js server + React web client.

## Architecture

See [docs/architecture.md](docs/architecture.md) for full details.

- **Bridge Extension** (`src/extension/`) — Runs in every pi session, forwards events via WebSocket
- **Dashboard Server** (`src/server/`) — Aggregates events, in-memory + JSON persistence, dual WebSocket servers
- **Web Client** (`src/client/`) — React + Tailwind responsive UI
- **Shared Types** (`src/shared/`) — Protocol definitions shared across components

## Commands

```bash
npm install          # Install dependencies
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npm run test:bootstrap       # Run the bootstrap resolution harness only
npm run test:bootstrap:watch # Bootstrap harness in watch mode
npm run build        # Build web client (Vite)
npm run dev          # Start Vite dev server
npm run reload       # Reload all connected pi sessions
npm run reload:check # Type-check + reload all pi sessions
pi-dashboard         # Start dashboard server
pi-dashboard --dev   # Start with Vite proxy
```

## Running Tests

Pipe test output to a tmp file, then grep — avoids re-running to inspect errors:

```bash
npm test 2>&1 | tee /tmp/pi-test.log        # run once, capture all output
grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log   # find failures
grep -n -A 20 'FAIL ' /tmp/pi-test.log        # failure + context
```

Always grep the file — never rerun `npm test` just to see errors.

## Cross-Platform QA Testing

VM-based QA testing for verifying clean-state installation and runtime across platforms.

```bash
cd qa
make build-linux-x86    # Build Ubuntu x86 base image (Packer + VMware)
make test-linux-x86     # Clone → boot → run tests → destroy
make manual-linux-x86   # Clone with GUI for manual testing
make clean              # Destroy all cloned VMs
```

| File | Purpose |
|------|---------|
| `qa/Makefile` | Build/test/manual/clean targets for all platforms |
| `qa/packer/*.pkr.hcl` | Packer templates per platform (Ubuntu, Windows, macOS) |
| `qa/packer/scripts/` | Provisioning scripts (common, linux, macos, windows) |
| `qa/packer/vars/` | OS-version-specific variables (ISO URL, checksum, VM specs) |
| `qa/packer/http/` | Auto-install configs (cloud-init, autounattend.xml) |
| `qa/scripts/` | VM lifecycle (clone, wait-ssh, destroy, run-test) |
| `qa/tests/` | Test suite (install, server, websocket, terminal, git) |
| `qa/README.md` | Full setup and usage documentation |

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/protocol.ts` | Extension↔Server WebSocket messages. Phase-1 Extension UI System adds `ui_modules_list` / `ui_data_list` (extension → server) and `ui_management` (server → extension); these messages MUST stay in `ExtensionToServerMessage` / `ServerToExtensionMessage` unions or esbuild strips the switch cases in production. See change: add-extension-ui-modal. |
| `src/shared/browser-protocol.ts` | Server↔Browser WebSocket messages (all message types including PromptBus `prompt_request`/`prompt_dismiss`/`prompt_cancel` and Extension UI System Phase-1 `ui_modules_list`/`ui_data_list` (server → browser) + `ui_management` (browser → server) must be in the `ServerToBrowserMessage` / `BrowserToServerMessage` unions — `as any` switch cases are stripped by esbuild in production) |
| `src/shared/types.ts` | Data models (Session, Workspace, Event) |
| `src/shared/config.ts` | Shared config loader (`~/.pi/dashboard/config.json`). Includes `openspec: OpenSpecPollConfig` block (`pollIntervalSeconds` 5–3600, `maxConcurrentSpawns` 1–16, `changeDetection` `"mtime"\|"always"`, `jitterSeconds` 0–60) with clamping via `parseOpenSpecPollConfig`. See change: optimize-openspec-poll-burst |
| `src/shared/semaphore.ts` | Tiny FIFO semaphore (`createSemaphore(max)` → `{run, setMax, size}`). Used by `directory-service.ts` to cap concurrent `openspec` CLI spawns. Supports live resize via `setMax(n)` for runtime reconfig. |
| `src/extension/bridge.ts` | Main extension entry point (composes sync/tracker/flow modules, tracks `isAgentStreaming` in persistent BridgeState). **Invariant**: bridge code MUST NOT call `pi.newSession(...)` / `ctx.fork(...)` / `ctx.switchSession(...)` — enforced by `packages/extension/src/__tests__/no-session-replacement-calls.test.ts`. pi 0.69+ invalidates captured `pi`/`ctx` after these calls; the bridge re-captures state in `session_start` keyed on `event.reason ∈ {"new","fork","resume"}`. **Per-message-fork entryId stamping** (change: fix-per-message-fork): `message_start` events now stamp a `nonce` (no entryId, since the user entry isn't persisted yet on pi 0.69+); `message_end` enrichment is deferred via `setTimeout(0)` (NOT `queueMicrotask`, which resolves inside pi's awaited extension dispatcher and misses `appendMessage`); a wrapped `ctx.sessionManager.appendMessage` emits `entry_persisted { entryId, nonce }` so the client reducer can back-fill the user-message bubble's `entryId`. |
| `src/extension/bridge-context.ts` | Shared mutable state type + helpers for bridge modules |
| `src/extension/session-sync.ts` | Session register, replay, and switch/fork handling |
| `src/extension/model-tracker.ts` | Model/thinking-level/git/name change detection |
| `src/extension/flow-event-wiring.ts` | Flow event listener registration (flow:* → event_forward) |
| `src/extension/connection.ts` | WebSocket with exponential backoff |
| `src/extension/server-probe.ts` | TCP probe to detect running server |
| `src/shared/server-identity.ts` | Identity-verified health check (`isDashboardRunning`) replacing bare TCP probes |
| `src/shared/mdns-discovery.ts` | mDNS advertise/discover/browse for `_pi-dashboard._tcp` services |
| `src/extension/server-launcher.ts` | Auto-start server as detached process; captures **both stdout AND stderr** to `~/.pi/dashboard/server.log` (append mode) by passing `stdoutFd: logFd` alongside `logFd` — parity with `pi-dashboard start`'s `stdio: ["ignore", logFd, logFd]`. Exports pure `buildSpawnDetachedOptions` and `buildReadyTimeoutMessage`; the latter appends a `nodejs/node#58515` upgrade hint when `isKnownBadNode(process.version)` is true. |
| `src/extension/command-handler.ts` | Command routing: `!`/`!!` bash, `/compact`, slash commands |
| `src/extension/prompt-expander.ts` | Slash command → prompt template expansion (supports colon-to-hyphen aliasing: `/opsx:cmd` → `opsx-cmd.md`) |
| `src/extension/dev-build.ts` | Dev build-on-reload helper (client build + server shutdown) |
| `src/extension/server-auto-start.ts` | mDNS-first discovery → health check fallback → auto-start with concurrent launch detection |
| `src/shared/session-meta.ts` | Session metadata sidecar (.meta.json) read/write helpers |
| `src/extension/process-metrics.ts` | Lightweight CPU/memory/event-loop metrics collector for heartbeats |
| `src/extension/process-scanner.ts` | Child process detection via ps + PGID tracking (leaf-only, grandchild recursion) and PGID-based kill |
| `src/client/components/ProcessList.tsx` | Session card process list with elapsed time and red ✕ kill button |
| `src/extension/git-info.ts` | Git branch/remote/PR detection (polled every 30s) |
| `src/extension/git-link-builder.ts` | Git remote URL parsing and platform-specific links |
| `src/server/git-operations.ts` | Server-side git commands: branch listing, checkout, init, stash pop |
| `src/client/components/BranchPicker.tsx` | Typeahead branch picker with keyboard navigation |
| `src/client/components/BranchSwitchDialog.tsx` | Checkout orchestration: dirty-state stash, pop prompt |
| `src/client/lib/git-api.ts` | Client-side fetch helpers for git API endpoints |
| `src/client/hooks/useImagePaste.ts` | Reusable clipboard-image-paste hook with controlled/uncontrolled modes. Uncontrolled (`useImagePaste()` with no args): hook owns `pendingImages` in local `useState` — used by `ExploreDialog` whose lifetime IS the dialog. Controlled (`useImagePaste({ images, onImagesChange })`): caller owns the array — used by `<CommandInput>` so App can key pending images by `sessionId`. `imageError` stays local in BOTH modes (auto-clears after 3 s, no value in lifting). Supports image/png, image/jpeg, image/gif, image/webp; 10 MB base64 cap. See change: lift-pending-images-to-app |
| `src/extension/prompt-bus.ts` | PromptBus — unified prompt routing to registered adapters (TUI, dashboard, custom). First-response-wins, cross-adapter dismissal. |
| `src/extension/dashboard-default-adapter.ts` | Built-in PromptBus adapter that renders prompts as generic interactive dialogs in dashboard chat |
| `src/extension/ui-modules.ts` | Extension UI System Phases 1+2: `refreshUiModules(ctx)` partitions `probe.modules` by `kind` — `management-modal` → `ui_modules_list` (Phase 1, last-write-wins on duplicate `id`); `footer-segment`/`agent-metric`/`breadcrumb`/`gate`/`toast` → one `ext_ui_decorator` per descriptor (Phase 2, last-write-wins on `(kind,namespace,id)`; `namespace` validated against `/^[a-z0-9-]+$/`; `removed: true` forwarded verbatim). `subscribeUiInvalidate(ctx)` throttles `ui:invalidate` re-probes to 20/sec (50 ms leading + trailing) and emits one warning per offending burst (`INVALIDATE_RATE_CAP_PER_SEC = 20`). `handleUiManagement(ctx, msg)` re-emits browser-originated `ui_management` on `pi.events` with `_reply` injected and forwards synchronous `data.items` as `ui_data_list`. Wired into `bridge.ts` at `session_start` and the `onReconnect` callback. See changes: add-extension-ui-modal, add-extension-ui-decorations. |
| `src/client/components/extension-ui/GenericExtensionDialog.tsx` | Phase-1 modal renderer for `ExtensionUiModule`. Supports `view.kind ∈ {table, grid, form}`, dispatches `ui_management { action: "list", event: dataEvent }` on mount for table/grid, gates `UiAction.confirm` through `ConfirmDialog`. MDI icons resolved via `mdi-icon-lookup.ts` (unknown keys render no icon). |
| `src/client/components/extension-ui/decorator-utils.ts` | Phase-2 helper: `decoratorsOfKind(decorators, kind)` — typed filter over `Session.uiDecorators` returning only descriptors of the requested `DecoratorKind`. Used by every Phase-2 slot component. See change: add-extension-ui-decorations. |
| `src/client/components/extension-ui/FooterSegmentSlot.tsx` | Phase-2 slot. Renders all `kind: "footer-segment"` descriptors as inline pills mounted inside `SessionHeader.tsx` to the right of the model/thinking-level info. Supports MDI `payload.icon` (resolved via `mdi-icon-lookup`) and `payload.tooltip` (HTML title attribute). |
| `src/client/components/extension-ui/AgentMetricSlot.tsx` | Phase-2 slot. Renders `agent-metric` descriptors whose `payload.agentId` matches the `FlowAgentCard.agent.agentName` of the parent. Mounted inside `FlowAgentCard.tsx`. Orphan descriptors (no matching agent) render nothing. |
| `src/client/components/extension-ui/BreadcrumbSlot.tsx` | Phase-2 slot. Renders the most-recently-cached `breadcrumb` descriptor as a horizontal step indicator at the top of `FlowDashboard.tsx`. Steps with `status: "done"` show a check; `"error"` show a red alert; the active step is matched against `payload.current` (or first `status: "active"`). |
| `src/client/components/extension-ui/GateSlot.tsx` | Phase-2 slot. Aggregates `gate` descriptors targeting the same `flowId` via the pure helper `aggregateGateState(decorators, flowId)`: most-restrictive-wins (any `available: false` blocks; reasons concatenated). Mounted inline in `FlowLaunchDialog.tsx`; the dialog also reads `aggregateGateState` directly to disable the Run button. |
| `src/client/components/extension-ui/ToastSlot.tsx` | Phase-2 slot. Top-right fixed tray mounted in `App.tsx`. Reads toast descriptors across every session in the `sessions` Map, stacks without deduplication, auto-dismisses each toast after `payload.durationMs` (default 5000ms; `0` = sticky), caps simultaneous-display at 5 (FIFO eviction — cache is unaffected). Manual dismiss via the close button latches the descriptor key into a local `dismissed` set so cache replay does not resurrect dismissed toasts. |
| `src/client/lib/mdi-icon-lookup.ts` | `resolveMdiIcon(key) → string \| null` — looks up an MDI key string against `@mdi/js` exports; allowlists by `mdi`-prefix, returns `null` for unknown keys (no error). XSS-safe icon vocabulary for extension descriptors. |
| `src/client/lib/prompt-component-registry.ts` | Client-side component registry mapping prompt type strings to render metadata (placement, component) |
| `src/extension/ask-user-tool.ts` | `ask_user` tool registration (bundled in bridge, registered at session_start to avoid static tool-name conflicts with other extensions). `multiselect` dispatches through `polyfillMultiselect` (since pi-coding-agent's `ExtensionUIContext` has no `multiselect` method). Tool description instructs agents: *"UI provides a Select all toggle; do not add one."* See change: ask-user-multiselect-polyfill. |
| `src/extension/multiselect-polyfill.ts` | `polyfillMultiselect(ctx, title, options, opts)` — thin wrapper around `ctx.ui.custom<T>()` that resolves to `string[]` (confirmed) or `undefined` (cancelled). Used for both single-question and batch sub-question `multiselect` paths in `ask-user-tool.ts`. |
| `src/extension/multiselect-list.ts` | `MultiSelectList` component implementing pi-tui's `Component` interface. Keyboard contract: `↑↓`/`k`/`j` navigate, `Space` toggles current, `Enter` confirms (selected values in original option order), `Escape` cancels. **No "select all" binding in TUI** — the dashboard adapter provides that affordance. |
| `src/shared/openspec-activity-detector.ts` | Detects OpenSpec activity from tool events; auto-attach requires only changeName (phase optional) |
| `src/shared/openspec-poller.ts` | OpenSpec CLI polling (shared, used by server DirectoryService) |
| `src/shared/state-replay.ts` | Synthesizes events from pi entries (shared, used by server + bridge) |
| `src/shared/dashboard-plugin/slot-types.ts` | Frozen slot taxonomy: `SlotId` union, `Multiplicity`, `PayloadTier` enums, `SLOT_DEFINITIONS` record. Adding a slot = minor; removing = major. |
| `src/shared/dashboard-plugin/manifest-types.ts` | `PluginManifest` and `PluginClaim` interfaces; includes `tab` field for `settings-section` claims and `fixture` flag for test-only plugins. |
| `src/shared/dashboard-plugin/slot-props.ts` | `SlotPropsMap` and `SlotProps<SlotId>` — typed prop contracts per slot id. Type-level test asserts all slot ids are covered. |
| `src/shared/dashboard-plugin/plugin-status.ts` | `PluginStatus` (for `/api/health`) and `PluginConfigUpdate` (WebSocket broadcast payload). |
| `src/shared/plugin-bridge-register.ts` | Plugin bridge entry management: `registerPluginBridge`, `deregisterPluginBridge`, `registerAllPluginBridges`. Manages `dashboard-<plugin-id>` keys in `settings.json#dashboardPluginBridges`; never touches user-owned `packages[]` entries. Atomic write (tmp+rename). |
| `packages/dashboard-plugin-runtime/src/slot-registry.ts` | `createSlotRegistry()` — typed `Map<SlotId, ClaimEntry[]>` pre-sorted by `(priority, pluginId)`. Filter helpers: `forSession`, `forFolder`, `forCommand`, `forTab`, `forToolName`. |
| `packages/dashboard-plugin-runtime/src/manifest-validator.ts` | Hand-rolled manifest validator. Throws `ManifestValidationError` with `pluginId` and `reason`. No Zod dependency. |
| `packages/dashboard-plugin-runtime/src/plugin-context.tsx` | `PluginContextProvider`, `CurrentPluginLayer`, `usePluginConfig<T>()`, `useAllSessions`, `useSessionState`, `usePluginLogger`, `usePluginSend`, `usePluginRouter`, `useSlotRegistry`, `applyPluginConfigUpdate`. Per-plugin context layer scopes hooks to the contributing plugin's id. |
| `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` | One component per slot id: `SidebarFolderSectionSlot`, `SessionCardBadgeSlot`, `SessionCardActionBarSlot`, `ContentViewSlot`, `ContentHeaderStickySlot`, `ContentInlineFooterSlot`, `AnchoredPopoverSlot`, `CommandRouteSlot`, `SettingsSectionSlot`, `ToolRendererSlot`. Each wraps contributions in `SlotErrorBoundary`. |
| `packages/dashboard-plugin-runtime/src/slot-error-boundary.tsx` | Per-claim React error boundary. Logs `[slot-error-boundary] Plugin "<id>" slot "<slot>" threw:` and renders nothing for the failing claim without suppressing siblings. |
| `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` | `viteDashboardPluginsPlugin(repoRoot?)` — generates `packages/client/src/generated/plugin-registry.tsx` with named imports (for tree-shaking). Watches manifests during dev; regenerates + triggers HMR on changes. Filters `fixture:true` plugins in production. |
| `packages/dashboard-plugin-runtime/src/server/loader.ts` | `discoverPlugins(repoRoot?)` (single-process-cache glob), `loadServerEntries(deps)` (per-plugin dynamic-import + `registerPlugin` invocation, failure-isolated), `getPluginStatusStore()`. |
| `packages/dashboard-plugin-runtime/src/server/server-context.ts` | `createServerPluginContext(deps, pluginId)` factory — creates a `ServerPluginContext` scoped to a plugin with namespaced logger and typed config accessors. |
| `packages/dashboard-plugin-runtime/src/server/config-validator.ts` | `validatePluginConfig`, `applySchemaDefaults` — Ajv JSON-Schema 7 validation for plugin config writes. |
| `packages/dashboard-plugin-runtime/src/server/plugin-status-store.ts` | In-memory `PluginStatusStore` — consumed by `/api/health.plugins[]`. |
| `src/server/routes/plugin-config-routes.ts` | `POST /api/config/plugins/:id` — validates `:id`, validates body against `configSchema`, merges into `plugins.<id>.*`, atomic-writes, broadcasts `plugin_config_update`. Auth-gated. |
| `packages/demo-plugin/` | Private workspace (`"private": true`, `"fixture": true`). Exercises `settings-section` (DemoSettings form) and `tool-renderer` (DemoToolRenderer green box for `toolName: "DashboardDemo"`). Excluded from production bundles. |
| `src/shared/stats-extractor.ts` | Extracts token/cost stats from turn_end events |
| `src/server/session-stats-reader.ts` | Reads cumulative stats + context usage from session JSONL files at startup |
| `src/server/server.ts` | HTTP + WebSocket server (composes route modules + wiring) |
| `src/server/routes/session-routes.ts` | REST routes: sessions, events, session-diff |
| `src/server/routes/git-routes.ts` | REST routes: git branches, checkout, init, stash-pop |
| `src/server/routes/file-routes.ts` | REST routes: file read, browse, readme, pinned-dirs |
| `src/server/routes/openspec-routes.ts` | REST routes: openspec-archive, pi-resources, pi-resource-file |
| `src/server/routes/system-routes.ts` | REST routes: config, health, shutdown, tunnel, editors |
| `src/server/event-wiring.ts` | Pi gateway → browser gateway event forwarding (replay suppression with `skipReplayInsert` dedup, flows refresh dedup, context usage extraction). Phase-1 Extension UI System: caches `ui_modules_list` on `Session.uiModules` and broadcasts; caches `ui_data_list` on `Session.uiDataMap[event]` with a per-event item cap (default 1000, last-write-wins on overflow) and broadcasts. Phase-2: `ext_ui_decorator` switch arm caches descriptors under `Session.uiDecorators[`${kind}:${namespace}:${id}`]` (upsert, or delete when `removed: true`) and broadcasts the message verbatim to subscribers; deleting an absent key is a no-op but still broadcasts. See changes: add-extension-ui-modal, add-extension-ui-decorations. |
| `src/server/idle-timer.ts` | Auto-shutdown idle timer with sleep-wake resilience |
| `src/server/session-bootstrap.ts` | Startup session discovery and OpenSpec polling init |
| `src/server/pi-gateway.ts` | Extension WebSocket gateway (port 9999) |
| `src/server/browser-gateway.ts` | Browser WebSocket gateway (dispatches to handler modules) |
| `src/server/browser-handlers/handler-context.ts` | Shared context type for browser message handlers |
| `src/server/browser-handlers/subscription-handler.ts` | Subscribe/unsubscribe with async batched replay, backpressure, lazy loading. Exports `replayUiState(ws, sessionId, ctx)` for the Extension UI System; called immediately after every `replayPendingUiRequests` site (4 sites). Replay sends the cached `ui_modules_list` (Phase 1) → one `ui_data_list` per `(event, items)` entry (Phase 1) → one `ext_ui_decorator` per `Session.uiDecorators` cache entry (Phase 2; never with `removed: true` since deleted entries are absent). Replay ordering: events → pending UI requests → ui_modules_list → ui_data_list → ext_ui_decorator. See changes: add-extension-ui-modal, add-extension-ui-decorations. |
| `src/server/browser-handlers/session-action-handler.ts` | Send prompt, abort, resume, spawn, shutdown, force kill, flow control. `handleForceKill` delegates the SIGTERM→wait→SIGKILL escalation to `killProcess` from `platform/process.ts` so Windows gets `taskkill /F /T /PID` (genuine tree kill). No direct `process.kill()` anywhere (enforced by `no-direct-process-kill.test.ts`). `handleSendPrompt` also intercepts `/reload` on headless sessions (gated by `headlessPidRegistry.getPid`) and delegates to `handleHeadlessReload`, which SIGTERMs the pi process and respawns with `--session <file> --mode continue` — pi 0.68.0 has no extension-accessible reload path in RPC mode, so kill-and-respawn is the only way to reload settings/extensions/skills for headless sessions. See changes: route-kill-paths-through-platform, headless-reload-via-respawn. |
| `src/server/browser-handlers/session-action-helpers.ts` | Pure helpers for session-action-handler. `shouldInterceptReload(msg, headlessPidRegistry)` gates the headless-reload interception: exact `/reload` text, no images, PID tracked in registry. Extracted for testability. |
| `src/client/components/ImageLightbox.tsx` | Full-size image lightbox with zoom/pan (useZoomPan), Esc/backdrop close |
| `src/client/components/CollapsedToolGroup.tsx` | Collapsed group of repeated tool calls with expand toggle |
| `src/client/lib/group-tool-calls.ts` | Groups consecutive identical tool calls for chat display |
| `src/server/browser-handlers/session-meta-handler.ts` | Rename, hide, unhide, attach/detach proposal, fetch, list |
| `src/server/browser-handlers/terminal-handler.ts` | Create, kill, rename terminals |
| `src/server/browser-handlers/directory-handler.ts` | Pin/unpin dirs, reorder, openspec refresh, pi-gateway forwards |
| `src/server/memory-event-store.ts` | In-memory event buffer with LRU eviction, per-session cap, payload truncation |
| `src/server/memory-session-manager.ts` | Pure in-memory session registry |
| `src/client/components/FolderOpenSpecSection.tsx` | Folder-level OpenSpec UI: collapsible change list, refresh, bulk archive, archive button |
| `src/client/components/ArchiveBrowserView.tsx` | Searchable archive browser: date-grouped list, two-level nav to artifact reader |
| `src/client/hooks/useArchiveListing.ts` | Fetch hook + pure helpers (groupByDate, filterEntries) for archive endpoint |
| `src/server/openspec-archive.ts` | Scans `openspec/changes/archive/` and returns structured ArchiveEntry list |
| `src/client/components/SessionOpenSpecActions.tsx` | Session-level OpenSpec: searchable attach dialog, action buttons, detach |
| `src/client/components/DialogPortal.tsx` | Portal wrapper rendering dialogs at document.body with scroll lock |
| `src/client/components/PinDirectoryDialog.tsx` | Dialog to pin a directory (wraps PathPicker) |
| `src/client/components/PathPicker.tsx` | Reusable keyboard-first path picker with typeahead directory list |
| `src/client/lib/browse-api.ts` | Client-side browse API helper for PathPicker |
| `src/server/browse.ts` | Directory listing logic for browse API endpoint |
| `src/server/pi-resource-scanner.ts` | Discovers pi extensions, skills, prompts from local, global, and package sources |
| `src/server/package-manager-wrapper.ts` | Thin adapter around pi's `DefaultPackageManager` with operation serialization, progress forwarding, and session reload; delegates module resolution to `ToolRegistry.resolveModule("pi-coding-agent")` |
| `src/shared/tool-registry/registry.ts` | `ToolRegistry` service — single-source resolver for every external binary/module (pi, pi-coding-agent, openspec, npm, node, tsx, git, zrok, pi-dashboard). Ordered strategy chain per tool, per-resolution diagnostic trail, in-memory cache, override-aware |
| `src/shared/tool-registry/definitions.ts` | Registers the standard tool set. Each definition declares an ordered strategy chain (override → bare-import → managed → npm-global → where) and a classifier (strategy → source). Includes build-time tools `electron` and `node-pty` (registered as `kind: "module"` returning the package directory; resolved hoist-aware via `bareImportPackageDirStrategy` with optional `searchPaths`). See change: register-build-time-tools |
| `packages/shared/bin/pi-dashboard-resolve-tool.cjs` | Shell-callable resolver wrapper for the tool registry. CommonJS, dependency-free, invokable as `node packages/shared/bin/pi-dashboard-resolve-tool.cjs <tool-name> [--json]`. Mirrors the `override` + `bare-import` strategy semantics for build-time tools (electron, node-pty) so CI workflows / Dockerfiles / postinstall scripts can resolve hoisted-vs-nested layouts without depending on the shared package's TS build. **Strategy chain MUST stay in sync with `tool-registry/definitions.ts`** — enforced socially via cross-reference comments and via `no-hardcoded-node-modules-paths.test.ts`. See change: register-build-time-tools |
| `src/shared/__tests__/no-hardcoded-node-modules-paths.test.ts` | Repo-level lint: scans `.github/workflows/publish.yml`, `.github/workflows/ci.yml`, `packages/electron/scripts/Dockerfile.build`, and the two `fix-pty-permissions.cjs` postinstalls for hardcoded `node_modules/electron` / `node_modules/node-pty` substrings outside the explicit allowlist. Fails with `file:line:col` citation. Replaces hand-rolled inline `require.resolve(...)` patterns with the registered tool registry. Mirrors `no-direct-process-kill.test.ts` and `no-raw-node-import.test.ts`. See change: register-build-time-tools |
| `src/shared/tool-registry/strategies.ts` | Reusable resolution strategies: `overrideStrategy`, `managedBinStrategy`, `managedModuleStrategy`, `npmGlobalStrategy`, `whereStrategy`, `bareImportStrategy` (uses `createRequire` for sync probe). All take injectable `StrategyDeps` for tests |
| `src/shared/tool-registry/overrides.ts` | Read/write `~/.pi/dashboard/tool-overrides.json` (machine-local, separate from `config.json`). Lazy-loaded, atomic write via tmp+rename, malformed-file tolerant |
| `src/shared/tool-registry/types.ts` | `ToolDefinition`, `Strategy`, `StrategyResult`, `Resolution`, `Source`, `UnknownToolError`, `ModuleResolutionError` |
| `src/shared/tool-registry/index.ts` | Barrel export + `getDefaultRegistry()` singleton accessor |
| `src/server/routes/tool-routes.ts` | REST routes: `GET /api/tools`, `GET /api/tools/:name`, `POST /api/tools/rescan`, `PUT/DELETE /api/tools/:name`, `POST /api/tools/diagnostics` (text/plain export) |
| `packages/shared/src/bootstrap-install.ts` | Shared bootstrap installer (`bootstrapInstall({ packages, managedDir?, progress?, npmArgv?, env?, registry? })`, `bootstrapInstallDefaults`, `ensureManagedDir`, `resolveNpmArgv`). Single entry point for pi/openspec/tsx install into `~/.pi-dashboard/` — called from the Electron wizard (via `packages/electron/src/lib/dependency-installer.ts` wrapper that adds bundled-node + offline-cacache concerns) and from the CLI first-run path (`cli.ts runDegradedModeBootstrap`). See change: unified-bootstrap-install. |
| `packages/server/src/bootstrap-state.ts` | In-memory bootstrap state store (`createBootstrapState()`, `BootstrapState { status, progress, error, version, compatibility, bridgeRegistrationError }`, `BootstrapStateStore` with get/set/subscribe/dispose plus side-channel `setLastInstallPackages` / `getLastInstallPackages` so `POST /api/bootstrap/retry` re-runs the exact failed set instead of a hard-coded default). Partial `set()` supports `undefined` = clear semantics; `setLastInstallPackages` does NOT trigger subscribers (it's not part of the broadcast snapshot). |
| `packages/server/src/routes/bootstrap-routes.ts` | REST routes: `GET /api/bootstrap/status`, `POST /api/bootstrap/upgrade-pi` (202+ticketId or 409), `POST /api/bootstrap/retry` (202 if failed, else 409). Trigger callbacks are injected so CLI wires them to `bootstrapInstall` while tests wire them to spies. |
| `packages/server/src/bootstrap-queue.ts` | In-memory ticket queue (`createBootstrapQueue()`, `enqueue(handler)`, `flushAll()`, `size()`, `clear(reason)`, `onTicketComplete(listener)`). `server.ts` flushes on bootstrap-state transition to "ready" and wires `onTicketComplete` → `bootstrap_ticket_complete` WS broadcast so browsers holding a 202 ticketId learn the queued op's outcome. `session-api.ts gateOrEnqueue` uses the queue to defer session spawn during installs. On `clear`, pending tickets are rejected directly (reject closure stored on the entry) so no caller hangs at shutdown. |
| `packages/server/src/pi-version-skew.ts` | Pi compatibility range reader (`readPiCompatibility` reads `piCompatibility` from `packages/server/package.json`; `readCurrentPiVersion` via `createRequire`, with `fs.realpathSync` on the registry-resolved bin path so symlinked npm-global launchers resolve to the real module's `package.json`), comparator (`parseVersion`, `compareVersions`, `isBelow`, `isAbove` supporting `0.x` wildcard), + `updateBootstrapCompatibility(store, pkgPath)` that writes the result into `bootstrapState.compatibility` with a 60 s cache. Below-minimum adds a 503-blocking `error` message. **CLI surface**: `cli.ts` calls `logCompatibilityWarning(bootstrapState)` after each `updateBootstrapCompatibility(...)` site and emits a stderr warning — 3-line red block on below-minimum (`⚠ pi X is below the required minimum Y … Run: pi-dashboard upgrade-pi`), single-line advisory on below-recommended, silent when in range. **Currently pinned**: `minimum: "0.70.0"`, `recommended: "0.70.0"`, `maximum: null` (lockstep — no backward compatibility for older pi versions). See changes: pi-zero-seventy-compat, warn-pi-version-skew-in-cli. |
| `packages/client/src/hooks/useBootstrapStatus.ts` | Client hook for bootstrap state. Fetches `/api/bootstrap/status` on mount, subscribes to `bootstrap-status` `CustomEvent` dispatched by `useMessageHandler` on `bootstrap_status_update` WS broadcasts. Exposes `{ state, isLoading, error, refresh, retry, upgradePi }`. |
| `packages/client/src/components/BootstrapBanner.tsx` | Banner mounted in `App.tsx` above `<MobileShell>`. Hidden at status="ready" with no compatibility hints; blue "Installing pi…" when installing; red "pi install failed — [Retry]" when failed; amber upgrade hints when `compatibility.upgradeRecommended` or `upgradeDashboard` is true. |
| `src/client/lib/tools-api.ts` | Client-side fetch helpers for `/api/tools*` (`fetchTools`, `rescanAll`, `rescanOne`, `setOverride`, `clearOverride`, `downloadDiagnostics`) |
| `src/client/components/ToolsSection.tsx` | Settings → General → **Tools** section. One row per registered tool: status badge, source, truncated path, expand-to-trail, override input, per-row rescan. Top-level: Rescan all / Reset overrides / Export diagnostics |
| `src/server/npm-search-proxy.ts` | Cached proxy for npm registry search (`keywords:pi-package`) and README fetch |
| `src/server/routes/package-routes.ts` | REST routes: search, readme, installed, install, remove, update, check-updates |
| `src/client/components/SortablePinnedGroup.tsx` | Drag-to-reorder wrapper for pinned directory groups |
| `src/server/preferences-store.ts` | Global UI preferences (pinned dirs, session order) in `preferences.json` |
| `src/server/meta-persistence.ts` | Per-session debounced `.meta.json` writer |
| `src/server/session-scanner.ts` | Startup session discovery by scanning `~/.pi/agent/sessions/` |
| `src/server/migrate-persistence.ts` | One-time migration from `sessions.json` + `state.json` to `.meta.json` |
| `src/server/session-order-manager.ts` | Per-cwd session ordering with persistence |
| `src/server/directory-service.ts` | Server-side session discovery, event loading, and OpenSpec polling. Uses mtime-gated per-directory cache (`DirCache`), shared FIFO semaphore, and deterministic per-cwd `phaseOffsetMs(cwd, jitterSeconds)` jitter (FNV-1a 32-bit hash). `refreshOpenSpec(cwd)` bypasses the mtime gate but still acquires the semaphore. `reconfigurePolling(cfg)` applies live config changes without a restart. Pi-resources scan lives on its own 5×-interval timer so it doesn't stack with the openspec burst. See change: optimize-openspec-poll-burst |
| `src/server/pending-fork-registry.ts` | Tracks pending fork operations for session placement |
| `src/server/pending-resume-registry.ts` | Queues prompts for auto-resume of ended sessions |
| `src/server/json-store.ts` | Atomic JSON file read/write helpers |
| `src/server/process-manager.ts` | Session spawning: dispatches via `platform/spawn-mechanism.ts` `selectMechanism` → `tmux` / `wt` / `wsl-tmux` / `headless`. All mechanisms forward `sessionFile`/`mode` uniformly via `sessionFlagsToArgv`. Windows headless uses `spawnDetached` primitive with `detached: true` (PGID-equivalent via libuv) and stderr-to-file-fd (crash-visible). |
| `src/shared/platform/detached-spawn.ts` | Three primitives: `spawnDetached` (libuv-correct detached defaults on every OS), `waitForNoCrash` (negative liveness — did it survive the window?), `waitForReady` (positive liveness — did a probe turn true?). All spawn sites with long-lived detached children delegate here. `SpawnDetachedOptions` exposes optional `stdoutFd` (defaults to `"ignore"`) and `logFd` (stderr, defaults to `"ignore"`); the bridge server-launcher sets both to the same fd for parity with the CLI. |
| `src/shared/platform/node-version-check.ts` | Pure predicate `isKnownBadNode(version)` + message builder `buildNodeVersionWarning(version)` for Node ranges affected by [nodejs/node#58515](https://github.com/nodejs/node/issues/58515) (22.0.0–22.17.x and 24.1.0–24.2.x). Consumed by `packages/server/src/cli.ts` (preflight warning), `packages/extension/src/server-launcher.ts` (ready-timeout hint), and `packages/electron/src/lib/doctor.ts` (Node runtime compatibility row). |
| `src/shared/platform/preload-fastify.ts` | Shared resolver `resolvePreloadFastifyPath(): string \| null` — returns absolute native path (never `file://`) to `packages/server/preload-fastify.cjs`. Used by all four server-spawn sites (cli daemon, bridge launcher, Electron lifecycle, restart-helper orchestrator) to inject `--require <preloadPath>` BEFORE `--import <jitiLoader>` so Fastify's CJS chain is cached before any ESM hook runs — sidesteps nodejs/node#58515 race-independently. See change: `preload-fastify-cjs`. |
| `packages/server/preload-fastify.cjs` | CommonJS preload file — loaded by Node's legacy synchronous CJS loader via `--require`. Populates `require.cache` with `fastify` + `@fastify/ajv-compiler` + `@fastify/ajv-compiler/standalone` so the ESM→CJS translator short-circuits on later imports. MUST stay `.cjs`; MUST NOT use ESM syntax. |
| `src/shared/platform/spawn-mechanism.ts` | `SpawnMechanism` enum (`tmux`/`wt`/`wsl-tmux`/`headless`) + pure `selectMechanism({ platform, userStrategy, electronMode, available })` selector. `buildWtArgs` builds argv for Windows Terminal `new-tab`. `sessionFlagsToArgv` is the uniform flag builder every mechanism MUST call. |
| `src/shared/platform/process-identify.ts` | `findPidByMarker` + `isProcessLikePi` + `isPiCommandLine` — consolidates the three `process.platform === "win32"` branches that previously lived inside `session-action-handler.ts`. Windows stubs are documented (command-line lookup goes via `headlessPidRegistry` instead). |
| `src/shared/platform/process.ts` | **Sole source of process termination + liveness primitives**: `isProcessAlive(pid)` (signal 0), `killProcess(pid, {timeoutMs})` (Windows `taskkill /F /T /PID`, POSIX `SIGTERM` → wait → `SIGKILL` tree kill), `killPidWithGroup(pid, sig)` (POSIX `kill(-pid, sig)`, Windows direct kill). Every `process.kill(...)` call outside this file is banned by `no-direct-process-kill.test.ts`. See change: route-kill-paths-through-platform. |
| `src/shared/platform/node-spawn.ts` | **Sole source of `node --import <loader> <entry>` argv construction**: `toFileUrl(pathOrUrl)` (idempotent path → file:// URL, handles Windows drive letters on POSIX hosts), `spawnNodeScript(opts)` (wraps both loader and entry positions as file:// URLs before delegating to `platform/exec.ts::spawn`). Every `spawn(process.execPath, ["--import", ...])` call outside this file with raw path arguments is banned by `no-raw-node-import.test.ts`. Fixes `ERR_UNSUPPORTED_ESM_URL_SCHEME` on non-C: Windows drives (e.g. `B:\`) where Node's drive-letter heuristic for entry-script paths has known gaps. See change: fix-windows-entry-script-url. |
| `src/shared/__tests__/no-raw-node-import.test.ts` | Repo-level lint: scans `packages/*/src/` (excluding `platform/node-spawn.ts` + `resolve-jiti.ts` + `__tests__/`) for `spawn(...)` argv with `"--import"` / `"--loader"` followed by raw identifiers not wrapped in `toFileUrl(...)` / `pathToFileURL(...)`. Mirrors `no-direct-process-kill.test.ts` pattern. |
| `src/shared/__tests__/no-direct-process-kill.test.ts` | Repo-level lint: scans `packages/*/src/` (excluding platform/ and `__tests__/`) for `process.kill(` calls and fails with file:line if any are found. Mirrors `no-direct-child-process.test.ts`. |
| `src/shared/__tests__/bootstrap/` | In-memory bootstrap resolution harness (memfs-backed). `harness.ts` (withFakeEnv + layer), `fixtures/` (managed/npm-g/electron/dev-monorepo/settings-json layouts), `assertions.ts` (snapshotTrail + snapshotSettingsDelta with `<HOME>` / `<NPM_ROOT>` normalization), `scenarios.ts` (1080-cell cube: platform × dash × pi × settings × env), `scenarios-skipped.ts` (bulk-skip manifest with documented reasons), `cube.test.ts` (fail-closed sweep), `families/*.test.ts` (30+ registered scenario cells across A-K). Run via `npm run test:bootstrap`. See change: bootstrap-resolution-harness. |
| `src/server/editor-registry.ts` | Detects available native editors (running processes + CLI) |
| `src/server/editor-manager.ts` | Lifecycle manager for code-server child processes (spawn, stop, idle, heartbeat) |
| `src/server/editor-proxy.ts` | Reverse proxy for `/editor/:id/*` to code-server instances |
| `src/server/editor-detection.ts` | Auto-detect code-server/openvscode-server binary on PATH |
| `src/server/routes/editor-routes.ts` | REST routes: editor start, stop, heartbeat, status, detect |
| `src/server/event-status-extraction.ts` | Extracts session status/tool updates from events (incl. flow metadata) |
| `src/server/headless-pid-registry.ts` | Maps headless child PIDs to session IDs |
| `src/server/auth.ts` | OAuth2 authentication: provider registry, JWT helpers, user allowlist |
| `src/server/provider-auth-handlers.ts` | Pi provider OAuth handlers (Anthropic, Codex, GitHub Copilot, Gemini CLI, Antigravity) |
| `src/server/provider-auth-storage.ts` | Read/write ~/.pi/agent/auth.json with lockfile for pi provider credentials |
| `src/server/routes/provider-auth-routes.ts` | REST routes: provider OAuth authorize/exchange/callback, device-code, API key CRUD |
| `src/server/routes/provider-routes.ts` | REST routes: custom LLM provider CRUD (`GET/PUT /api/providers`) + **`POST /api/providers/test`** connection probe (reuses `provider-probe.ts`). See change: `hot-reload-custom-providers` |
| `src/server/provider-probe.ts` | Pure per-API-type probe builders (`buildProbeRequest` for `openai-completions`/`openai-responses`/`anthropic-messages`/`google-generative-ai`) + `resolveProbeApiKey` (handles literal, `$ENV_VAR`, and `***` REDACTED sentinel via injected providers reader) + I/O-bearing `probeProvider` (8 s timeout, never echoes apiKey in error text, caps body excerpts at 500 chars). Used by the `/api/providers/test` route and shared with the bridge's discovery path |
| `src/extension/provider-register.ts` | Reads `~/.pi/agent/providers.json`, calls `pi.registerProvider()` with auto-discovered models, exports `reloadProviders(pi)` + `onProviderChanged(cb)`. `reloadProviders` diffs the current file against a module-level `lastRegistered` snapshot and applies add/remove/change via `registerEntry` / `pi.unregisterProvider`. Called from the bridge's `credentials_updated` handler BEFORE `modelRegistry.refresh()` so new providers appear in `/model` without a session restart. Every discovered model is enriched via `enrichModelMetadata(id, api, probe)` where `probe` wraps pi's `modelRegistry.find()` (captured from `ctx.modelRegistry` at the first `session_start` event; `model_select` is a fallback capture point) — this resolves accurate `contextWindow`, `maxTokens`, `reasoning`, `cost`, and `input` for catalog-known models (e.g., `proxy/cc/claude-opus-4-7` → 1M ctx / reasoning / Opus pricing) and falls back to api-appropriate defaults otherwise (`anthropic-messages` → 200k/64k, `google-generative-ai` → 1M/65k, `openai-completions` → 128k/16k). The fallback path keeps `input: ["text", "image"]` so pasted images reach vision-capable models without pi-ai's `downgradeUnsupportedImages` stripping them client-side; text-only models either ignore the image silently or return a 400 that the user sees. See changes: enrich-custom-provider-model-metadata, enable-image-input-custom-providers |
| `src/client/lib/providers-api.ts` | Client-side fetch helper: `testProvider({ name?, baseUrl, apiKey, api })` → structured `{ ok, status?, modelCount?, sample?, error? }`. Used by the **Test** button on the LLM Providers card |
| `src/client/components/ProviderAuthSection.tsx` | Settings section: OAuth login buttons, device-code modal, API key inputs |
| `src/server/auth-plugin.ts` | Fastify plugin: auth routes, onRequest hook, WS upgrade validation |
| `src/server/config-api.ts` | Config REST API: read (redacted), write (partial merge), secret preservation. `writeConfigPartial` auth-merge propagates `secret`, `providers`, `allowedUsers`, `bypassHosts`, `bypassUrls` (the last two added by change `fix-trusted-networks-no-oauth` — silently dropped before, breaking Trusted Networks saves for users without OAuth). |
| `src/client/components/SettingsPanel.tsx` | Settings UI: all dashboard config fields, grouped form, save to server |
| `src/client/hooks/useAuthStatus.ts` | Client auth status hook and login redirect helper |
| `src/server/localhost-guard.ts` | Network access guard: `createNetworkGuard` (loopback/trusted/authenticated), `isBypassedHost` (CIDR/wildcard/exact), netmask-to-CIDR helpers |
| `src/server/server-pid.ts` | PID file management for daemon mode |
| `src/client/components/ServerSelector.tsx` | Server selector dropdown showing persisted known servers. Availability probing runs **only on dropdown open** (once per open, not on mount, not on a timer, not while closed). Accepts `inFlightSwitchKey` to render a spinner on the entry being switched to. Unreachable entries are `disabled`, rendered with `opacity-50` + `cursor-not-allowed`, and clicks are no-ops. Reachable clicks delegate to the transactional staging-socket switch (see `server-switch.ts`). See change: safe-server-switch |
| `packages/client/src/lib/staging-socket.ts` | `openStagingSocket(url, {timeoutMs}): Promise<WebSocket>` — single-settle helper that resolves on first `OPEN`, rejects on error/close/timeout, and closes the socket on timeout to avoid leaks. Used by the transactional server-switch. |
| `packages/client/src/lib/server-switch.ts` | `performServerSwitch(target, deps)` — extracted two-phase transaction (stage → commit) from `App.tsx`'s `handleServerSwitch`. Guarantees the ordering `clearInMemoryState` → `setWsUrl` → `persistLastServer`, and never persists localStorage or clears state on staging failure. Fully unit-tested. |
| `packages/client/src/components/ConnectionStatusBanner.tsx` | Disconnection banner: appears only after the active WebSocket has been non-`OPEN` for &gt;3s continuously; hidden immediately on reconnect; suppressed during in-flight staging switch. Mounted above `<MobileShell>` in `App.tsx`. |
| `src/client/components/KnownServersSection.tsx` | Settings section: list/add/remove persisted known remote servers |
| `src/client/components/NetworkDiscoverySection.tsx` | Settings section: mDNS network scan with "Add" action and label prompt. When the scan finds zero servers (common — Wi-Fi AP isolation, mesh routers, VLANs, VPN, firewall), renders a diagnostic block listing failure causes plus an inline manual-add form that accepts a free-form host input parsed via `parseHostInput()`. Surfaces scan errors instead of swallowing them. See change: diagnose-empty-mdns-scan |
| `src/client/lib/parse-host-input.ts` | Pure helper `parseHostInput(input, defaultPort = 8000) → {host, port} \| null` accepting full URLs (`http://192.168.16.202:8000`), `host:port`, bare hostnames, and bracketed IPv6 (`[::1]:8000`). Rejects empty input, bare IPv6 (ambiguous with `host:port`), invalid ports, malformed URLs. 12 unit tests in `parse-host-input.test.ts`. See change: diagnose-empty-mdns-scan |
| `src/client/lib/known-servers-api.ts` | Client-side fetch helpers for known servers CRUD and discovery endpoints |
| `src/server/routes/known-servers-routes.ts` | REST routes: known servers CRUD, on-demand mDNS discovery scan |
| `src/server/terminal-manager.ts` | PTY lifecycle, ring buffer, spawn/attach/kill terminals |
| `src/server/terminal-gateway.ts` | Binary WebSocket upgrade handler for `/ws/terminal/:id` |
| `scripts/fix-pty-permissions.cjs` | Postinstall: fix node-pty spawn-helper execute permissions |
| `src/server/tunnel.ts` | Zrok tunnel with reserved shares for persistent URLs, binary detection, PID tracking, stale cleanup |
| `src/client/components/TunnelButton.tsx` | Unified tunnel/QR button — tunnel icon when not set up, QR icon when inactive, green QR icon when connected; opens QR dialog with disconnect/setup |
| `src/client/components/QrCodeDialog.tsx` | QR code dialog showing tunnel URL as scannable QR code with copy, disconnect, and setup buttons |
| `public/manifest.json` | PWA web app manifest for installability |
| `public/sw.js` | Minimal service worker for PWA installability |
| `src/client/components/ZrokInstallGuide.tsx` | OS-aware zrok installation guide view (macOS/Linux/Windows) |
| `src/server/cli.ts` | CLI entry point with subcommands (start/stop/restart/status); `findPortHolders` is cross-platform (netstat/taskkill on Windows, lsof on Unix) and `server.log` is opened append-mode with timestamped headers |
| `src/server/restart-helper.ts` | Cross-platform `/api/restart` orchestrator: spawns a detached `node -e` child using only Node built-ins (net, http) — no sh/lsof/curl dependency; exports pure `buildOrchestratorScript(params)` for testing |
| `src/shared/resolve-jiti.ts` | Resolves pi's jiti register hook as a `file://` URL (required for `node --import` on Windows); exports pure `buildJitiRegisterUrl(pkgJsonPath)` helper and `resolveJitiFromAnchor(anchorPath)` for managed-install/system-pi callers |
| `src/shared/platform/paths.ts` | OS-aware path primitives: `normalizePath`, `samePath` (filesystem-level equality), `parsePathInput` (picker input), `withTrailingSep`, `isFilesystemRoot`. All accept optional trailing `platform: NodeJS.Platform` for testability. Windows multi-drive invariant: A:\, B:\, C:\ never merge; bare `B:` input treated as drive root, not cwd-relative. Exported from `platform/index.ts` as `paths.*` namespace alongside `git.*`, `openspec.*`, `npm.*` |
| `src/client/lib/session-grouping.ts` | `inferPlatform(samples)` heuristic (backslash/drive-letter = Windows, leading `/` = POSIX) + `groupSessionsByDirectory` that uses `normalizePath`-keyed Maps so sessions group under their pinned folder across separator/case/trailing drift |
| `src/shared/platform/` | Unified cross-OS primitives (see `index.ts` barrel). Sub-modules: `exec.ts` (**the only module that imports `node:child_process`** — wraps `execSync`/`exec`/`execFile`/`spawn`/`spawnSync` with `windowsHide: true` by default; enforced by `no-direct-child-process.test.ts`), `runner.ts` (the Recipe engine — `run(recipe, input)` resolves binaries via `ToolResolver`, applies timeout / tolerate / error normalization, returns `Result<T>`), `git.ts` / `openspec.ts` / `npm.ts` (Recipe-based tool modules — typed functions like `git.diff(...)`, `openspec.list(...)`, `npm.rootGlobal()` that never touch `child_process` or `process.platform`), `binary-lookup.ts` (`where`/`which`, `.cmd` ext, `ToolResolver` class), `process.ts` (`findPortHolders`, `killProcess`, `isProcessAlive`, `killPidWithGroup`, `parseNetstatListeners`), `process-scan.ts` (`isProcessRunning` via pgrep/tasklist, `parseEtime`), `shell.ts` (`detectShell` for SHELL/COMSPEC, `getTerminalEnvHints`), `commands.ts` (`openBrowser`, `isVirtualMachine`). All exported helpers that depend on OS take an optional `platform: NodeJS.Platform` parameter so tests can exercise both branches without mutating `process.platform`. See changes: consolidate-platform-handlers, platform-command-executor. |
| `src/shared/rest-api.ts` | REST API type definitions |
| `scripts/reload-all.sh` | Build bridge + reload all pi sessions |
| `scripts/sync-versions.js` | Post-bump release helper. Reads every workspace `package.json`, enforces lockstep versions, rewrites every inter-package dep specifier (e.g. `"@blackbelt-technology/pi-dashboard-shared": "^<ver>"`) to the current bumped version. Called by `release-cut` skill AND by `.github/workflows/publish.yml` (defensively) between `npm version -ws` and `npm run build`. Required because the npm CLI does not implement the pnpm/yarn `workspace:` protocol — we use plain semver ranges and sync them at bump time. Cross-ref specifiers use plain `"^<ver>"`; `packages/electron` is `"private": true` so `npm publish -ws` skips it automatically. |
| `src/client/components/PiResourcesView.tsx` | Content area view for browsing pi extensions, skills, and prompts (with Installed/Packages tabs) |
| `src/client/components/PackageBrowser.tsx` | Reusable inline package browser: npm search, type filters, install/uninstall, manual URL input |
| `src/client/components/PackageCard.tsx` | Package card with type badges, downloads, install/uninstall actions |
| `src/client/components/PackageReadmeDialog.tsx` | Dialog overlay showing package README with install/uninstall action |
| `src/client/components/PackageInstallConfirmDialog.tsx` | Confirmation dialog before package install (name, source, scope) |
| `src/client/hooks/usePackageSearch.ts` | Debounced fetch hook for `/api/packages/search` |
| `src/client/hooks/useInstalledPackages.ts` | Fetch hook for `/api/packages/installed` |
| `src/client/hooks/useRecommendedExtensions.ts` | Fetch hook for `/api/packages/recommended`; auto-refreshes on `package_operation_complete` |
| `src/client/components/RecommendedExtensions.tsx` | Curated-recommended-extensions card grid, rendered above search in Packages tab |
| `src/client/components/MissingRequiredBanner.tsx` | Top-of-page banner when any `required` recommended extension is missing from `~/.pi/agent/settings.json` `packages[]` |
| `src/shared/recommended-extensions.ts` | Static `RECOMMENDED_EXTENSIONS` manifest (pi-anthropic-messages, @tintinweb/pi-subagents, pi-flows, pi-web-access, pi-agent-browser); enriched server-side with live description/version and installed/active cross-reference |
| `src/server/routes/recommended-routes.ts` | `GET /api/packages/recommended` — enrichment + 60s cache, invalidated on successful install/remove/update |
| `src/client/hooks/usePackageOperations.ts` | Thin React subscriber over the singleton `packageQueue`. Public API (`operation`, `install/remove/update`, `clearOperation`) preserved for backwards-compat with `PackageBrowser`, `RecommendedExtensions`, `MissingRequiredBanner`, `PiResourcesView`, `SettingsPanel`. Adds `statusFor(source)` (`idle\|queued\|running\|success\|error`), `messageFor(source)`, `queueDepth` for richer per-row state. The single `pi-package-event` window listener now lives inside `package-queue`, not the hook. See change: package-install-queue. |
| `src/client/lib/package-queue.ts` | Module-level singleton FIFO queue scheduling pi package install/remove/update operations across the entire client. Owns the running op (at most one) plus a queue keyed by `source`, the per-source status map, and the *one* `pi-package-event` window listener that advances the queue on `package_operation_complete`. Dedup on duplicate enqueue, retry-once on HTTP 409 `PackageOperationBusyError` (500 ms backoff), success auto-clear after 3 s, sticky error until next enqueue. Exports `__resetForTests()`. See change: package-install-queue. |
| `src/client/hooks/usePiResources.ts` | Fetch + 30s polling hook for pi resources API |
| `src/client/components/MarkdownPreviewView.tsx` | Generic reusable markdown preview with back button, tabs, loading/error states |
| `src/client/hooks/useOpenSpecReader.ts` | Maps OpenSpec artifacts to file paths, fetches content, concatenates specs |
| `src/client/components/interactive-renderers/` | Registry + renderers for interactive UI dialogs (confirm, select, multiselect, input, editor, notify) |
| `src/shared/terminal-types.ts` | TerminalSession type and control messages |
| `src/client/components/TerminalView.tsx` | xterm.js terminal emulator wrapper with keep-alive |
| `src/client/components/TerminalsView.tsx` | Tabbed terminal container per folder (tab bar, keep-alive, rename) |
| `src/client/components/EditorView.tsx` | code-server iframe embedding with lazy start and heartbeat |
| `src/client/components/EditorInstallGuide.tsx` | Platform-specific code-server installation guide |
| `src/client/components/FolderActionBar.tsx` | Unified action bar per folder: +Session, +Terminal, Terminals(N), Editor, Zed, Pi Resources |
| `src/client/lib/folder-encoding.ts` | Base64url encode/decode for folder paths in URL routes |
| `src/shared/editor-types.ts` | Editor instance types shared across components |
| `src/client/components/TerminalCard.tsx` | Sidebar card for terminal sessions (cyan accent) |
| `src/client/App.tsx` | React app with WebSocket integration. Owns per-session ephemeral input state alongside `sessionStates`: `drafts: Map<sid, string>` (persisted to `localStorage`, see `chat-input-draft-and-history`) and `pendingImagesMap: Map<sid, ImageContent[]>` (in-memory only, NOT persisted — see change: lift-pending-images-to-app). Both are passed into `<CommandInput>` as controlled props (`draft`/`onDraftChange`, `images`/`onImagesChange`) so they survive content-area route changes that unmount the chat panel and don't leak across session switches. `wrappedHandleSend` clears both via `clearDraftForSession` + `clearImagesForSession` after a successful send. Module-level `EMPTY_IMAGES = Object.freeze([])` provides a stable empty-array reference so sessions with no pending images don't trigger child re-renders. |
| `src/client/components/MobileShell.tsx` | Two-panel mobile shell with slide transitions and swipe-back |
| `src/client/components/MobileActionMenu.tsx` | Kebab menu for session actions on mobile (includes OpenSpec commands) |
| `src/client/components/MobileOverlay.tsx` | Hamburger button and sidebar overlay for mobile |
| `src/client/components/SessionHeader.tsx` | Session header with OpenSpec attach/detach, flow launcher, MobileAttachButton |
| `src/client/hooks/useSwipeBack.ts` | iOS-style left-edge swipe-back gesture (40px edge zone, document-level listeners) |
| `src/client/components/ChatView.tsx` | Chat message view with scroll-lock: pauses auto-scroll when user scrolls up, floating scroll-to-bottom button, per-session scroll position persistence |
| `src/client/components/CommandInput.tsx` | Chat textarea + autocomplete + controlled draft / history / images. Props: `sessionId`, `draft`, `onDraftChange` (draft lifted to App.tsx so it survives navigation), `history` (newest-first user prompts for this session), `images`, `onImagesChange` (pending pasted images lifted to App.tsx as `pendingImagesMap` so they survive route takeover and don't leak across sessions). `ArrowUp`/`ArrowDown` walk history bash-style (only when no dropdown is open AND caret is on first/last line); `Escape` during history mode restores the in-progress draft. See changes: chat-input-draft-and-history, lift-pending-images-to-app |
| `src/client/lib/draft-storage.ts` | Per-session chat input draft persistence helpers: `readAllDrafts()`, `writeDraft(sid, text)`, `deleteDraft(sid)`, key prefix `chat-draft:`. Wraps `localStorage` in try/catch (private-mode / quota safe). |
| `src/client/lib/message-history.ts` | `extractUserPromptHistory(messages)` — pure filter+dedup over `ChatMessage[]` returning newest-first user prompts with consecutive duplicates collapsed. Drives `ArrowUp`/`ArrowDown` history recall in `CommandInput`. |
| `src/client/lib/mobile-depth.ts` | Pure function computing MobileShell depth from route state |
| `src/client/hooks/useZoomPan.ts` | Reusable zoom/pan hook (wheel, drag, pinch, buttons) |
| `src/client/hooks/useMessageHandler.ts` | WebSocket message dispatch hook (extracted from App.tsx) |
| `src/client/hooks/useSessionActions.ts` | Session action callbacks hook (send, abort, resume, spawn, etc.) |
| `src/client/hooks/useOpenSpecActions.ts` | OpenSpec action callbacks hook (refresh, archive, attach, detach); calls `clearAllContentViews` before opening preview |
| `src/client/hooks/useContentViews.ts` | Content view state + fetch (pi resources, readme, file preview); `clearAll()` resets all hook-owned states; `onBeforeOpen` callback for cross-component clearing |
| `src/client/lib/event-reducer.ts` | Event-sourced state reducer (delegates flow events to flow-reducer); extracts LLM errors from `agent_end` into `lastError` |
| `src/client/hooks/usePendingPromptTimeout.ts` | 30-second safety timeout for stuck `pendingPrompt` spinners |
| `src/client/lib/flow-reducer.ts` | Flow state machine: all flow_* event handling |
| `src/client/lib/session-grouping.ts` | Pure functions: group, sort, filter sessions by directory |
| `src/client/lib/truncate-path.ts` | Middle-truncation utility for filesystem paths |
| `src/server/resolve-path.ts` | Safe realpath resolution (symlink handling) |
| `src/client/components/ElapsedBadge.tsx` | Reusable elapsed time badge: static duration or live ticking counter |
| `src/client/components/FlowDashboard.tsx` | Sticky flow card grid above ChatView with abort/auto controls, mobile collapse |
| `src/client/components/FlowAgentCard.tsx` | Individual agent card: status, tools, tokens, duration, loop badge |
| `src/client/components/FlowAgentDetail.tsx` | Full content-area agent detail: tool history, assistant text, thinking |
| `src/client/components/FlowSummary.tsx` | Post-completion summary: per-agent status, file counts, dismiss |
| `src/client/components/FlowActivityBadge.tsx` | Session card badge showing flow name and agent progress |
| `src/client/components/FlowLaunchDialog.tsx` | Task input dialog for launching a flow |
| `src/client/components/SessionFlowActions.tsx` | Session card flow launcher: searchable picker + new flow button |
| `src/client/components/SearchableSelectDialog.tsx` | Shared searchable select dialog (keyboard nav, filtering, badges) |
| `src/shared/diff-types.ts` | Types for session file diff API (FileChangeEvent, FileDiffEntry, SessionDiffResponse) |
| `src/server/session-diff.ts` | Server-side event scanning + git diff extraction for session file changes |
| `src/client/components/FileDiffView.tsx` | Split-pane container: file tree + diff panel, content-area view |
| `src/client/components/DiffFileTree.tsx` | Two-level file tree with change events, timestamps, context messages |
| `src/client/components/DiffPanel.tsx` | Rich diff rendering via @git-diff-view/react with syntax highlighting |
| `src/client/hooks/useSessionDiff.ts` | Fetch hook for `/api/session-diff` endpoint |
| `src/client/lib/diff-tree.ts` | Directory tree builder from flat file paths |
| `src/server/session-api.ts` | REST wrappers for WebSocket-only session operations (prompt, abort, spawn, resume, etc.) |
| `.pi/skills/pi-dashboard/SKILL.md` | Bundled skill: monitor and control the dashboard from any pi session |
| `.pi/skills/pi-dashboard/references/api-reference.md` | Complete REST API reference for the skill |
| `.pi/skills/pi-dashboard/references/recipes.md` | Multi-step orchestration recipes |
| `.pi/skills/pi-dashboard/scripts/dashboard-api.sh` | Helper script with port auto-detection and auth |

| `.pi/skills/spec-coherence-check/SKILL.md` | Skill: sweep proposals for staleness, conflicts, obsolescence against codebase |
| `.pi/skills/spec-coherence-check/references/proposal-queue-schema.md` | JSON schema for `.pi/proposal-queue.json` |
| `.pi/skills/code-review/SKILL.md` | Skill: comprehensive code review with severity labels, four-phase process, language-specific guides |
| `.pi/skills/code-review/references/` | On-demand language guides (React, TypeScript, Vue, Rust, Go, Java, Python, C/C++, CSS, Qt) + architecture/performance/security reviews |
| `.pi/skills/nano-banana-imagegen/SKILL.md` | Skill: AI image generation/editing via Google Gemini (nano-banana CLI) |
| `.pi/skills/nano-banana-imagegen/references/` | Prompting guide, example prompts (headers, icons, illustrations, photography) |
| `.pi/skills/browser-visual-debug/SKILL.md` | Skill: visual debugging with a real browser (screenshots, interaction, responsive testing) via pi-agent-browser |
| `.pi/skills/browser-visual-debug/references/` | Dashboard recipes, responsive testing presets, agent-browser commands cheatsheet |
| `.pi/skills/browser-visual-debug/scripts/detect-dashboard.sh` | Auto-detect dashboard URL, mode, and Vite dev server status |
| `packages/electron/src/main.ts` | Electron main process: single-instance, wizard, server launch, loading page, tray |
| `packages/electron/src/lib/server-lifecycle.ts` | Health check → tsx binary spawn (inlined config/health, no shared pkg imports) |
| `packages/server/src/extension-register.ts` | Auto-registers bundled bridge extension in pi's global settings on startup |
| `packages/electron/src/lib/doctor.ts` | Doctor diagnostic: checks all binaries, versions, server status, offers setup |
| `packages/electron/src/lib/app-menu.ts` | App menu with About dialog and Doctor on all platforms |
| `packages/electron/src/lib/tray.ts` | System tray with platform-specific icons (template on macOS, ico/png on Win/Linux) |
| `packages/electron/src/lib/dependency-installer.ts` | Async npm install of pi, openspec, tsx into ~/.pi-dashboard/ using bundled Node |
| `packages/electron/src/lib/dependency-detector.ts` | Detects pi, openspec, Node.js on system PATH and managed install |
| `packages/electron/src/lib/bundled-node.ts` | Resolves bundled Node.js/npm paths in Electron resources |
| `packages/electron/src/lib/wizard-window.ts` | First-run setup wizard window with preload bridge |
| `packages/electron/forge.config.ts` | Electron Forge config: DMG, DEB, AppImage, NSIS makers, icon, extraResources |
| `packages/electron/scripts/build-installer.sh` | Build script: native + Docker cross-platform (--linux, --windows, --all) |
| `packages/electron/scripts/docker-make.sh` | Docker entrypoint: platform-aware native module handling, ZIP for Windows |
| `packages/electron/scripts/Dockerfile.build` | Docker image for cross-platform builds (node:22-bookworm-slim + build tools) |
| `packages/electron/scripts/bundle-server.sh` | Bundles dashboard server source + deps into resources/server/ (--source-only for cross-builds) |
| `packages/electron/offline-packages.json` | Pinned versions of pi-coding-agent / openspec / tsx that get bundled as an offline npm cacache per release (see change: `electron-offline-bundled-packages`) |
| `packages/electron/scripts/bundle-offline-packages.sh` | Build-time script that runs `npm install --os=<os> --cpu=<cpu> --ignore-scripts` for the pinned versions, tars the resulting `_cacache/` (pax format — ustar is too narrow), writes `manifest.json` with SHA-256, and enforces a 100 MB hard budget. Opt-in via `BUNDLE_OFFLINE_PACKAGES=1`. |
| `packages/electron/resources/offline-packages/manifest.json` | Offline-cache manifest (`{bundledAt, targetPlatform, tarball, tarballBytes, sha256, packages}`). Consumed at runtime by `dependency-installer.ts` via `resolveOfflinePackages()`. |
| `packages/electron/resources/offline-packages/npm-cache.tar.gz` | gzipped npm cacache used by the first-run offline install. Extracted to `~/.pi-dashboard/.offline-cache/`, verified by SHA-256, consumed by `npm install --offline`, then deleted to reclaim ~140 MB. |
| `packages/electron/src/lib/offline-packages.ts` | Pure helpers: `parseOfflineManifest`, `resolveOfflinePackages`, `fileSha256`, `extractOfflineCache`, `buildOfflineInstallArgs`, `selectInstallStrategy`. 19 unit tests in `packages/electron/src/__tests__/offline-packages.test.ts`. |
| `packages/electron/scripts/bundle-recommended-extensions.sh` | Opt-in (via `BUNDLE_RECOMMENDED_EXTENSIONS=1`) build-time bundler that clones each id in `BUNDLED_EXTENSION_IDS` into `packages/electron/resources/bundled-extensions/<id>/`, records `.bundled-sha`, enforces SPDX allowlist (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC) and a 15 MB total size budget. See change: bundle-first-party-extensions. |
| `packages/electron/src/lib/dependency-installer.ts` → `installBundledExtensions` | First-run activation of pre-bundled extensions. Copies `<resourcesPath>/bundled-extensions/<id>/` into pi's git cache (`~/.pi/agent/git/<host>/<path>/`), runs `npm install --omit=dev` if runtime deps declared, then calls `manager.addSourceToSettings(gitUrl)` + `settingsManager.flush()`. Returns activated ids so `installRecommendedExtensions` can skip them with `output: "Already installed (bundled)"`. |
| `packages/electron/src/lib/wizard-badge.ts` | Pure `classifyProgressBadge(output)` helper (`bundled` / `system` / null) shared between wizard HTML inline JS and unit tests. |
| `packages/shared/src/recommended-extensions.ts` → `BUNDLED_EXTENSION_IDS` | Single source of truth for which recommended ids ship bundled in the Electron installer. Currently `["pi-anthropic-messages", "pi-flows"]` (see design.md for pi-flows license blocker). |
| `packages/electron/scripts/docker-make.sh` | Docker entrypoint: bundles server, installs native deps, runs Forge make |
| `packages/electron/scripts/Dockerfile.build` | Docker image for cross-platform builds (node:22-bookworm-slim + build tools) |
| `packages/electron/scripts/test-server-launch.sh` | Docker-based test for server launch on clean Linux |
| `packages/electron/scripts/test-electron-install.sh` | Full e2e Docker test: install, wizard, server launch, health check |
| `packages/electron/scripts/test-electron-install-inner.sh` | Inner test script run inside Docker container |
| `packages/electron/resources/icon.png` | Master 1024×1024 app icon (π on dark navy) |
| `.github/workflows/publish.yml` | CI: builds DMG (macOS), DEB+AppImage (Linux), NSIS+ZIP+portable (Windows) on native runners; publishes npm + GitHub Release. **Two triggers**: (a) push of any `v*` tag (the original path — release-cut skill / hand tag), (b) `workflow_dispatch` from the GitHub Actions UI with a single required `version` input (e.g. `"0.4.1"`). The `prepare` job branches on `github.event_name`: tag-push extracts the version from `GITHUB_REF_NAME`; dispatch validates the input as semver, checks tag uniqueness on origin, bumps every workspace `package.json` via `npm version -ws`, syncs cross-ref specifiers via `scripts/sync-versions.js`, promotes `## [Unreleased]` to a dated `## [<version>]` section in `CHANGELOG.md`, commits + tags + pushes the branch. The publish, electron, and github-release jobs all `needs: prepare` and check out `ref: ${{ needs.prepare.outputs.tag }}` so both trigger paths publish the same tree. |

## Build & Restart Workflow

The dashboard has three components that need rebuilding depending on what changed:

### After bridge extension changes (`src/extension/`)
Reload all connected pi sessions to pick up the new bridge code:
```bash
npm run reload          # Reload all pi sessions
npm run reload:check    # Type-check first, then reload
```

### After server changes (`src/server/`, `src/shared/`)
Restart the dashboard server. The server runs TypeScript directly via jiti (pi's TypeScript loader), so no separate build step is needed — just restart:
```bash
# Graceful restart via API (preserves current dev/prod mode)
curl -X POST http://localhost:8000/api/restart

# Or via CLI
pi-dashboard restart              # production mode
pi-dashboard restart --dev        # dev mode

# Manual stop + start
pi-dashboard stop && pi-dashboard start
pi-dashboard stop && pi-dashboard start --dev
```

### After client changes (`src/client/`)
- **Dev mode**: Vite hot-reloads automatically, no action needed. Start with `npm run dev`.
- **Production mode**: Rebuild the client and restart the server:
  ```bash
  npm run build
  curl -X POST http://localhost:8000/api/restart
  ```

### After OpenSpec apply finishes (full rebuild)
When an openspec-apply-change skill completes implementation, do a full rebuild and restart:
```bash
npm run build
curl -X POST http://localhost:8000/api/restart
npm run reload
```

### Check current mode
```bash
curl -s http://localhost:8000/api/health | jq .mode
# Returns "dev" or "production"
```

### Dev mode with production fallback
In `--dev` mode, the server proxies to Vite for HMR. If Vite is not running, it **automatically falls back** to serving the production build from `dist/client/`. This means `pi-dashboard start --dev` always works — no 502 errors.

### Fault-tolerant restart
- `POST /api/restart` waits for the old server to exit, starts a new one, and verifies health
- `POST /api/restart` with body `{"dev": true}` or `{"dev": false}` switches modes
- `pi-dashboard stop` kills stale processes holding the ports (via `lsof`), not just the PID file

## OpenSpec Conventions

When creating OpenSpec change artifacts, always place them at `openspec/changes/<name>/` — never nest under subdirectories like `active/` or `archive/`. Prefer using `openspec change new <name>` CLI to scaffold the directory structure correctly.

## Diagram Style

When creating diagrams, use Mermaid syntax (```mermaid blocks) instead of ASCII box drawings. This applies to explore mode, design documents, and all other artifacts.

## Code Instructions

1. First think through the problem, read the codebase for relevant files.
2. Before you make any major changes, check in with me and I will verify the plan.
3. Please every step of the way just give me a high level explanation of what changes you made.
4. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
5. Maintain a documentation file that describes how the architecture of the app works inside and out.
6. Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.
7. For implementation use TDD (Test-Driven Development): write or update tests first to define the expected behaviour, verify they fail, then write the minimal implementation to make them pass.
8. Use DRY (Don't Repeat Yourself): extract reusable logic into separate classes, utilities, or components. If the same pattern appears in multiple places, refactor it into a shared helper.

## Document changes

When an implementation is ready, update AGENTS.md, README.md, and docs/architecture.md. AGENTS.md contains instructions for AI agents, key files, and commands needed to build and operate. README.md contains end-user and developer documentation with CI badges, prerequisites, configuration, and project structure. docs/architecture.md contains detailed data flows, persistence model, reconnection logic, and configuration reference.
