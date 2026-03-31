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
- Detects session source (TUI, Zed, tmux, dashboard-spawned)
- Forwards all pi events to the dashboard server via WebSocket
- Relays commands from the dashboard back to pi
- Handles reconnection with exponential backoff and event buffering
- Sends heartbeats every 15s
- Detects OpenSpec activity (phase/change) from tool events
- Proxies `ctx.ui` dialog methods (confirm, select, input, editor) to the dashboard via `ui-proxy.ts`
  - TUI sessions: races terminal dialog against dashboard response (first wins)
  - Race cancellation: when dashboard wins, TUI dialog is aborted via `AbortSignal`; when TUI wins, dashboard dialog is dismissed via `extension_ui_dismiss` message
  - Headless sessions: only dashboard can respond
  - Fire-and-forget methods (notify) are forwarded alongside the original call
  - Re-sends pending UI requests on WebSocket reconnect (server restart resilience)

### 2. Dashboard Server (`src/server/`)
A Node.js HTTP + WebSocket server that:
- Accepts connections from bridge extensions (Pi Gateway, port 9999)
- Accepts connections from web browsers (Browser Gateway, port 8000)
- Stores events in an in-memory buffer with LRU eviction (max 100 sessions)
- Manages sessions in a pure in-memory registry (populated from bridge connections and direct disk discovery)
- Persists user preferences (hidden sessions, pinned directories, session order) in `~/.pi/dashboard/state.json`
- Discovers historical sessions directly from disk via `SessionManager.list()` (DirectoryService)
- Loads session events on demand directly from disk via `SessionManager.open()` (DirectoryService)
- Polls OpenSpec CLI per directory every 30s, broadcasting changes to browsers (DirectoryService)
- Serves the built web client as static files
- Exposes REST API for session management, event content fetch, pinned directories, and file reading

### 3. Web Client (`src/client/`)
A React-based responsive web UI that:
- Shows all active sessions organized by directory, with pinned directories always visible at the top
- Renders chat messages with markdown, syntax highlighting, and streaming
- Displays collapsed tool call steps with lazy-loaded content
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

### Interactive UI Flow (extension dialog → browser → response)
1. Extension calls `ctx.ui.confirm()` / `select()` / `input()` / `editor()`
2. Bridge UI proxy intercepts, sends `extension_ui_request` to server
3. Server tracks the request in `pendingUiRequests` map and forwards to subscribed browsers
4. Browser renders interactive card inline in chat (renderers in `interactive-renderers/`)
5. User clicks Allow/Deny/option/submits text
6. Browser sends `extension_ui_response` to server, optimistically clears "Waiting for input" on session card
7. Server clears the request from `pendingUiRequests` and routes response to bridge extension
8. Bridge UI proxy resolves the original dialog promise

**Race cancellation (TUI sessions):**
- TUI and dashboard both show the dialog simultaneously via `Promise.race`
- When dashboard answers first: TUI dialog is dismissed via `AbortSignal` (passed in `ExtensionUIDialogOptions.signal`)
- When TUI answers first: bridge sends `extension_ui_dismiss` to server → forwarded as `ui_dismiss` to browsers → dashboard transitions dialog to "dismissed" ("Answered in terminal")
- Pending Map entry is cleaned up immediately when TUI wins, preventing memory leaks

**Resilience:**
- **Page refresh**: Server replays pending `extension_ui_request` messages when a browser subscribes, so interactive dialogs survive page refreshes.
- **Server restart**: Bridge UI proxy re-sends all pending requests on WebSocket reconnect (`resendPending()`), so dialogs survive server restarts.

### Command Flow (browser → pi)
1. User types prompt or command in browser
2. Browser sends `send_prompt` via WebSocket
3. Server routes to correct bridge extension by sessionId
4. Bridge extension's command handler parses input for pi command prefixes:
   - `!!<cmd>` → silent bash execution via `pi.exec()`, result as `bash_output` event
   - `!<cmd>` → bash execution via `pi.exec()`, result as `bash_output` event + send to LLM
   - `/compact [instructions]` → `ctx.compact()`, feedback as `command_feedback` event
   - `/<command>` → `session.prompt()` for extension commands/skills/templates (fallback to `sendUserMessage()`)
   - Plain text → `pi.sendUserMessage()` (default)
5. Pi processes the command, events flow back via event flow

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

### Git Polling
1. Bridge polls git info every 30s (`git-info.ts`): branch, remote URL, PR number
2. Changes are sent to the server only when values differ from last poll
3. Server broadcasts updates to subscribed browsers

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

**Client navigation stack:**
- Puzzle icon button in folder header → PiResourcesView (content area)
- "View" button on resource → MarkdownPreviewView (`.md` as markdown, `.ts` as code block)
- Back buttons pop the stack: Preview → Resources → Chat

### Markdown Preview View
The web client includes a generic `MarkdownPreviewView` component that replaces the chat area. It supports a back button, title, optional tab bar, and loading/error states. For OpenSpec artifacts, the `useOpenSpecReader` hook maps artifact IDs (P/S/D/T) to file paths, fetches content via the file API, and concatenates specs from subdirectories.

### OAuth Authentication Flow

Optional OAuth2 authentication protects the dashboard when accessed via tunnel (external). Localhost access is always unguarded.

1. Server loads `auth` config from `~/.pi/dashboard/config.json` at startup
2. If `auth.providers` has entries, the auth plugin registers routes and an `onRequest` hook
3. The `onRequest` hook skips localhost requests (`isLoopback`), `/auth/*` paths, and `/api/health`
4. External requests without a valid `pi_dash_token` JWT cookie are redirected to `/auth/login`
5. `/auth/login` shows a provider picker (or auto-redirects if single provider)
6. OAuth callback exchanges code for token, fetches user info, validates against `allowedEmails`
7. On success, a signed JWT cookie is set (7-day expiry) and user is redirected back
8. WebSocket upgrade requests are also validated — external connections without valid cookie get 401
9. Supported providers: GitHub (hardcoded endpoints), Google/Keycloak/OIDC (via OIDC discovery)

### Settings Panel
The web client includes a Settings panel (gear icon in sidebar header → `/settings` route) that lets users view and edit all dashboard configuration. The panel:
1. Loads config via `GET /api/config` (secrets redacted as `***`)
2. Renders grouped form fields: Server, Sessions, Tunnel, Authentication, Developer
3. Sends only changed fields via `PUT /api/config` (partial merge)
4. Server preserves `***` secrets (doesn't overwrite real values), writes to disk, and applies runtime-safe changes
5. Port/piPort changes flag `restartRequired` in the response

### Reconnection Flow
1. Browser reconnects with `subscribe` message including `lastSeq`
2. Server replays missed events from in-memory buffer in batches of 200
3. Browser's event reducer processes replay, rebuilding state

### Session File Deduplication
When pi continues a session via `--session <file>`, it reuses the same JSONL file but may create a new session ID. The server detects this: when a new session registers with a `sessionFile` already associated with another session, the old session's `sessionFile` is cleared. This prevents the Resume button from loading the wrong conversation.

### On-Demand Session Loading (Server-Side)
When a browser subscribes to a session whose events have been evicted from memory:
1. Server sends empty `event_replay` with `isLast: false` to indicate loading
2. Server's DirectoryService loads the session file directly via `SessionManager.open(sessionFile).getBranch()`
3. Entries are converted via `replayEntriesAsEvents()` and stored in the event buffer
4. Server sends `event_replay` batch to all waiting browsers
5. If the session file is missing or corrupt, server sends `dataUnavailable: true`
6. Concurrent loads for the same session are deduplicated

## Persistence

| Data | Storage | Details |
|------|---------|---------|
| Events | In-memory Map | LRU eviction, max 100 sessions. Pinned if active bridge or browser subscribers. |
| Sessions | In-memory Map + JSON | In-memory registry + `session-persistence.ts` saves metadata to JSON for server restarts. Populated from bridge `session_register` + DirectoryService disk discovery. |
| Hidden sessions | `~/.pi/dashboard/state.json` | Debounced writes (max 1/sec). Atomic write. |
| Pinned directories | `~/.pi/dashboard/state.json` | Ordered array of cwd paths. Pinned dirs always visible in sidebar. |
| Session order | `~/.pi/dashboard/state.json` | Per-cwd ordering managed by `session-order-manager.ts`. |
| Server PID | `~/.pi/dashboard/server.pid` | Tracks running server process for daemon management. |
| Headless PIDs | `~/.pi/dashboard/headless-pids.json` | Maps spawned headless processes to sessions. |
| Session files | `~/.pi/agent/sessions/` (pi's own) | Source of truth. Bridge loads on demand. |

## Configuration

Precedence: CLI flags → environment variables → config file (`~/.pi/dashboard/config.json`)

| Setting | Default | Description |
|---------|---------|-------------|
| `port` | 8000 | HTTP + Browser WebSocket port |
| `piPort` | 9999 | Pi extension WebSocket port |
| `autoStart` | true | Bridge extension auto-starts server if not running |
| `autoShutdown` | true | Server shuts down after idle period |
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

The server is spawned detached (`child_process.spawn` with `detached: true`, `stdio: 'ignore'`, `unref()`), so it outlives the pi session. If multiple pi sessions start simultaneously, duplicate spawn attempts fail harmlessly with EADDRINUSE. After a failed launch, the bridge re-probes the port — if another agent started the server concurrently, the warning is suppressed. The auto-start logic is extracted into `server-auto-start.ts` for testability.

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

### Sidebar Integration

Terminal cards appear alongside agent session cards, sharing the same folder groups and drag-and-drop ordering. Terminal IDs (`term-*`) coexist with session IDs in the `SessionOrderManager`.
