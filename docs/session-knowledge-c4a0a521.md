# Session Knowledge Synthesis: c4a0a521 (General)

Extracted from a 69+ turn, $48+ session covering dashboard infrastructure, pi extension internals, persistence, performance, and operational issues.

---

## 1. Pi Extension API Limitations

### Extension Context vs Command Context
- **ExtensionContext** (from event handlers): has `abort()`, `compact()`, `shutdown()`, `sessionManager`, `modelRegistry` — but NO `reload()`, `prompt()`, or `session` access.
- **ExtensionCommandContext** (only from registered command handlers invoked via pi TUI): extends ExtensionContext with `reload()`, `newSession()`, `fork()`, `navigateTree()`, `switchSession()`.
- There is **no way** for an extension to call `session.prompt()` or `session.reload()` from event handlers. The session object is internal to pi.

### sendUserMessage Skips Command Handling — CRITICAL DISCOVERY
- `pi.sendUserMessage(text)` calls `session.prompt(text, { expandPromptTemplates: false })` — **hardcoded**.
- This means slash commands (`/reload`, `/opsx:archive`, skill commands) sent via `sendUserMessage` are sent as **raw text to the LLM**, not expanded or executed.
- Prompt templates (`.pi/prompts/*.md`) and skill commands (`.pi/skills/*/SKILL.md`) are only expanded when `expandPromptTemplates: true`, which only happens when the user types directly in the pi TUI.
- **There is no API** on the extension runtime to call `session.prompt()` with `expandPromptTemplates: true`.
- `pi.sendMessage()` calls `session.sendCustomMessage()` — for custom message types, not slash commands.

### Agent Streaming Silently Drops Messages — SURPRISE
- When the agent is already streaming, `pi.sendUserMessage()` calls `session.prompt()` without `streamingBehavior`, causing it to **throw an error**.
- The runtime catches this silently: `this.sendUserMessage(content, options).catch((err) => { runner.emitError(...) })`.
- The message is lost. No `agent_start` fires. `pendingPrompt` stays forever.
- **Fix**: Pass `{ deliverAs: "followUp" }` to all `sendUserMessage` calls from the dashboard so messages queue properly.

### Workarounds Developed
1. **Prompt template expansion**: Created `src/extension/prompt-expander.ts` that manually reads `.pi/prompts/` and `.pi/skills/` directories, strips YAML frontmatter, and substitutes args before sending via `sendUserMessage`.
2. **Reload capture**: Registered `__dashboard_reload` command. When invoked from pi TUI, captures `ctx.reload()` into `globalThis`. Dashboard-triggered reloads use the captured function. Requires one-time bootstrap: type `/__dashboard_reload` in pi TUI.
3. **Follow-up delivery**: Added `{ deliverAs: "followUp" }` to all `sendUserMessage` calls.

### Built-in Slash Commands in Pi
- `/reload` is a **built-in** (not extension command). It's handled at the TUI input layer, not through `session.prompt()`.
- Extension commands are found via `_tryExecuteExtensionCommand()` in `session.prompt()` — only when `expandPromptTemplates: true`.
- `session.reload()` triggers: `session_shutdown` event → settings reload → resource loader reload → `session_start` event → extension re-registration.
- The `state.cleanup` callback on the bridge fires BEFORE reload (saves state to `globalThis`, clears timers, disconnects).

---

## 2. Dashboard WebSocket Architecture

### Three Communication Layers
1. **Bridge↔Server** (piPort 9999): `ExtensionToServerMessage` / `ServerToExtensionMessage`
2. **Browser↔Server** (port 8000 `/ws`): `BrowserToServerMessage` / `ServerToBrowserMessage`  
3. **Server↔Browser HTTP** (port 8000): REST API for sessions, health, shutdown

### Session Status Flow
- Bridge connects → `session_register` → `register()` sets `status: "active"`
- Bridge events (`agent_start/end`) update `status` to `"streaming"` / `"idle"`
- Bridge disconnects → heartbeat timeout (45s) → `unregister()` → `status: "ended"`
- Server restart → all non-ended sessions forced to `"ended"` with `dataUnavailable: true`

### Event Flow for Commands
```
Browser → send_prompt → Server → piGateway.sendToSession → Bridge
Bridge → command-handler.ts → parseSendPrompt() → route by type:
  - "bash"       → exec + eventSink(bash_output)
  - "compact"    → ctx.compact() + eventSink(command_feedback)
  - "reload"     → captured reloadFn() + eventSink(command_feedback)
  - "slash"      → expandPromptTemplateFromDisk() → sendUserMessage()
  - "passthrough" → sendUserMessage({ deliverAs: "followUp" })
```

### API Field Names — SURPRISE
- REST API (`/api/sessions`) uses `s.id` not `s.sessionId`
- Session status values: `"idle"`, `"streaming"`, `"ended"` — NOT `"active"` or `"connected"`
- The reload-all script initially failed because it filtered on `s.connected` (doesn't exist) and `s.sessionId` (doesn't exist)

---

## 3. Client State Management

### pendingPrompt Loading Bug (Fixed)
- Client sets `pendingPrompt` optimistically when user sends a message
- It was only cleared by `agent_start` or `message_start` (user role) events
- `!!` commands, `/compact`, and slash commands bypass the LLM → no `agent_start` → infinite spinner
- **Fix**: Clear `pendingPrompt` on `bash_output` and `command_feedback` events in the reducer

### CommandFeedbackCard Status Mapping — GOTCHA
- Card renders spinner for unknown statuses (falls through to default `mdiLoading`)
- Status `"sent"` was not in the config map (`started`, `completed`, `error`)
- Changed slash commands to emit `status: "completed"` instead of `"sent"`

### Lazy vs Eager Subscription — PERFORMANCE FIX
- **Before**: All sessions (including 60+ ended ones) subscribed on browser connect → 60+ concurrent file reads
- **After**: Active sessions auto-subscribe; ended sessions subscribe on-demand when selected
- **Default filter `activeOnly: true`**: Only active/streaming/idle sessions shown by default

### Context Usage Bar Data Flow
- **Live sessions**: Bridge sends `stats_update` with `contextUsage: { tokens, contextWindow }` from `ctx.getContextUsage()`
- **Persisted sessions**: `contextTokens` and `contextWindow` stored on `DashboardSession`
- **Session file enrichment**: `lastTotalTokens` extracted from file, `contextWindow` inferred from model name
- **Client**: `contextUsageMap` merges both sources — live event-reduced state (priority) + server-persisted session data (fallback for all cards)

---

## 4. Server Persistence & Restart

### What Gets Persisted
- `~/.pi/dashboard/sessions.json`: All non-hidden sessions (debounced 1s save)
- `~/.pi/dashboard/config.json`: Server configuration
- `~/.pi/dashboard/state.json`: Hidden sessions, pinned directories, session order

### What Gets Lost on Restart (and fixes)
| Data | Lost? | Fix Applied |
|------|-------|-------------|
| Session list | Restored from sessions.json | — |
| Token stats (cost, tokensIn/Out) | Partial | Enriched from session JSONL files on startup |
| Context usage (tokens/window) | Lost | Added `contextTokens`/`contextWindow` to DashboardSession |
| attachedProposal | Lost on reconnect | Preserved in `register()` merge |
| Session name | Lost on reconnect | Preserved with `name: params.name ?? existing?.name` |
| Chat messages | Lost (in-memory events) | Loaded from session JSONL via standalone reader |
| OpenSpec data | Polled fresh | DirectoryService re-polls async |
| Git info | Polled fresh | Bridge re-polls on reconnect |

### register() Merge Logic — CRITICAL
When a bridge reconnects to a server that has a restored session, `register()` creates a **new session object**. Originally it only carried over `tokensIn/tokensOut/cacheRead/cacheWrite/cost`. Now also preserves:
- `attachedProposal` (user-set, not polled)
- `contextTokens` / `contextWindow`
- `name` (falls back to existing)
- `firstMessage` (falls back to existing)

### Shutdown Flush Bug (Fixed)
- `/api/shutdown` called `process.exit(0)` after 100ms WITHOUT calling `server.stop()`
- `sessionPersistence.flush()` was only in `server.stop()`
- Last debounced save could be lost
- **Fix**: Added `sessionPersistence.flush()` and `stateStore.flush()` before `process.exit()`

### Session Discovery on Startup — CRITICAL CHANGE
- Originally: `register()` → `unregister()` → `update(hidden: true)` for each discovered session
- This triggered `onUnregister` callback for every session (77 broadcasts!), flooding browsers
- **Fix**: Use `sessionManager.restore()` directly — quietly adds sessions without any broadcasts
- Stats enrichment from session files also runs during discovery

### Auto-Resume No Longer Hides Old Session
- Originally: when a session was resumed, the old session got `hidden: true`
- Changed to only clear `resuming` flag — both old and new sessions stay visible

---

## 5. Performance Issues

### OpenSpec Polling Blocked Event Loop — MAJOR DISCOVERY
- `pollOpenSpec()` used `spawnSync` — **synchronous blocking** calls
- For each directory: `openspec list --json` (fast) then `openspec status --change <name> --json` for EVERY change (~750ms each, sequentially)
- With 5 changes across 2 directories: **~7.5 seconds of event loop blocking every 30 seconds**
- During blocking: ALL WebSocket messages queued → attach/detach/commands delayed by seconds
- **This was the root cause of "several seconds to respond" for all operations**
- **Fix**: Created `pollOpenSpecAsync()` using `execFile` (non-blocking). Status queries run **in parallel** via `Promise.all`
- Also fixed `openspec_bulk_archive` which used `execSync`

### Dynamic Import of @mariozechner/pi-coding-agent Fails — CRITICAL DISCOVERY
- Server's `loadSessionEvents()` and `discoverSessions()` used `import("@mariozechner/pi-coding-agent")`
- This is a **peer dependency only available inside pi's process**
- The dashboard server runs independently and does NOT have this package
- The dynamic import **silently failed** → events never loaded, sessions never discovered
- **Fix**: Created standalone modules:
  - `src/server/session-file-reader.ts` — JSONL reader with tree branch traversal
  - `src/server/session-discovery.ts` — reads session files directly from `~/.pi/agent/sessions/<encoded-cwd>/`
  - `src/server/session-stats-reader.ts` — extracts token/cost/context stats

### Session Discovery Results — DRAMATIC
- Before fix: 5 sessions visible for the cwd
- After fix: 77 sessions visible (all historical pi sessions from disk)

### Vitest Process Leaks
- Multiple vitest processes (9 instances, ~500MB each) accumulated from concurrent test runs across sessions
- Used 92% swap (50.9 GiB)
- Manual cleanup required: `ps aux | grep vitest` then `kill`

---

## 6. Session Status Broadcast — MISSING FEATURE

### onDisconnect Was Never Set — BUG
- `piGateway.onDisconnect` callback existed in the interface but was **never assigned** in `server.ts`
- When a bridge disconnected, `unregister()` set `status: "ended"` after heartbeat timeout
- But browsers were **never notified** → cards showed stale "active" status
- **Fix**: Added `onUnregister` callback to `SessionManager`, wired to broadcast `session_updated` to browsers

### Aggressive onDisconnect Breaks /reload — GOTCHA
- First attempt: set session to "ended" immediately on WebSocket close
- **Problem**: During `/reload`, bridge disconnects briefly then reconnects. Immediate end → card flashes "ended" then "active"
- **Fix**: Use `onUnregister` (fires after 45s heartbeat timeout) instead of `onDisconnect`

---

## 7. TypeScript Issues Found & Fixed

| File | Issue | Fix |
|------|-------|-----|
| `SessionCard.tsx` | Missing `formatTokens` import | Added import from `lib/format.ts` |
| `SessionCard.tsx` | `null` not assignable to `string \| undefined` | Used `?? undefined` and `!` assertion |
| `syntax-theme.ts` | `Record<string, unknown>` not assignable to `{ [key: string]: CSSProperties }` | Changed return type, cast imports |
| `tsconfig.json` | `findLastIndex` not in ES2022 | Updated lib to ES2023 |
| `pi-gateway.ts` | `string \| null` not assignable to `string` | Used local `sid` variable |
| `process-manager.ts` | `.unref()` not on `Writable` | Cast `child.stdin` to `any` |
| `headless-pid-registry.ts` | `require()` in ESM module | Changed to static `import { EventEmitter }` |

---

## 8. Reload Infrastructure

### reload-all.sh Script
- Connects to dashboard WebSocket at `ws://localhost:<port>/ws`
- Fetches sessions from `GET /api/sessions`
- Filters: `s.status !== 'ended'` (catches `idle`, `streaming`)
- Sends `send_prompt` with `/reload` to each session
- **Important**: API field is `s.id` not `s.sessionId`, status is not `"active"` or `"connected"`

### devBuildOnReload Config
- `~/.pi/dashboard/config.json` → `devBuildOnReload: boolean` (default: `false`)
- When `true`: bridge cleanup runs `npm run build` + `POST /api/shutdown` before reload
- When `false`: just reloads extensions without building
- reload-all.sh reads this config and runs build only when enabled

### Dashboard Reload Bootstrap — PER-SESSION REQUIREMENT
- Each pi session needs `/__dashboard_reload` typed once in TUI to capture `ctx.reload()`
- The captured fn is stored in `globalThis[__pi_dashboard_reload_fn__]`
- `globalThis` survives module reloads within the same process
- Different pi sessions are different processes → each needs its own bootstrap

---

## 9. Electron Embedding Feasibility

### Key Insight
The dashboard is already a clean client-server architecture. Embedding is trivial:
- `createServer(config)` in Electron main process + `BrowserWindow.loadURL(localhost:8000)` = ~20 lines for v1
- Phases: wrapper → native features → IPC optimization → embedded terminal

### What Stays Unchanged
- Bridge extension, React client, server logic, session persistence

### Key Risk: Bundling
- Server uses dynamic imports, native modules (`ws`), `tsx` for bridge
- Solution: Keep `node_modules` unbundled (common for Electron apps)

---

## 10. UI Improvements Made

### Blue Pi Branding
- π logo: `text-blue-500` with `hover:text-blue-400` (header, sidebar, landing)
- Dashboard robot icon: `text-blue-400` (was `text-green-400`)

### Attaching Indicator
- When selecting from combo box, shows pulsing "Attaching: <name>…" text
- Clears when `attachedProposal` matches on the session object

### Session Card Fallbacks
- When no active `openspecPhase` but `attachedProposal` exists: shows 📋 badge
- Context usage bar: fills from both live events and server-persisted data

---

## 11. Operational Patterns

### Dashboard Commands
```bash
npm run reload           # Reload all pi sessions (no build)
npm run reload:check     # Type-check + reload
./scripts/reload-all.sh  # Direct script
pi-dashboard start       # Daemon mode
```

### Debug Session API
```bash
curl -s http://localhost:8000/api/sessions | node -e "..."
curl -s http://localhost:8000/api/health
curl -s -X POST http://localhost:8000/api/shutdown
```

### Common Issues Checklist
1. **Spinner stuck**: Check `pendingPrompt` clearing for that event type
2. **Slash commands not working from dashboard**: `sendUserMessage` skips expansion → need `expandPromptTemplateFromDisk`
3. **Slow operations (seconds)**: Check for `spawnSync`/`execSync` blocking event loop
4. **Data lost after restart**: Check persistence fields, debounce flush, `register()` merge
5. **Session file loading fails**: Don't use `import("@mariozechner/pi-coding-agent")` — use standalone readers
6. **Sessions not discovered**: `discoverSessionsForCwd()` reads JSONL files directly from disk
7. **Cards show stale status**: Check `onUnregister` broadcast and `session_added` on reconnect
8. **Context bar empty**: Check `contextTokens`/`contextWindow` on DashboardSession + stats enrichment
9. **Messages dropped silently**: Agent might be streaming — need `{ deliverAs: "followUp" }`

### Path Encoding for Session Directories
Pi encodes cwd to directory name: `--Users-robson-Project-pi-agent-dashboard--`
Formula: `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`
Location: `~/.pi/agent/sessions/<encoded-cwd>/`

### Session File Format
- JSONL (one JSON object per line)
- First line: `{ type: "session", id: "...", cwd: "...", timestamp: "..." }`
- Entries have `id`, `parentId` (tree structure), `type`, `timestamp`
- Types: `session`, `message`, `model_change`, `thinking_level_change`, `session_info`, `label`, `leaf`
- Assistant messages include `usage: { input, output, cacheRead, cacheWrite, totalTokens, cost: { total } }`
