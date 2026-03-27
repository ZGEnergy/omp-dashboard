# Session Knowledge Synthesis: c4a0a521 (General)

Extracted from a 69-turn, $45+ session covering dashboard infrastructure, pi extension internals, and operational issues.

---

## 1. Pi Extension API Limitations

### Extension Context vs Command Context
- **ExtensionContext** (from event handlers): has `abort()`, `compact()`, `shutdown()`, `sessionManager`, `modelRegistry` — but NO `reload()`, `prompt()`, or `session` access.
- **ExtensionCommandContext** (only from registered command handlers): extends ExtensionContext with `reload()`, `newSession()`, `fork()`, `navigateTree()`, `switchSession()`.
- There is **no way** for an extension to call `session.prompt()` or `session.reload()` from event handlers. The session object is internal to pi.

### sendUserMessage Skips Command Handling
- `pi.sendUserMessage(text)` calls `session.prompt(text, { expandPromptTemplates: false })` — **hardcoded**.
- This means slash commands (`/reload`, `/opsx:archive`, skill commands) sent via `sendUserMessage` are sent as **raw text to the LLM**, not expanded or executed.
- Prompt templates (`.pi/prompts/*.md`) and skill commands (`.pi/skills/*/SKILL.md`) are only expanded when `expandPromptTemplates: true`, which is only set when the user types directly in the pi TUI.

### Workarounds Developed
1. **Prompt template expansion**: Created `src/extension/prompt-expander.ts` that manually reads `.pi/prompts/` and `.pi/skills/` directories, strips YAML frontmatter, and substitutes args before sending via `sendUserMessage`.
2. **Reload capture**: Registered `__dashboard_reload` command. When invoked from pi TUI, captures `ctx.reload()` into `globalThis`. Dashboard-triggered reloads use the captured function. Requires one-time bootstrap: type `/__dashboard_reload` in pi TUI.
3. **Follow-up delivery**: Added `{ deliverAs: "followUp" }` to all `sendUserMessage` calls so messages queue properly when the agent is streaming, instead of being silently dropped.

### Built-in Slash Commands in Pi
- `/reload` is a **built-in** (not extension command). It's handled at the TUI input layer, not through `session.prompt()`.
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
- Bridge disconnects → heartbeat timeout → `unregister()` → `status: "ended"`
- Server restart → all non-ended sessions forced to `"ended"` with `dataUnavailable: true`

### Event Flow for Commands
```
Browser → send_prompt → Server → piGateway.sendToSession → Bridge
Bridge → command-handler.ts → parseSendPrompt() → route by type:
  - "bash"    → exec + eventSink(bash_output)
  - "compact" → ctx.compact() + eventSink(command_feedback)
  - "reload"  → captured reloadFn()
  - "slash"   → expandPromptTemplateFromDisk() → sendUserMessage()
  - "passthrough" → sendUserMessage({ deliverAs: "followUp" })
```

---

## 3. Client State Management

### pendingPrompt Loading Bug (Fixed)
- Client sets `pendingPrompt` optimistically when user sends a message
- It was only cleared by `agent_start` or `message_start` (user role) events
- `!!` commands, `/compact`, and slash commands bypass the LLM → no `agent_start` → infinite spinner
- **Fix**: Clear `pendingPrompt` on `bash_output` and `command_feedback` events in the reducer

### Lazy vs Eager Subscription
- **Before**: All sessions (including 60+ ended ones) subscribed on browser connect → 60+ concurrent file reads → slow
- **After**: Active sessions auto-subscribe; ended sessions subscribe on-demand when selected
- Event replay loads from `sessionFile` on disk via `directoryService.loadSessionEvents()`

### Context Usage Bar Data Flow
- **Live sessions**: Bridge sends `stats_update` with `contextUsage: { tokens, contextWindow }` from `ctx.getContextUsage()`
- **Persisted sessions**: `contextTokens` and `contextWindow` stored on `DashboardSession`, populated from session file `totalTokens` + model-inferred window size
- **Client**: `contextUsageMap` merges both sources — live state takes priority, server-persisted is fallback

---

## 4. Server Persistence & Restart

### What Gets Persisted
- `~/.pi/dashboard/sessions.json`: All non-hidden sessions (debounced 1s save)
- `~/.pi/dashboard/config.json`: Server configuration
- `~/.pi/dashboard/state.json`: Hidden sessions, pinned directories, session order

### What Gets Lost on Restart (and fixes)
| Data | Lost? | Fix Applied |
|------|-------|-------------|
| Session list | ✓ Restored from sessions.json | — |
| Token stats (cost, tokensIn/Out) | Partial | Enriched from session JSONL files on startup |
| Context usage (tokens/window) | ✓ Lost | Added `contextTokens`/`contextWindow` to DashboardSession, persist + enrich |
| attachedProposal | ✓ Lost on reconnect | Preserved in `register()` merge |
| Session name | ✓ Lost on reconnect | Preserved with `name: params.name ?? existing?.name` |
| Chat messages | ✓ Lost (in-memory events) | Loaded from session JSONL on subscribe |
| OpenSpec data | Polled fresh | DirectoryService re-polls async |
| Git info | Polled fresh | Bridge re-polls on reconnect |

### Shutdown Flush Bug (Fixed)
- `/api/shutdown` called `process.exit(0)` after 100ms WITHOUT calling `server.stop()`
- `sessionPersistence.flush()` was only in `server.stop()`
- Last debounced save could be lost
- **Fix**: Added `sessionPersistence.flush()` and `stateStore.flush()` before `process.exit()`

---

## 5. Performance Issues

### OpenSpec Polling Blocked Event Loop (Fixed)
- `pollOpenSpec()` used `spawnSync` — synchronous blocking calls
- For each directory: `openspec list --json` (fast) then `openspec status --change <name> --json` for EVERY change (~750ms each)
- With 5 changes: ~4 seconds of event loop blocking every 30 seconds
- During blocking: WebSocket messages queued → attach/detach/commands delayed by seconds
- **Fix**: Created `pollOpenSpecAsync()` using `execFile` (non-blocking). Status queries run in parallel via `Promise.all`

### Session File Loading
- `loadSessionEvents` originally used `import("@mariozechner/pi-coding-agent")` — a peer dependency NOT available in the server process
- Dynamic import silently failed → events never loaded for ended sessions
- **Fix**: Created `src/server/session-file-reader.ts` — standalone JSONL reader with tree branch traversal, no pi dependency

### Vitest Process Leaks
- Multiple vitest processes (9 instances, ~500MB each) accumulated from concurrent test runs across sessions
- Used 92% swap (50.9 GiB)
- Manual cleanup: `ps aux | grep vitest | kill`

---

## 6. TypeScript Issues Found & Fixed

| File | Issue | Fix |
|------|-------|-----|
| `SessionCard.tsx` | Missing `formatTokens` import | Added import from `lib/format.ts` |
| `SessionCard.tsx` | `null` not assignable to `string \| undefined` | Used `?? undefined` and `!` assertion |
| `syntax-theme.ts` | `Record<string, unknown>` not assignable to `{ [key: string]: CSSProperties }` | Changed return type, cast imports |
| `tsconfig.json` | `findLastIndex` not in ES2022 | Updated lib to ES2023 |
| `pi-gateway.ts` | `string \| null` not assignable to `string` | Used local `sid` variable in narrowed block |
| `process-manager.ts` | `.unref()` not on `Writable` | Cast `child.stdin` to `any` |
| `headless-pid-registry.ts` | `require()` in ESM module | Changed to static `import { EventEmitter }` |

---

## 7. Reload Infrastructure

### reload-all.sh Script
- Connects to dashboard WebSocket at `ws://localhost:<port>/ws`
- Fetches sessions from `GET /api/sessions`
- Filters: `s.status !== 'ended'` (catches `idle`, `active`, `streaming`)
- Sends `send_prompt` with `/reload` to each session
- API field names: `s.id` (not `sessionId`), `s.status` (not `connected`)

### devBuildOnReload Config
- `~/.pi/dashboard/config.json` → `devBuildOnReload: boolean`
- When `true`: bridge cleanup runs `npm run build` + `POST /api/shutdown` before reload
- When `false`: just reloads extensions without building

---

## 8. Electron Embedding Feasibility

### Key Insight
The dashboard is already a clean client-server architecture. Electron embedding is trivial:
- **Phase 1** (~20 lines): `createServer(config)` in Electron main process + `BrowserWindow.loadURL(localhost:8000)`
- **Phase 2**: Native features (tray, notifications, `node-pty` + `xterm.js`)
- **Phase 3**: Replace browser WebSocket with Electron IPC
- **Phase 4**: Embedded terminal panels per session

### What Stays Unchanged
- Bridge extension (connects to piPort as before)
- React client (zero changes for Phase 1)
- Server logic (imported as module)
- Session persistence (same JSON files)

### Key Risk: Bundling
- Server uses dynamic imports, native modules (`ws`), and `tsx` for bridge
- Solution: Keep `node_modules` unbundled (common for Electron apps)

---

## 9. Operational Patterns

### Dashboard Commands
```bash
npm run reload           # Reload all pi sessions (no build)
npm run reload:check     # Type-check + reload
./scripts/reload-all.sh  # Direct script
pi-dashboard             # Start server
pi-dashboard start       # Daemon mode
pi-dashboard stop        # Stop daemon
```

### Debug Session API
```bash
curl -s http://localhost:8000/api/sessions | node -e "..."  # Query sessions
curl -s http://localhost:8000/api/health                     # Check server
curl -s -X POST http://localhost:8000/api/shutdown           # Stop server
```

### Common Issues
1. **Spinner stuck on message**: Check if `pendingPrompt` is being cleared by the right event type
2. **Slash commands not working from dashboard**: `sendUserMessage` skips command expansion — need `expandPromptTemplateFromDisk`
3. **Slow operations**: Check for `spawnSync` or `execSync` blocking the event loop
4. **Data lost after restart**: Check persistence fields, debounce flush, and `register()` merge logic
5. **Session file loading fails**: Check if using `import("@mariozechner/pi-coding-agent")` — won't work outside pi process
