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
- Loads historical session files on demand via `SessionManager.open()`

### 2. Dashboard Server (`src/server/`)
A Node.js HTTP + WebSocket server that:
- Accepts connections from bridge extensions (Pi Gateway, port 9999)
- Accepts connections from web browsers (Browser Gateway, port 8000)
- Stores events in an in-memory buffer with LRU eviction (max 100 sessions)
- Manages sessions in a pure in-memory registry (populated from bridge connections)
- Persists workspaces in `~/.pi/dashboard/workspaces.json`
- Persists user preferences (hidden sessions) in `~/.pi/dashboard/state.json`
- Requests on-demand session loading from bridge extensions for evicted sessions
- Serves the built web client as static files
- Exposes REST API for workspace CRUD, session management, event content fetch

### 3. Web Client (`src/client/`)
A React-based responsive web UI that:
- Shows all active sessions organized by workspace
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

### Command Flow (browser → pi)
1. User types prompt or command in browser
2. Browser sends `send_prompt` via WebSocket
3. Server routes to correct bridge extension by sessionId
4. Bridge extension calls `pi.sendUserMessage()` or dispatches command
5. Pi processes the command, events flow back via event flow

### Model & Thinking Level Flow
1. Bridge sends current model and thinking level in `session_register` on connect
2. When user changes model (via `/model`), pi emits `model_select` event
3. Bridge enriches the event with current `thinkingLevel` from context before forwarding
4. Bridge also sends a `model_update` protocol message for session-level tracking
5. Server extracts model/thinkingLevel from events and `model_update`, broadcasts to browsers
6. Thinking level changes (via pi keybinding) are detected by polling every 30s
7. Browser can send `set_thinking_level` to change thinking level remotely

### Reconnection Flow
1. Browser reconnects with `subscribe` message including `lastSeq`
2. Server replays missed events from in-memory buffer in batches of 200
3. Browser's event reducer processes replay, rebuilding state

### On-Demand Session Loading
When a browser subscribes to a session whose events have been evicted from memory:
1. Server sends empty `event_replay` with `isLast: false` to indicate loading
2. Server sends `load_session_events` to a connected bridge in the same workspace
3. Bridge calls `SessionManager.open(sessionFile).getBranch()` to load the session
4. Bridge converts entries via `replayEntriesAsEvents()` and sends back as `load_session_events_result`
5. Server stores events in memory and sends `event_replay` batch to waiting browsers
6. If no bridge is available or loading times out (10s), server sends `dataUnavailable: true`

## Persistence

| Data | Storage | Details |
|------|---------|---------|
| Events | In-memory Map | LRU eviction, max 100 sessions. Pinned if active bridge or browser subscribers. |
| Sessions | In-memory Map | Populated from bridge `session_register` + `session_history_sync`. Empty on restart. |
| Workspaces | `~/.pi/dashboard/workspaces.json` | Atomic write (tmp+rename). Read on startup. |
| Hidden sessions | `~/.pi/dashboard/state.json` | Debounced writes (max 1/sec). Atomic write. |
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

The server is spawned detached (`child_process.spawn` with `detached: true`, `stdio: 'ignore'`, `unref()`), so it outlives the pi session. If multiple pi sessions start simultaneously, duplicate spawn attempts fail harmlessly with EADDRINUSE.
