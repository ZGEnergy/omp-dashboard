# DOX — packages/client/src/lib

Files in this directory. One row per source file.

| File | Purpose |
|------|---------|
| `api-context.ts` | React context + module-level store for HTTP API base URL. → see `api-context.ts.AGENTS.md` |
| `auto-init-worktree.ts` | Fire-and-forget post-spawn worktree auto-init. Exports `maybeAutoInitWorktreeOnSpawn(cwd)`; no-op unless… → see `auto-init-worktree.ts.AGENTS.md` |
| `back-target.ts` | Pure `computeBackTarget(route): string \| null` — maps route to parent route one shell depth up. → see `back-target.ts.AGENTS.md` |
| `browse-api.ts` | Client-side browse API helper for PathPicker → see `browse-api.ts.AGENTS.md` |
| `chat-selection-copy.ts` | Pure `buildSelectionClipboardText(range, container)`: rebuilds clipboard text for a transcript `copy`. → see `chat-selection-copy.ts.AGENTS.md` |
| `chat-virtual-rows.ts` | Pure helpers for the windowed (TanStack Virtual) transcript. → see `chat-virtual-rows.ts.AGENTS.md` |
| `clipboard.ts` | `copyText(text)`: `navigator.clipboard.writeText` with hidden-textarea + `execCommand` fallback for non-secure (HTTP tunnel) contexts. See change: register-bash-and-tool-install-help. |
| `collapse-retried-errors.ts` | ChatView duplicate-collapse helpers. `findRetriedErrorIds` flags failed `toolResult` superseded by successful… → see `collapse-retried-errors.ts.AGENTS.md` |
| `command-filter.ts` | Exports `filterCommands(commands, filter)` — case-insensitive substring match on `CommandInfo.name` or `description`. Returns input unchanged when filter empty. |
| `context-gradient.ts` | Exports `contextGradientColor(percent)` — HSL interpolation green(0%)→yellow(50%)→red(100%) for context-usage bar. Clamps 0–100. |
| `context-usage.ts` | Exports `buildContextUsageMap(sessionStates, sessions): Map<string, ContextUsageInfo>`. → see `context-usage.ts.AGENTS.md` |
| `cwd-visibility.ts` | Pure `isVisibleCwd(cwd, {pinnedDirectories, workspaces, sessions, platform?})`. → see `cwd-visibility.ts.AGENTS.md` |
| `diff-tree.ts` | Builds directory tree from flat `FileDiffEntry[]`. Exports `TreeNode`, `buildFileTree` (sorts dirs-first alpha, collapses single-child dir chains). Used by diff view. |
| `DisplayPrefsContext.tsx` | React context exposing `{ global: DisplayPrefs|undefined, getSessionOverride(id):… → see `DisplayPrefsContext.tsx.AGENTS.md` |
| `doctor-api.ts` | Typed `fetchDoctorReport(): Promise<DoctorReport>` against `/api/doctor` via auth-aware fetch wrapper. |
| `document-title.ts` | Exports `buildDocumentTitle(session, folderCwd?)` — derives `<projectDir>` from `cwd` last segment, composes `"<name> (<dir>) — PI Dashboard"` title. Falls back to folder cwd or `"PI Dashboard"`. |
| `draft-storage.ts` | Per-session chat-input draft persistence in `localStorage` under `chat-draft:<sessionId>`. → see `draft-storage.ts.AGENTS.md` |
| `editor-api.ts` | Client editor detection + open-editor API. Exports `isLocalhost`, `DetectedEditor`, `fetchEditors(cwd)` (GET… → see `editor-api.ts.AGENTS.md` |
| `editor-pane-state.ts` | Per-session pane state + localStorage persistence under `pi-dashboard:editor-pane:<sessionId>`. → see `editor-pane-state.ts.AGENTS.md` |
| `event-reducer.ts` | `ChatMessage` gains `view?: ViewTarget` field. View rows produced by server-side `ViewMessageStore` are… → see `event-reducer.ts.AGENTS.md` |
| `extract-urls.ts` | Pure `extractRecentUrls(messages: ChatMessage[]): string[]`. → see `extract-urls.ts.AGENTS.md` |
| `tree-visible.ts` | `useTreeVisible(sessionId)` + load/save. Persists editor-pane rail show/hide boolean under… → see `tree-visible.ts.AGENTS.md` |
| `live-server-api.ts` | Client helper for live-server REST. `listLiveServers()`, `startLiveServer({host,port,label})` (pre-validates… → see `live-server-api.ts.AGENTS.md` |
| `file-icon.ts` | `fileIcon(pathOrName)` → `{ iconPath, colorClass }`. Extension-keyed `@mdi/js` glyph + accent color for… → see `file-icon.ts.AGENTS.md` |
| `fetch-json.ts` | Shared client transport guard. Exports `ApiHttpError` class (`status`, `statusText`, `contentType`,… → see `fetch-json.ts.AGENTS.md` |
| `folder-encoding.ts` | Base64url encode/decode for cwd paths in URL routes. Exports `encodeFolderPath(cwd)` (UTF-8 safe, URL-safe… → see `folder-encoding.ts.AGENTS.md` |
| `format.ts` | Display formatting utils. `formatTokens` (12400→"12.4k"), `formatMessageTime` (today/yesterday/weekday/full-date HH:MM:SS), `formatRelativeTime` (ms→"3m"/"2h"/"1d"). |
| `gateway-api.ts` | Client fetch helpers for the Gateway surfaces. Exports `getBlockEvents`, `runEnrollStep`, `getConfig`,… → see `gateway-api.ts.AGENTS.md` |
| `gateway-config-ops.ts` | Pure config-mutation helpers for the Gateway UI. Exports `isSecureBaseUrl`, `appendPublicBaseUrl`… → see `gateway-config-ops.ts.AGENTS.md` |
| `gateway-endpoints.ts` | Two-QR transport split + endpoints fetch. Exports `isPairingEligible` (scheme-authoritative, tls tag… → see `gateway-endpoints.ts.AGENTS.md` |
| `gateway-providers.ts` | Client provider matrix metadata. Exports `GatewayProviderId`, `GATEWAY_PROVIDERS` (zrok/ngrok public;… → see `gateway-providers.ts.AGENTS.md` |
| `gateway-setup.ts` | Per-provider setup-step model (D3 taxonomy). Exports `SetupStepKind`… → see `gateway-setup.ts.AGENTS.md` |
| `git-status-cache.ts` | Per-cwd git-status cache for the on-demand delivery half. → see `git-status-cache.ts.AGENTS.md` |
| `git-api.ts` | Client git/worktree API helpers for BranchPicker + WorktreeSpawnDialog. → see `git-api.ts.AGENTS.md` |
| `grep-api.ts` | `grepContents(cwd,q,regex)` → `GET /api/grep`. Returns `GrepMatch[]`. Best-effort. See change: split-editor-workspace. |
| `group-tool-bursts.ts` | Temporal burst grouping — OUTER pass over `groupConsecutiveToolCalls`. → see `group-tool-bursts.ts.AGENTS.md` |
| `group-tool-calls.ts` | Collapses repetitive retry loops in chat view. Exports `ToolCallGroup`, `ChatItem`,… → see `group-tool-calls.ts.AGENTS.md` |
| `history-back.ts` | Exports `goBack(navigate, currentRoute, tracker)` — depth-aware mobile/overlay back action. → see `history-back.ts.AGENTS.md` |
| `i18n.tsx` | i18n provider + `t()` translator. Exports `Language` ("en"|"zh-CN"), `LANGUAGE_OPTIONS`, `t(key, vars?,… → see `i18n.tsx.AGENTS.md` |
| `installed-list-helpers.ts` | Pure client helpers for installed-packages UI. Exports `computeDestIdentity(source)` — mirrors server… → see `installed-list-helpers.ts.AGENTS.md` |
| `known-servers-api.ts` | Client fetch helpers for known-servers management. Exports `listKnownServers`, `addKnownServer(host, port,… → see `known-servers-api.ts.AGENTS.md` |
| `lineDelta.ts` | Per-turn +/- line-delta derivation from Edit/Write events (jsdiff `structuredPatch`, no git). → see `lineDelta.ts.AGENTS.md` |
| `link-origin.ts` | Pure browser-safe link path resolution. Exports `resolveLinkOrigin(cwd,path,absolute)`,… → see `link-origin.ts.AGENTS.md` |
| `linkify-tool-output.ts` | Pure tokeniser. Exports `tokenize(text): Token[]`, `MAX_LINKS=5000`. → see `linkify-tool-output.ts.AGENTS.md` |
| `loading-history.ts` | Exports `clearLoadingHistory(setLoadingHistory, timersRef, id)` + `rearmLoadingHistory(..., ms)` helpers +… → see `loading-history.ts.AGENTS.md` |
| `mdi-icon-lookup.ts` | Extension UI System icon resolver. Exports `resolveMdiIcon(key)` — maps `"mdiCheckCircle"`-style key to… → see `mdi-icon-lookup.ts.AGENTS.md` |
| `message-history.ts` | Exports `extractUserPromptHistory(messages)` — collects `role==="user"` prompts for ArrowUp recall; condenses… → see `message-history.ts.AGENTS.md` |
| `paired-devices-api.ts` | Client fetch helpers for the paired-devices registry. Exports `listPairedDevices()`,… → see `paired-devices-api.ts.AGENTS.md` |
| `message-queue.ts` | Offline outgoing message queue. Exports `MessageQueue` class — `setSendFunction`, `enqueue` (caps at 10,… → see `message-queue.ts.AGENTS.md` |
| `mobile-depth.ts` | Computes `MobileShell` nav depth from route-match flags. Exports `MobileDepthInput`, `getMobileDepth(input)`… → see `mobile-depth.ts.AGENTS.md` |
| `model-proxy-api.ts` | Fetch helpers for `/api/model-proxy/api-keys` endpoints. Exports `ProxyApiKeyEntry`, `ApiKeysListResult`,… → see `model-proxy-api.ts.AGENTS.md` |
| `monaco-theme.ts` | `buildMonacoTheme(themeName, resolved)` derives Monaco `IStandaloneThemeData` from `THEMES` token map. → see `monaco-theme.ts.AGENTS.md` |
| `move-tracker.ts` | In-flight package-move state tracker, keyed by `moveId`. Exports `MovePhase`, `MoveState`, `moveTracker`… → see `move-tracker.ts.AGENTS.md` |
| `nav-tracker.ts` | In-app depth-tagged nav stack. `Array<{url, depth}>` via `routeDepth`. → see `nav-tracker.ts.AGENTS.md` |
| `openspec-board-order.ts` | Pure per-change ordering helpers. `defaultChangeSort` orders in-progress → others → complete, then name. → see `openspec-board-order.ts.AGENTS.md` |
| `openspec-board-worktree.ts` | `deriveWorktreeProgress(session, changeName, mainDone, openspecMap)`. Returns null for non-worktree session. → see `openspec-board-worktree.ts.AGENTS.md` |
| `openspec-config-api.ts` | Fetch helpers for OpenSpec config + update endpoints. Adds saveOpenSpecConfig(), runOpenSpecUpdate(), fetchUpdateStatus() + OpenSpecUpdateStatus types. See change: add-openspec-profile-settings. |
| `openspec-group-palette.ts` | Curated color palette constant + resolver for OpenSpec group swatches. See change: add-openspec-change-grouping. |
| `openspec-groups-api.ts` | Fetch helpers for `/api/openspec/groups` CRUD + assignment endpoints. → see `openspec-groups-api.ts.AGENTS.md` |
| `openspec-tasks-api.ts` | Pure fetch wrappers for `/api/openspec/tasks` endpoints. Exports `OpenSpecTask`, `TasksPayload`,… → see `openspec-tasks-api.ts.AGENTS.md` |
| `device-auth.ts` | Paired-device bearer store + consumption for the browser (web-client analogue of shell `connect.ts`). → see `device-auth.ts.AGENTS.md` |
| `pair-protocol.ts` | Browser device-pairing wire helpers (port of shell `protocol.ts` handshake bits used by `PairLanding`). → see `pair-protocol.ts.AGENTS.md` |
| `pairing-api.ts` | Operator pairing fetch helpers. Exports `getPairPayload()` (`GET /api/pair/payload`;… → see `pairing-api.ts.AGENTS.md` |
| `pairing-qr.ts` | Pairing payload ↔ QR/copy-string codecs. Exports `encodePayloadString` (bare `pi:pair:v1.<b64>` copy-string,… → see `pairing-qr.ts.AGENTS.md` |
| `package-classifier.ts` | Pure helpers for unified packages settings UI. Exports `SourceType` (`npm`\|`git`\|`local`\|`global`),… → see `package-classifier.ts.AGENTS.md` |
| `package-queue.ts` | Package operation FIFO scheduler singleton — single source of truth for install/remove/update ops across… → see `package-queue.ts.AGENTS.md` |
| `packages-api.ts` | Fetch helpers for package endpoints not owned by `package-queue`. → see `packages-api.ts.AGENTS.md` |
| `parse-host-input.ts` | Pure parser: user-supplied host string → `{ host, port }`. Exports `parseHostInput(input, defaultPort=8000)`. → see `parse-host-input.ts.AGENTS.md` |
| `pi-core-api.ts` | `fetchPiChangelog(pkg, from, to, signal?)` helper against `/api/pi-core/changelog`. See change: pi-update-whats-new-panel. |
| `plugins-api.ts` | Client-side fetch helpers: `listPlugins()` (`GET /api/plugins`), `togglePlugin(id, enabled)` (`POST… → see `plugins-api.ts.AGENTS.md` |
| `preview-dispatch.ts` | Pure `dispatchPreview(target: ViewTarget): RendererKind`. → see `preview-dispatch.ts.AGENTS.md` |
| `prompt-answer-encoder.ts` | Pure helper encoding interactive renderer `result` → `answer` string for PromptBus `prompt_response`. → see `prompt-answer-encoder.ts.AGENTS.md` |
| `prompt-component-registry.ts` | Compatibility shim re-exporting prompt component registry from… → see `prompt-component-registry.ts.AGENTS.md` |
| `resources-api.ts` | Fetch helpers for pi-resource activation (distinct from `packages-api`). → see `resources-api.ts.AGENTS.md` |
| `providers-api.ts` | Fetch helper for custom-LLM-provider management. Exports `TestProviderInput`, `TestProviderResult`… → see `providers-api.ts.AGENTS.md` |
| `rail-width.ts` | Per-session browse-rail width, localStorage `pi-dashboard:rail:<id>`, clamp [160,480], default 224. `useRailWidth`. Independent of outer split ratio. See change: split-editor-workspace. |
| `rehydrate-session.ts` | rehydrateSession(sessionId,cache). Cache hit → re-reduce raw payload via reduceEvent into provisional… → see `rehydrate-session.ts.AGENTS.md` |
| `replay-cache.ts` | Durable per-session replay cache. IndexedDB.… → see `replay-cache.ts.AGENTS.md` |
| `replay-persist.ts` | Debounced replay-cache writer. createReplayPersister(cache,debounceMs). → see `replay-persist.ts.AGENTS.md` |
| `route-builders.ts` | URL builders for shell overlay routes: `buildOpenSpecPreviewUrl`, `buildOpenSpecArchiveUrl`,… → see `route-builders.ts.AGENTS.md` |
| `selectedSessionId.ts` | Pure derivation of selected session id from wouter route matches. → see `selectedSessionId.ts.AGENTS.md` |
| `selectViewedSessionId.ts` | Pure selector for currently-viewed session id from `/session/:id` route. → see `selectViewedSessionId.ts.AGENTS.md` |
| `server-switch.ts` | `performServerSwitch(target, deps)` — extracted two-phase transaction (stage → commit) from `App.tsx`'s… → see `server-switch.ts.AGENTS.md` |
| `session-card-time.ts` | Pure picker of session-card relative-time badge anchor timestamp. Exports `selectBadgeTimestamp(session)`. → see `session-card-time.ts.AGENTS.md` |
| `session-display-name.ts` | Pure derivation of session display name. Exports `getSessionDisplayName(session)` → name → firstMessage (truncated 50 chars) → cwd last segment → ID prefix (8 chars). |
| `session-filter-storage.ts` | localStorage persistence for session-list filter state. Exports `removeLegacyHiddenSessions`,… → see `session-filter-storage.ts.AGENTS.md` |
| `session-grouping.ts` | Pure session grouping/sorting/filtering utilities. Exports `DirectoryGroup`, `WorkspaceGroup`,… → see `session-grouping.ts.AGENTS.md` |
| `session-list-scroll.ts` | Pure helper producing stable scroll-fingerprint of selected session card's position-affecting state. → see `session-list-scroll.ts.AGENTS.md` |
| `session-status-visuals.ts` | Shared session-status visual primitives. Exports `statusColors`, `sourceIcons`, `sourceLabels`,… → see `session-status-visuals.ts.AGENTS.md` |
| `SessionAssetsContext.tsx` | Per-session image-asset registry context resolving `pi-asset:<hash>` srcs in `MarkdownContent` |
| `sidebar-dnd.ts` | Shared drag-and-drop helpers for sidebar `SessionList`. Exports `sameTypeClosestCenter` (type-aware collision… → see `sidebar-dnd.ts.AGENTS.md` |
| `spawn-error-toast-bus.ts` | Module-singleton bus for off-screen `spawn_error` toasts. → see `spawn-error-toast-bus.ts.AGENTS.md` |
| `split-state.ts` | Per-session split state (`open`,`ratio`,`orientation`), localStorage key `pi-dashboard:split:<id>`. → see `split-state.ts.AGENTS.md` |
| `staging-socket.ts` | `openStagingSocket(url, {timeoutMs}): Promise<WebSocket>` — single-settle helper that resolves on first… → see `staging-socket.ts.AGENTS.md` |
| `syntax-theme.ts` | Single source of truth for prism syntax styles in client. → see `syntax-theme.ts.AGENTS.md` |
| `themes.ts` | Theme token definitions. CSS_VAR_KEYS includes --status-needs-you/working/idle/error/notice. → see `themes.ts.AGENTS.md` |
| `tool-summary.ts` | One-line tool-call summaries (`$ <cmd>`, `Read <path>`, `Grep …`, `git …`, `kb_search …`, `ctx_* …`). → see `tool-summary.ts.AGENTS.md` |
| `tool-install-deeplink.ts` | Deep-link bus between `MissingToolInlineError` and `ToolsSection`. → see `tool-install-deeplink.ts.AGENTS.md` |
| `tools-api.ts` | Client-side fetch helpers for `/api/tools*` (`fetchTools`, `rescanAll`, `rescanOne`, `setOverride`,… → see `tools-api.ts.AGENTS.md` |
| `truncate-path.ts` | Pure middle-truncation of filesystem path. Exports `truncatePathMiddle(path, maxLen)`. → see `truncate-path.ts.AGENTS.md` |
| `use-editors.ts` | React hook fetching + caching detected editors per unique cwd. → see `use-editors.ts.AGENTS.md` |
| `use-loopback-link-open.ts` | `useLoopbackLinkOpen()` → `(e,href)` click handler shared by `MarkdownContent.a()` + `UrlLink`. → see `use-loopback-link-open.ts.AGENTS.md` |
| `useSplitRatio.ts` | Split-divider drag math. `ratioFromPointer`, `clampWidth`, `useSplitRatio(containerRef,orientation,onRatioChange)`. See change: split-editor-workspace. |
| `worktree-init-bus.ts` | Module-singleton bus for `worktree_init_*` events. `subscribeInit(requestId,listener)` (legacy) +… → see `worktree-init-bus.ts.AGENTS.md` |
| `worktree-init-store.ts` | cwd-keyed client run store (`useSyncExternalStore`). Single source for the friendly feedback surfaces… → see `worktree-init-store.ts.AGENTS.md` |
| `wrap-ascii-tables.ts` | Pre-processes markdown to wrap raw ASCII/box-drawing table blocks in fenced code blocks so they render… → see `wrap-ascii-tables.ts.AGENTS.md` |
