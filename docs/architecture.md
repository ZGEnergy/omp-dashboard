# PI Dashboard Architecture

## Overview

The PI Dashboard is a web-based dashboard for monitoring and interacting with pi agent sessions. It consists of three components:

```
┌─────────────┐     WebSocket      ┌──────────────┐     WebSocket     ┌─────────────┐
│   Bridge    │ ◄─────────────────► │  Dashboard   │ ◄───────────────► │  Web Client  │
│  Extension  │    (port 9999)      │   Server     │    (port 8000)    │  (React)     │
│  (per pi)   │                     │  (Node.js)   │                   │  (Browser)   │
└─────────────┘                     └──────────────┘                   └─────────────┘
                                          │
                                    ┌─────┴─────┐
                                    │  In-Memory │
                                    │  + JSON    │
                                    └───────────┘
```

## Components

### 1. Bridge Extension (`src/extension/`)
A global pi extension that runs in every pi session. It:
- Detects session source (TUI, Zed, tmux, dashboard-spawned) via `.meta.json` sidecar files and environment variables
- Forwards all pi events to the dashboard server via WebSocket
- Relays commands from the dashboard back to pi
- Handles reconnection with exponential backoff and event buffering
- Sends heartbeats every 15s with process metrics (CPU%, RSS, heap, event loop max delay, load average); server responds with `heartbeat_ack`
- Server liveness watchdog: forces reconnect if no message received for 60s
- Server-side WS ping/pong (60s interval) detects dead TCP connections; requires 2 consecutive missed pongs before killing (tolerates long-running bash commands that block the event loop)
- Detects OpenSpec activity (phase/change) from tool events; server auto-attaches the change when `changeName` is detected (phase is not required — skills loaded via prompt templates don't emit a SKILL.md read event). The session card's OpenSpec activity badge displays when either `openspecPhase` or `openspecChange` is detected (not just phase).
- **Duplicate bridge prevention**: Uses `process`-level shared state (not `globalThis`) with a monotonic generation counter. When the extension is loaded multiple times (e.g., local + global npm package), only the latest instance's event handlers are active — stale listeners bail out immediately. All previous connections and timers are tracked and cleaned up on re-init.
- **Subagent re-entry guard**: When pi-subagents launches an Agent tool, the subagent creates its own `AgentSession` which loads extensions (including the bridge) in the same process. Without protection, this would overwrite the parent bridge's global state, disconnect its WebSocket, and prevent `tool_execution_end`/`agent_end` from being forwarded — leaving the parent session stuck at "streaming" forever. The bridge stores a reference to its owning `pi` instance and skips initialization when called from a different instance (subagent).
- Routes `ctx.ui` dialog methods (confirm, select, input, editor, notify) through `PromptBus` (`prompt-bus.ts`)
  - Adapters register to handle prompts: `DashboardDefaultAdapter` renders generic dialogs inline; extensions (e.g. pi-flows) can register custom adapters via `prompt:register-adapter` event
  - First-response-wins: multiple adapters (TUI, dashboard, custom) can claim a prompt; the first to respond resolves it, others are dismissed
  - Bridge emits `prompt:ctx-originals` so TUI adapters can capture original ctx.ui methods before patching
  - Client-side `prompt-component-registry.ts` maps component type strings to render placement (inline, widget-bar, overlay)
  - Protocol messages: `prompt_request`, `prompt_dismiss`, `prompt_cancel`, `prompt_response`

### 2. Dashboard Server (`src/server/`)
A Node.js HTTP + WebSocket server that:
- Accepts connections from bridge extensions (Pi Gateway, port 9999)
- Accepts connections from web browsers (Browser Gateway, port 8000)
- Stores events in an in-memory buffer with LRU eviction (max 100 sessions, 5000 events per session)
- Truncates large event payloads (tool results, file content, thinking blocks) to bound memory
- Applies WebSocket backpressure on browser connections (drops messages when send buffer > 4MB)
- Manages sessions in a pure in-memory registry (populated from bridge connections and direct disk discovery)
- Persists global preferences (pinned directories, session order) in `~/.pi/dashboard/preferences.json`
- Discovers historical sessions directly from disk via `SessionManager.list()` (DirectoryService)
- Loads session events on demand directly from disk via `SessionManager.open()` (DirectoryService)
- Polls OpenSpec CLI per directory every 30s, broadcasting changes to browsers (DirectoryService)
- Serves the built web client as static files (production) or proxies to Vite dev server (dev mode)
- Writes per-session `.meta.json` sidecar files with dashboard state and cached stats
- Exposes REST API for session management, event content fetch, pinned directories, and file reading
- Provides session control REST endpoints (`/api/session/:id/*`) wrapping WebSocket-only operations (prompt, abort, spawn, resume, rename, hide, flow-control, model, thinking-level, attach/detach-proposal) — see `src/server/session-api.ts`

**Server decomposition:** The server is split into focused modules:
- `server.ts` — Orchestrator: creates services, composes modules, manages lifecycle
- `routes/` — REST API routes grouped by domain (session, git, file, openspec, system)
- `event-wiring.ts` — Pi gateway → browser gateway event forwarding
- `idle-timer.ts` — Auto-shutdown idle timer
- `session-bootstrap.ts` — Startup session discovery and OpenSpec polling init
- `extension-register.ts` — Auto-registers bundled bridge extension in pi's global settings (`~/.pi/agent/settings.json`) on startup; no-op in dev mode
- `browser-handlers/` — Browser WebSocket message handlers by domain (subscription, session-actions, session-meta, terminal, directory)

### 3. Web Client (`src/client/`)
A React-based responsive web UI that:
- Shows all active sessions organized by directory, with pinned directories always visible at the top
- Renders chat messages with markdown, syntax highlighting, and streaming
- Persists scroll position per session — switching sessions restores exact scroll position if locked, or scrolls to bottom if following
- Displays collapsed tool call steps with lazy-loaded content and elapsed time badges
- Shows live ticking elapsed counters on running operations (thinking, tool calls) and final duration on completed ones
- Provides command autocomplete with `/` prefix
- Supports bidirectional interaction (send prompts, run commands)
- Works on mobile with responsive layout and swipe gestures

### 4. Shared Types (`src/shared/`)
TypeScript type definitions shared across all components:
- `protocol.ts` - Extension↔Server WebSocket messages
- `browser-protocol.ts` - Server↔Browser WebSocket messages
- `types.ts` - Data models (Session, Workspace, Event, etc.)

## Data Flow

### Event Flow (pi → browser)
1. Pi emits event (e.g., `message_update`)
2. Bridge extension converts to `event_forward` protocol message
3. Server receives, stores in in-memory buffer, assigns sequence number
4. Server broadcasts to all subscribed browsers via `event` message
5. Browser's event reducer processes event, React renders update

### Interactive UI Flow (PromptBus — extension dialog → browser → response)
1. Extension calls `ctx.ui.confirm()` / `select()` / `input()` / `editor()`
2. Bridge PromptBus intercepts via patched `ctx.ui` methods, creates a `PromptRequest` with a unique `promptId` and `pipeline` tag (e.g. `"command"`, `"architect"`)
3. Registered adapters claim the prompt:
   - `DashboardDefaultAdapter` (always registered) returns a `PromptClaim` with `component: { type: "generic-dialog", props }` and `placement: "inline"`
   - Custom adapters (e.g. `ArchitectUIAdapter` from pi-flows) can claim with custom component types and widget-bar placement
   - TUI adapters (registered via `prompt:register-adapter` event) can claim to show a terminal dialog
4. Bus sends `prompt_request` to server with the winning adapter's component info
5. Server forwards to subscribed browsers
6. Browser's `prompt-component-registry.ts` resolves the component type to a React renderer and placement
7. User responds in browser → `prompt_response` sent to server → routed to bridge
8. Bus resolves the original dialog promise and calls `onResponse()` on all adapters for cleanup

**First-response-wins (multi-adapter):**
- Multiple adapters can claim the same prompt (e.g. TUI + dashboard)
- The first adapter to respond wins; the bus sends `prompt_dismiss` to the server for the losing adapter's dashboard component
- Adapters implement `onCancel()` for cleanup when another adapter wins

**Custom UI components:**
- Extensions register adapters via `pi.events.emit("prompt:register-adapter", adapter)`
- Adapters return custom `PromptClaim` with arbitrary component types (e.g. `"architect-prompt"`)
- Client-side registry maps type strings to render placement; unknown types fall back to `"generic-dialog"`

**Resilience:**
- **Page refresh**: Server replays pending `prompt_request` messages when a browser subscribes.
- **Server restart**: TODO — PromptBus reconnect resend not yet implemented.

### Command Flow (browser → pi)
1. User types prompt or command in browser
2. Browser sends `send_prompt` via WebSocket
3. Server routes to correct bridge extension by sessionId
4. Bridge extension's command handler parses input for pi command prefixes:
   - `!!<cmd>` → silent bash execution via `pi.exec()`, result as `bash_output` event
   - `!<cmd>` → bash execution via `pi.exec()`, result as `bash_output` event + send to LLM
   - `/compact [instructions]` → `ctx.compact()`, feedback as `command_feedback` event
   - `/<command>` → `session.prompt()` for extension commands/skills/templates (fallback to `sendUserMessage()`)
   - Colon-to-hyphen aliasing: `/opsx:continue` resolves to `opsx-continue.md` template (both `:` and `-` forms work)
   - Plain text → `pi.sendUserMessage()` (default)
5. Pi processes the command, events flow back via event flow

### Flow Dashboard Data Flow (pi-flows → browser)
pi-flows runs multi-agent workflows in-process. Subagent sessions use `SessionManager.inMemory()` and don't bootstrap the bridge, so flow data must be explicitly forwarded by the parent session's bridge.

1. pi-flows `EventEmitObserver` emits `flow:*` events on `pi.events` (all 10 `FlowObserver` callbacks)
2. Bridge extension listens to `flow:*` events and forwards as `event_forward` messages with `flow_*` event types
3. Server stores events, extracts flow metadata to `DashboardSession` fields (`activeFlowName`, `flowAgentsDone`, `flowAgentsTotal`, `flowStatus`)
4. Browser event reducer builds client-side `FlowState` (agents map, tool history, detail entries)
5. React renders `FlowDashboard` (sticky card grid above ChatView), `FlowAgentDetail` (replaces chat), `FlowSummary` (post-completion)

**Flow controls (browser → pi-flows):**
- Abort: browser sends `flow_control { action: "abort" }` → server → bridge → `pi.events.emit("flow:abort")` → `flowManager.abort()`
- Autonomous toggle: browser sends `flow_control { action: "toggle_autonomous" }` → same path → `setAutonomousMode()`

### Force Kill Escalation
The Stop button supports two-click escalation for stuck sessions:
1. **Click 1 (Abort)**: Sends `abort` → bridge → `ctx.abort()`. Button transitions to orange pulsing "Force Stop".
2. **Click 2 (Force Kill)**: Sends `force_kill` → server kills the process via SIGTERM → 2s wait → SIGKILL (with PID safety check). Session marked "ended" (not removed), resumable via fork/continue.

The bridge includes `process.pid` in `session_register` so the server can kill the process. The server also force-closes the bridge WebSocket and uses the headless PID registry as a fallback. If no PID is available, only the WebSocket is closed.

Inline stop buttons also appear on running tool cards in `ToolCallStep`, providing contextual abort access right where the stuck command is visible.

### Repeated Tool Call Collapsing
Consecutive tool calls with the same name and identical args (e.g. health check polling loops) are collapsed into a single expandable group showing a count badge (e.g. "×24"). Implemented via `groupConsecutiveToolCalls()` in the chat rendering pipeline. Groups require 3+ calls; running tools are never grouped.

**Fork decisions and subagent ask_user:**
- Work through PromptBus — `TuiFlowIOAdapter` calls `ctx.ui.select/confirm/input` which the bridge routes through the bus to registered adapters (dashboard, TUI, or custom)

**Flow launcher:**
- Available flows detected from session commands list (heuristic: `source: "extension"`, excluding management commands)
- Launch dispatched as `send_prompt` with `/<flow-name> <task>`
- Commands list auto-refreshed on `flow:rediscover` and `flow:complete` events

**pi-flows local patches required** (upstream report prepared):
- `EventEmitObserver`: 5 missing methods added (flow-started, agent-started, agent-complete, assistant-text, thinking-text)
- `index.ts`: `flow:abort` and `flow:toggle-autonomous` event listeners added
- `flow-tui.ts`: `autonomousMode` included in `flow:flow-started` event data

### Auto-Resume on Prompt
When a user sends a prompt to an ended session, the server automatically resumes it:
1. Server detects `send_prompt` for a session with `status === "ended"` and a valid `sessionFile`
2. Prompt is queued in `PendingResumeRegistry` (keyed by cwd, 30s expiry)
3. Session is set to `resuming: true`, card shows pulsing yellow dot + "Resuming…"
4. Server spawns `pi --session <file>` (continue mode)
5. `pi --session` reconnects with the same session ID — `session_register` sets status back to `"active"`
6. Server flushes queued prompt to the session and clears `resuming` flag
7. No navigation needed — user is already viewing the same session
8. On timeout (30s) or spawn failure, `resuming` flag is cleared and session returns to normal ended state
9. If user sends another prompt while already resuming, the queued prompt is updated without spawning a second process

### Model & Thinking Level Flow
1. Bridge sends current model and thinking level in `session_register` on connect
2. When user changes model (via `/model`), pi emits `model_select` event
3. Bridge enriches the event with current `thinkingLevel` from context before forwarding
4. Bridge also sends a `model_update` protocol message for session-level tracking
5. Server extracts model/thinkingLevel from events and `model_update`, broadcasts to browsers
6. Thinking level changes (via pi keybinding) are detected when `model_select` events fire, on reconnect, and immediately after `set_thinking_level` commands
7. Browser can send `set_thinking_level` to change thinking level remotely

### Context Usage Tracking
1. On each `turn_end`, the bridge calls pi's `ctx.getContextUsage()` API to get real-time context usage (tokens used + actual context window from the provider)
2. Bridge enriches the `turn_end` event with this `contextUsage` data before forwarding to the server
3. Server extracts `contextUsage` from the event data and passes it to `extractTurnStats()`, which includes it in the synthesized `stats_update` event
4. Server updates `session.contextTokens` and `session.contextWindow` and broadcasts to browsers
5. The `onChange` handler persists these values to `.meta.json` (debounced 1s)
6. On server restart, the scanner restores `contextTokens`/`contextWindow` from `.meta.json`
7. Client's event reducer stores `contextUsage` from `stats_update` events; `App.tsx` falls back to `session.contextTokens/contextWindow` for sessions without live reducer state
8. When real data is unavailable (e.g., old sessions without persisted context data), `state-replay.ts` and `session-stats-reader.ts` use `inferContextWindow()` to estimate context window from the model name

### Git Polling
1. Bridge polls git info every 30s (`git-info.ts`): branch, remote URL, PR number
2. Changes are sent to the server only when values differ from last poll
3. Server broadcasts updates to subscribed browsers

### Child Process Scanning
1. Bridge scans child processes every 10s via `process-scanner.ts` (two-phase: capture new PGIDs during active bash calls, then check tracked PGIDs)
2. Only processes running ≥30s are reported (filters out short-lived commands)
3. Bash/sh wrapper processes are excluded (only leaf commands shown)
4. Bridge sends `process_list` to server only when the PID set changes (dedup)
5. Server stores processes on the session object and forwards to subscribed browsers as `process_list_update`
6. New browser connections receive current processes via the initial `session_added` message
7. Session cards display processes with elapsed time and a kill button (sends SIGTERM to process group)

### OpenSpec Polling (Server-Side)
1. Server's DirectoryService polls `openspec` CLI every 30s for each known directory (union of pinned dirs + session cwds)
2. OpenSpec data is keyed by directory (cwd), not by session — one poll per directory regardless of session count
3. Changes are broadcast to all connected browsers via `openspec_update { cwd, data }`
4. Browsers can request immediate refresh via `openspec_refresh { cwd }`
5. New directories (pinned or from new sessions) trigger immediate discovery + polling

### File Read API
The server exposes `GET /api/file?cwd=...&path=...` for reading files or listing directories from session working directories. Guards: localhost-only, cwd must match a known session, resolved path must stay inside cwd. Returns `{ type: "file", content }` or `{ type: "directory", entries }`.

### Pi Resources Browser

The dashboard can display pi extensions, skills, and prompts installed for each workspace. The server-side scanner (`pi-resource-scanner.ts`) discovers resources from three sources:

1. **Local**: `<cwd>/.pi/extensions/`, `.pi/skills/`, `.pi/prompts/`
2. **Global**: `~/.pi/agent/extensions/`, `skills/`, `prompts/`
3. **Packages**: Resolved from `packages[]` in both `<cwd>/.pi/settings.json` and `~/.pi/agent/settings.json` — supports npm, git, and local path packages with pi manifest or conventional directory fallback

Metadata is parsed from SKILL.md YAML frontmatter (`name`, `description`), prompt frontmatter, and `package.json`. Results are cached in DirectoryService and polled every 30s alongside OpenSpec.

**API endpoints:**
- `GET /api/pi-resources?cwd=...` — returns grouped resources (local, global, packages) from cache
- `GET /api/pi-resource-file?path=...` — reads resource files from allowed locations (`.pi/`, `~/.pi/agent/`, `node_modules/`, `.pi/git/`)

**Package Management:**
- `GET /api/packages/search?q=&type=` — proxied npm search for `keywords:pi-package`, cached 5min
- `GET /api/packages/readme?pkg=` — fetch package README from npm registry
- `GET /api/packages/installed?scope=global|local&cwd=` — list installed packages via pi's `PackageManager`
- `POST /api/packages/install` — install package (returns 202 + operationId, streams progress via WS)
- `POST /api/packages/remove` — remove package (same async pattern)
- `POST /api/packages/update` — update packages (same async pattern)
- `POST /api/packages/check-updates` — check for available updates (on-demand)

Package operations use pi's `DefaultPackageManager` API on the server, serialized (one at a time, 409 on concurrent). Progress events are forwarded to browsers via `package_progress` WebSocket messages. After any successful operation, the server sends `/reload` to all connected pi sessions.

**Client navigation stack:**
- Puzzle icon button in folder header → PiResourcesView (content area, "Installed" / "Packages" tabs)
- "View" button on resource → MarkdownPreviewView (`.md` as markdown, `.ts` as code block)
- Settings → Packages tab → inline PackageBrowser for global package management
- Back buttons pop the stack: Preview → Resources → Chat

### Git Branch Selector

The dashboard provides a git branch selector at the folder group level. Clicking the branch icon in `GroupGitInfo` opens a typeahead `BranchPicker` dialog. The flow supports three states:

1. **No git repo**: Dimmed icon labeled "Init git" — clicking triggers `POST /api/git/init`
2. **Detached HEAD**: Shows short commit SHA — clicking opens the branch picker
3. **Normal branch**: Shows branch name — clicking opens the branch picker

**Server API endpoints** (all localhost-only in `git-operations.ts`):
- `GET /api/git/branches?cwd=...` — lists local + remote branches sorted by committer date
- `POST /api/git/checkout` — switches branch; returns 409 with dirty file list if working tree is dirty
- `POST /api/git/init` — initializes a git repository
- `POST /api/git/stash-pop` — pops the most recent stash, reports conflicts

**Checkout flow**: Clean checkout closes immediately. Dirty working tree → client shows file list + "Stash & Switch" button → stash + checkout → asks "Pop stash on new branch?" with explicit Yes/No. Remote branches auto-create local tracking branches.

### Session File Diff View

The dashboard provides a GitHub-style file diff viewer for sessions. It shows what files a session has changed, with per-change drill-down.

**Data flow**: `GET /api/session-diff?sessionId=xxx` (localhost-only) scans session events for Write/Edit tool calls, extracts file paths and change data, optionally enriches with `git diff HEAD` output. Returns `SessionDiffResponse` with files, per-file change events (timestamps + context messages), and optional git diffs.

**UI**: Split-pane content-area view (replaces ChatView when active). Left panel shows a two-level file tree — files with status indicators, expandable to show individual change events with timestamps and assistant message context. Right panel renders diffs via `@git-diff-view/react` with `@git-diff-view/lowlight` syntax highlighting. Supports split/unified diff modes and a file content view toggle.

**Entry point**: "Changed Files" button in SessionHeader (only visible when Write/Edit tool events exist). Works for both active and ended sessions.

### Markdown Preview View
The web client includes a generic `MarkdownPreviewView` component that replaces the chat area. It supports a back button, title, optional tab bar, and loading/error states. For OpenSpec artifacts, the `useOpenSpecReader` hook maps artifact IDs (P/S/D/T) to file paths, fetches content via the file API, and concatenates specs from subdirectories.

### Archive Browser
The `ArchiveBrowserView` provides a searchable, date-grouped listing of archived OpenSpec changes. It uses a dedicated `GET /api/openspec-archive?cwd=<path>` endpoint that scans `openspec/changes/archive/` and returns entry metadata (name, date, artifacts). The view uses two-level navigation: the list is the first level, and clicking an artifact letter (P/D/S/T) opens the reader as the second level. Back from the reader returns to the list (preserving search and scroll), and back from the list returns to the session view. Entry point is the `[Archive]` button in `FolderOpenSpecSection`.

### Network Access Control

The server has a two-layer access model:

**Layer 1: Network Guard (`createNetworkGuard`)** — Fastify `preHandler` on all sensitive routes. Allows requests via three paths:
1. **Loopback** — `127.0.0.1`, `::1`, `::ffff:127.0.0.1` (always allowed)
2. **Trusted networks** — IPs matching `resolvedTrustedNetworks` (CIDR, wildcard, exact). Configured via top-level `trustedNetworks` in config, merged with `auth.bypassHosts` at load time.
3. **Authenticated** — `request.isAuthenticated === true` (set by auth `onRequest` hook via `decorateRequest`)

Otherwise → 403. The guard strips `::ffff:` IPv4-mapped prefixes before matching.

**Layer 2: Auth Plugin (`onRequest` hook)** — Only registered when `auth` is configured. Skips loopback, trusted networks, `/auth/*`, `/api/health`, and `bypassUrls`. Validates JWT cookie for all other requests. Tags valid requests with `request.isAuthenticated = true`.

**Execution order**: `onRequest` (auth) → `preHandler` (guard) → handler. This means the auth hook tags the request before the guard checks it.

**WebSocket upgrades** follow the same logic: loopback → trusted network → JWT cookie validation.

**Zrok tunnel** connections appear as `127.0.0.1` (zrok proxies to localhost), so both layers pass automatically.

**`GET /api/network-interfaces`** returns detected non-internal IPv4 interfaces with computed CIDRs. Used by the Settings UI "Add Local Network" button. This endpoint uses the legacy `localhostGuard` (localhost-only, not network-guard-aware) since it exposes machine network topology.

### OAuth Authentication Flow

Optional OAuth2 authentication protects the dashboard when accessed remotely.

1. Server loads `auth` config from `~/.pi/dashboard/config.json` at startup
2. If `auth.providers` has entries, the auth plugin registers routes, the `isAuthenticated` request decorator, and an `onRequest` hook
3. The `onRequest` hook skips localhost requests (`isLoopback`), trusted network IPs (`resolvedTrustedNetworks`), `/auth/*` paths, `/api/health`, and configured `bypassUrls` path prefixes
4. External requests without a valid `pi_dash_token` JWT cookie are redirected to `/auth/login`
5. `/auth/login` shows a provider picker (or auto-redirects if single provider)
6. OAuth callback exchanges code for token, fetches user info, validates against `allowedEmails`
7. On success, a signed JWT cookie is set (7-day expiry) and user is redirected back
8. WebSocket upgrade requests are also validated — external connections without valid cookie or trusted network get 401
9. Supported providers: GitHub (hardcoded endpoints), Google/Keycloak/OIDC (via OIDC discovery)

### Settings Panel
The web client includes a Settings panel (gear icon in sidebar header → `/settings` route) that lets users view and edit all dashboard configuration. The panel:
1. Loads config via `GET /api/config` (secrets redacted as `***`)
2. Renders grouped form fields: Server, Sessions, Tunnel, Trusted Networks, Authentication, Developer
3. Sends only changed fields via `PUT /api/config` (partial merge)
4. Server preserves `***` secrets (doesn't overwrite real values), writes to disk, and applies runtime-safe changes
5. Port/piPort changes flag `restartRequired` in the response

### Reconnection Flow
1. Browser reconnects with `subscribe` message including `lastSeq`
2. Server replays missed events from in-memory buffer in async batches of 50 with backpressure handling
3. Browser's event reducer processes replay, rebuilding state

### Bridge Reconnection (State Reset)
When a bridge extension reconnects (e.g., after `npm run reload` or network recovery):
1. Bridge sends `session_register` with `eventCount` to re-register the session
2. Server checks `canSkipWipe`: if the bridge's `eventCount` matches the server's `lastEntryCount` and events exist in the store, the wipe is skipped (fast reconnect path)
3. **Full replay path** (`canSkipWipe = false`): Server clears the in-memory event store, broadcasts `session_state_reset` to browsers, stores replayed events, and sends them as `event_replay` batch after `replay_complete`
4. **Skip replay path** (`canSkipWipe = true`): Server keeps existing events in the store, marks the session in `skipReplayInsert` set so replayed events are NOT re-inserted (preventing exponential duplication). Status updates are still processed for session state accuracy. After `replay_complete`, the `event_replay` batch is skipped since browsers already have the events.
5. Bridge replays full session history as individual `event_forward` messages
6. Bridge sends `replay_complete` to signal replay is done
7. If the agent is currently mid-turn (bridge tracks `isAgentStreaming` flag in persistent `BridgeState`), a synthetic `agent_start` event is sent after `replay_complete` so the session card shows "Thinking…" instead of "Waiting for input"
8. Server clears the replaying flag, broadcasts the final accumulated session status
9. Browser rebuilds state cleanly from the replayed events (full replay) or continues with existing state (skip replay)

Without the `session_state_reset` message (full replay path), replayed events would duplicate existing messages in the browser's accumulated state.

**Replay status suppression**: During step 5, replayed events like `agent_start`/`agent_end` would normally trigger rapid `session_updated` broadcasts (e.g., `status: "streaming"` → `status: "idle"` for each turn), causing visible flicker on session cards. The server suppresses these status broadcasts while replaying, accumulating them in the session manager. Only the final status is broadcast after `replay_complete`. A 5-second safety timeout ensures the flag is cleared even if `replay_complete` never arrives (e.g., older bridge versions).

**Agent streaming state recovery**: The bridge tracks `isAgentStreaming` in process-level `BridgeState` (survives reload). Set `true` on `agent_start`, `false` on `agent_end`/`session_shutdown`. Since the replay doesn't include `agent_start`/`agent_end` events, the session status would otherwise stay "active" (displayed as "Waiting for input") when the agent is mid-turn during reconnect.

### Session File Deduplication
When pi continues a session via `--session <file>`, it reuses the same JSONL file but may create a new session ID. The server detects this: when a new session registers with a `sessionFile` already associated with another session, the old session's `sessionFile` is cleared. This prevents the Resume button from loading the wrong conversation.

### Ghost Session Cleanup
When the bridge extension is loaded multiple times (e.g., local project + global npm package), duplicate connections can create "ghost" sessions — active sessions with no sessionFile and no events. The server detects and removes these:
- **Pi gateway**: When a `session_register` changes the connection's session ID, the old session is cleaned up if it has `source: "unknown"` or no `sessionFile`
- **Event wiring**: When `session_register` arrives, any active sessions in the same cwd that have no sessionFile, no events, aren't connected, and were created within 30s are removed as ghosts

### On-Demand Session Loading (Server-Side)
When a browser subscribes to a session whose events have been evicted from memory:
1. Server sends empty `event_replay` with `isLast: false` to indicate loading
2. Server's DirectoryService loads the session file directly via `SessionManager.open(sessionFile).getBranch()`
3. Entries are converted via `replayEntriesAsEvents()` and stored in the event buffer (truncated, capped at 5000/session)
4. Server sends `event_replay` in async batches with backpressure to all waiting browsers
5. If the session file is missing or corrupt, server sends `dataUnavailable: true`
6. Concurrent loads for the same session are deduplicated

### Flows Refresh Deduplication
When a session sends `flows_list`, the server notifies other sessions in the same cwd to rediscover flows. To prevent infinite loops (A→refresh B→B sends flows→refresh A→...), a per-session 5-second cooldown (`recentFlowsRefresh` set) suppresses duplicate refresh requests.

### Event Broadcast During Replay
During bridge session replay (while `replayingSessions` set contains the session), `event_forward` messages are stored but NOT broadcast individually to browser subscribers. Instead, when `replay_complete` arrives (or the 5s safety timeout fires), the server sends all accumulated events as a single `event_replay` batch to subscribers. This prevents per-event serialization overhead during replay while still delivering the full history to browsers.

## Persistence

| Data | Storage | Details |
|------|---------|---------|
| Events | In-memory Map | LRU eviction, max 100 sessions. Pinned if active bridge or browser subscribers. |
| Sessions | In-memory Map + `.meta.json` | In-memory registry. Each session's state cached in per-session `.meta.json` sidecar next to `.jsonl`. On startup, `session-scanner.ts` scans `~/.pi/agent/sessions/*/` to restore all sessions from cached meta. |
| Session meta | `~/.pi/agent/sessions/…/<id>.meta.json` | Per-session sidecar: dashboard-owned state (name, attachedProposal, hidden, source) + cached stats (tokens, cost, model, status). Debounced per-session writes (max 1/sec). Stale cache detected via `cachedAt` vs `.jsonl` mtime. |
| Pinned directories | `~/.pi/dashboard/preferences.json` | Ordered array of cwd paths. Pinned dirs always visible in sidebar. |
| Session order | `~/.pi/dashboard/preferences.json` | Per-cwd ordering managed by `session-order-manager.ts`. |
| Server PID | `~/.pi/dashboard/server.pid` | Tracks running server process for daemon management. |
| Headless PIDs | `~/.pi/dashboard/headless-pids.json` | Maps spawned headless processes to sessions. Unix: `tail -f /dev/null \| pi --mode rpc` (uses tail instead of sleep to avoid stdin pipeline bug). Windows: `pi.cmd --mode rpc` with `shell: true` and quoted paths for spaces in usernames. |
| Bridge extension | `~/.pi/agent/settings.json` | On bundled installs (Electron DEB/DMG), the server auto-registers the bridge extension path in pi's global settings so all spawned pi sessions discover and load it. No-op in dev mode. |
| Session files | `~/.pi/agent/sessions/` (pi's own) | Source of truth. Bridge loads on demand. |

## Configuration

Precedence: CLI flags → environment variables → config file (`~/.pi/dashboard/config.json`)

| Setting | Default | Description |
|---------|---------|-------------|
| `port` | 8000 | HTTP + Browser WebSocket port |
| `piPort` | 9999 | Pi extension WebSocket port |
| `autoStart` | true | Bridge extension auto-starts server if not running |
| `autoShutdown` | false | Server shuts down after idle period (disabled by default; enable for TUI auto-start scenarios) |
| `shutdownIdleSeconds` | 300 | Idle timeout before auto-shutdown |
| `spawnStrategy` | `"headless"` | How to spawn new sessions: `"headless"` or `"tmux"` |
| `tunnel.enabled` | true | Enable zrok tunnel for remote access |
| `tunnel.reservedToken` | _(auto)_ | Reserved zrok share token for persistent URL (auto-created on first run) |

### Tunnel Lifecycle

The tunnel is **enabled by default** (`tunnel.enabled: true`). When the server starts:

1. **Binary detection** — `detectZrokBinary()` checks if `zrok` is on PATH via `which`/`where`
2. **Environment check** — `loadZrokEnv()` reads zrok's own config (`~/.zrok2/environment.json` or `~/.zrok/environment.json`) to verify enrollment. The dashboard never stores zrok API keys — they live entirely in zrok's config directory, created by `zrok enable <token>`.
3. **Stale cleanup** — `cleanupStaleZrok()` reads `~/.pi/dashboard/zrok.pid`, kills orphaned zrok processes from previous crashes
4. **Reserved share** — If `tunnel.reservedToken` is not set, `zrok reserve public` is called to create a persistent share token. The token is saved to config so the URL stays the same across restarts. If a saved token fails (e.g., expired), a new reservation is created automatically.
5. **Subprocess spawn** — `createTunnel(port, reservedToken?)` spawns `zrok share reserved <token> --headless` (or `zrok share public --headless` as fallback) as a child process
6. **URL parsing** — The public URL is parsed from stdout/stderr (30s timeout)
7. **PID tracking** — The subprocess PID is written to `~/.pi/dashboard/zrok.pid`
8. **Shutdown** — `deleteTunnel()` kills the subprocess and removes the PID file. The reserved token is preserved for next restart.

To disable: set `tunnel.enabled` to `false` in `~/.pi/dashboard/config.json` or pass `--no-tunnel` on the CLI.

The client can query `GET /api/tunnel-status` which returns `{ status: "active"|"inactive"|"unavailable", url?, serverOs }`.
The client can connect/disconnect the tunnel via `POST /api/tunnel-connect` and `POST /api/tunnel-disconnect`.

### PWA Support

The dashboard is installable as a Progressive Web App on mobile devices:

- **Manifest** (`public/manifest.json`) — app name, icons, standalone display mode
- **Service Worker** (`public/sw.js`) — minimal fetch pass-through for installability
- **Tunnel/QR Button** — unified sidebar button: shows tunnel icon when zrok is not installed (click → setup guide), QR code icon when set up but disconnected (click → setup guide), green QR code icon when connected (click → QR dialog with disconnect and setup buttons)

| `devBuildOnReload` | false | Rebuild Vite client + restart server on `/reload` |

## Shared Config

Both the server CLI and bridge extension read from `~/.pi/dashboard/config.json` via a shared module (`src/shared/config.ts`). On first access, the config file is auto-created with defaults.

### Dev Mode with Production Fallback

When started with `--dev`, the server proxies client requests to the Vite dev server for HMR. If Vite is not running, it falls back to serving the production build from `dist/client/`. This means:
- `pi-dashboard start --dev` **always works** — no 502 errors
- If Vite is running → hot module replacement, fast iteration
- If Vite is not running → serves last production build silently
- Vite can be started/stopped independently without restarting the dashboard

### Graceful Restart

The `POST /api/restart` endpoint and `pi-dashboard restart` command perform fault-tolerant restarts:
1. Flush all pending state (meta persistence, preferences)
2. Spawn new server process
3. Wait for old server's port to become free (up to 10s)
4. Start new server with the same (or overridden) flags
5. Verify health via `/api/health` (up to 10s)
6. `pi-dashboard stop` also kills any stale processes holding the port (via `lsof`)

The restart endpoint accepts `{ dev: boolean }` to switch between dev/production mode.

### Auto-Start Flow

When `autoStart` is `true` (default), the bridge extension automatically starts the dashboard server:

```
pi session_start
       │
       ▼
  ensureConfig() → create ~/.pi/dashboard/config.json if missing
  loadConfig()   → read piPort, port, autoStart
       │
       ▼
  TCP probe localhost:{piPort}
       │
  ┌────┴────┐
  │ open    │ closed & autoStart=true
  │         │
  ▼         ▼
connect   spawn server (detached)
silently  pass --port & --pi-port
               │
               ▼
          notify user:
          "🌐 Dashboard started at http://localhost:{port}"
               │
               ▼
            connect
```

The server is spawned detached (`child_process.spawn` with `detached: true`, stdout/stderr redirected to `~/.pi/dashboard/server.log`), so it outlives the pi session. If multiple pi sessions start simultaneously, duplicate spawn attempts fail harmlessly with EADDRINUSE. After a failed launch, the bridge re-probes the port — if another agent started the server concurrently, the warning is suppressed. The auto-start logic is extracted into `server-auto-start.ts` for testability.

## mDNS Server Discovery

The dashboard uses mDNS (via `bonjour-service`) for zero-config server discovery:

### Discovery Chain
1. **mDNS browse** (2s timeout) — discover `_pi-dashboard._tcp` services on the local network
2. **Health check fallback** — `GET /api/health` on configured port, verifies `{ ok: true, pid }` response
3. **Auto-start** — if no server found and `autoStart` is enabled, spawn detached server

### Server Advertisement
- On startup, the server publishes a `_pi-dashboard._tcp` mDNS service with TXT record: `{ version, pid, piPort }`
- On shutdown, the service is unpublished
- A continuous mDNS browser discovers peer servers and broadcasts updates to connected browsers via `servers_discovered`/`servers_updated` WebSocket messages

### Bridge Discovery
- Bridge extensions use the mDNS discovery chain instead of bare TCP port probes
- `isDashboardRunning(port)` replaces `isPortOpen(port)` for identity-verified detection
- After auto-starting, the bridge waits up to 10s for the server's mDNS advertisement

### Server Selector UI
- A dropdown in the sidebar header shows all discovered servers (local + LAN)
- Each entry shows hostname, port, Local/Remote badge, and connection status
- Switching closes the current WebSocket and connects to the selected server
- Last-used server persisted in `localStorage` (`pi-dashboard-last-server`)

## Provider Authentication

The dashboard supports browser-based authentication with pi's LLM providers, enabling login from phones, tablets, or remote tunnel access without needing terminal access.

### Flow

1. **Settings UI** shows OAuth providers (Anthropic, Codex, GitHub Copilot, Gemini CLI, Antigravity) and API key providers
2. **Auth-code flow** (Anthropic, Codex, Gemini, Antigravity): browser opens popup → provider consent → callback HTML relays code via `postMessage`/`BroadcastChannel`/`localStorage` → server exchanges code for tokens using PKCE
3. **Device-code flow** (GitHub Copilot): server requests device code → UI shows user code + verification URL → server polls until authorized
4. **API key flow**: user pastes key in Settings → saved directly
5. All credentials written to `~/.pi/agent/auth.json` with lockfile + atomic write (`0600` permissions)
6. Server broadcasts `credentials_updated` to all connected bridges → bridges call `authStorage.reload()` so running pi sessions pick up new tokens immediately

### Key Files

| File | Purpose |
|------|--------|
| `src/server/provider-auth-handlers.ts` | Per-provider OAuth logic (PKCE, token exchange, project discovery) |
| `src/server/provider-auth-storage.ts` | auth.json read/write with file locking |
| `src/server/routes/provider-auth-routes.ts` | REST API for authorize, exchange, callback, device-code, API keys |
| `src/client/components/ProviderAuthSection.tsx` | Settings UI component |

## Terminal Emulator

The dashboard includes a browser-based terminal emulator for direct shell access.

### Architecture

```
Browser                              Server
┌────────────────┐            ┌──────────────────┐
│  xterm.js      │            │ TerminalManager   │
│  (per terminal)│◄──binary──►│  ├─ node-pty      │
│  FitAddon      │    WS      │  ├─ RingBuffer    │
│  AttachAddon   │            │  └─ clients Set   │
└────────────────┘            └──────────────────┘
```

### WebSocket Protocol

Each terminal has a dedicated binary WebSocket at `/ws/terminal/:id`:
- **Binary frames**: Raw terminal I/O (keystrokes client→server, PTY output server→client)
- **Text frames**: JSON control messages (`{ "type": "resize", "cols": N, "rows": N }`)

This is separate from the main JSON dashboard WebSocket (`/ws`).

### Terminal Lifecycle

1. Browser sends `create_terminal` on main WS → server spawns PTY via `node-pty`
2. Server broadcasts `terminal_added` to all browsers
3. Browser opens binary WS to `/ws/terminal/:id`, attaches `xterm.js`
4. Shell exit → PTY `onExit` → server broadcasts `terminal_removed` → card removed

### Output Buffering

Each terminal maintains a 256KB ring buffer of raw PTY output. When a new WebSocket connects (reconnect, new tab), the buffer is replayed before live streaming. Combined with client-side 10,000-line scrollback.

### Keep-Alive

Terminal xterm.js instances stay mounted in the DOM (CSS hidden/shown) for instant switching without replay flicker. The binary WebSocket stays open while mounted.

### Folder-Scoped View

Terminals are displayed in a tabbed `TerminalsView` per folder, accessed via the folder action bar's `Terminals(N)` button or `+Terminal` button. Terminal cards no longer appear in the sidebar — the sidebar shows only pi session cards. The tab bar supports switching, closing, renaming, and creating new terminals.

## Embedded Editor (code-server)

The dashboard supports embedding VS Code in the browser via code-server.

### Architecture

```
Browser                     Dashboard Server              code-server
┌──────────────┐         ┌─────────────────┐         ┌──────────────┐
│  EditorView  │         │  EditorManager  │         │  VS Code     │
│  (iframe)    │◄─HTTP──►│  EditorProxy    │◄─HTTP──►│  :10001      │
│              │  same   │  /editor/:id/*  │  local  │  (per folder)│
└──────────────┘  origin └─────────────────┘         └──────────────┘
```

### Lifecycle

1. User clicks `Editor` button in folder action bar → navigates to `/folder/:encodedCwd/editor`
2. `EditorView` sends `POST /api/editor/start` with `{ cwd }`
3. `EditorManager` spawns code-server on a free port with `--auth none --bind-addr 127.0.0.1:<port>`
4. Waits for TCP ready probe → returns `{ id, proxyPath }` → iframe loads
5. Browser sends heartbeat every 30s → resets idle timer
6. No heartbeat for 10 min → instance killed via SIGTERM

### Reverse Proxy

All code-server traffic is proxied through `/editor/:id/*` on the dashboard server. This provides same-origin access (no CORS/iframe issues) and works transparently through zrok tunnels.

### Configuration

```json
{
  "editor": {
    "binary": "/usr/local/bin/code-server",
    "idleTimeoutMinutes": 10,
    "maxInstances": 3
  }
}
```

Binary auto-detection order: config override → `code-server` on PATH → `openvscode-server` on PATH.

## Bundled Skill: pi-dashboard

The `.pi/skills/pi-dashboard/` directory is both a local project skill (discovered by pi from `.pi/skills/`) and shipped with the npm package (discovered via `pi.skills` in `package.json`). This means any pi session in the dashboard project or any project that installs the dashboard package gets access to the skill.

### Session Control REST API

`src/server/session-api.ts` registers REST wrappers for operations that were previously WebSocket-only:

| Endpoint | Description |
|----------|-------------|
| `POST /api/session/:id/prompt` | Send a text prompt to a session |
| `POST /api/session/:id/abort` | Abort current operation |
| `POST /api/session/:id/shutdown` | Shutdown a pi session |
| `POST /api/session/:id/rename` | Rename a session |
| `POST /api/session/:id/hide` | Hide session |
| `POST /api/session/:id/unhide` | Unhide session |
| `POST /api/session/spawn` | Spawn new session in a directory |
| `POST /api/session/:id/resume` | Resume or fork ended session |
| `POST /api/session/:id/flow-control` | Abort flow or toggle autonomous |
| `POST /api/session/:id/model` | Set provider + model |
| `POST /api/session/:id/thinking-level` | Set thinking level |
| `POST /api/session/:id/attach-proposal` | Attach OpenSpec change |
| `POST /api/session/:id/detach-proposal` | Detach OpenSpec change |

These call the same internal methods as the browser-gateway WebSocket handlers — no duplicated logic.

### Skill Contents

- `SKILL.md` — Auto-discovers dashboard port from `~/.pi/dashboard/config.json`, organized by capability, auth-aware
- `references/api-reference.md` — Complete REST API documentation
- `references/recipes.md` — Multi-step orchestration patterns (spawn→prompt→monitor, batch operations, health checks)
- `scripts/dashboard-api.sh` — curl wrapper with port detection, optional auth token, graceful jq fallback
