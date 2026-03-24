## 1. Database & Types

- [x] 1.1 Add `session_file TEXT`, `session_dir TEXT`, `hidden INTEGER DEFAULT 0`, `first_message TEXT` ALTER migrations to `db.ts`
- [x] 1.2 Add `sessionFile`, `sessionDir`, `hidden`, `firstMessage` fields to `DashboardSession` in `types.ts`
- [x] 1.3 Add `PiSessionInfo` type to `types.ts` (id, path, cwd, name, parentSessionPath, created, modified, messageCount, firstMessage)
- [x] 1.4 Add `sessionFile`, `sessionDir`, `hidden`, `firstMessage` to `PERSISTABLE_FIELDS` in `session-manager.ts`, update hydration query and row mapping
- [x] 1.5 Update `register()` to set `hidden = false` on registration
- [x] 1.6 Update `unregister()` to set `hidden = true` on unregistration
- [x] 1.7 Update stale session hydration to set `hidden = true` for stale active/streaming sessions
- [x] 1.8 Write tests for hidden lifecycle (register sets false, unregister sets true, hydration sets true for stale)

## 2. Protocol Messages

- [x] 2.1 Add `sessionFile`, `sessionDir`, and `firstMessage` optional fields to `SessionRegisterMessage` in `protocol.ts`
- [x] 2.2 Add `ListSessionsMessage` (server → extension) and `SessionsListMessage` (extension → server) to `protocol.ts`
- [x] 2.3 Add `ListSessionsBrowserMessage`, `SessionsListBrowserMessage`, `ResumeSessionBrowserMessage`, `ResumeResultBrowserMessage` to `browser-protocol.ts`
- [x] 2.4 Add new message types to the union types in both protocol files

## 3. Bridge Extension — Pi Session ID

- [x] 3.1 Change `sessionId` from `const crypto.randomUUID()` to `let sessionId: string` in `bridge.ts`
- [x] 3.2 Set `sessionId` from `ctx.sessionManager.getSessionId()` during `session_start`
- [x] 3.3 Send `sessionFile`, `sessionDir`, and `firstMessage` (extracted from first user message in `ctx.sessionManager.getEntries()`) in `session_register`
- [x] 3.4 Include `sessionFile`, `sessionDir`, and `firstMessage` in `sendStateSync()`

## 4. Bridge Extension — Session Switch & Fork

- [x] 4.1 Add `session_switch` and `session_fork` event listeners in `bridge.ts`
- [x] 4.2 Extract shared handler `handleSessionChange(ctx)`: send `session_unregister` for old ID, update `sessionId` from `ctx.sessionManager.getSessionId()`, update `sessionFile` and `sessionDir` from ctx, send new `session_register`, run full state sync
- [x] 4.3 Wire `session_switch` event to call `handleSessionChange(ctx)` (triggered by `/new` and `/resume`)
- [x] 4.4 Wire `session_fork` event to call `handleSessionChange(ctx)` (triggered by `/fork`)
- [x] 4.5 Clear and restart polling timers (git, openspec) on session change
- [x] 4.6 Write tests for session switch handling (old unregistered, new registered, events use new ID)
- [x] 4.7 Write tests for session fork handling (same behavior as switch: old unregistered, new registered)

## 5. Bridge Extension — Session Listing

- [x] 5.1 Add `list_sessions` case to command handler in `command-handler.ts`
- [x] 5.2 Import `SessionManager` from `@mariozechner/pi-coding-agent` and call `SessionManager.list(cwd)` 
- [x] 5.3 Map `SessionInfo[]` to `PiSessionInfo[]` and return as `sessions_list` message
- [x] 5.4 Handle errors gracefully (return empty array on failure)
- [x] 5.5 Write tests for list sessions handler (success, failure, empty)

## 6. Server — Session File & Hidden Persistence

- [x] 6.1 Update `pi-gateway.ts` to extract `sessionFile` and `sessionDir` from `session_register` and pass to `sessionManager.register()`
- [x] 6.2 Update `RegisterSessionParams` to include `sessionFile` and `sessionDir`
- [x] 6.3 Update `session-manager.ts` `register()` to persist `session_file`, `session_dir`, `hidden = false`
- [x] 6.4 Update session hydration to mark stale sessions as `hidden = true`
- [x] 6.5 Write integration test: session registers with file/dir, ends with hidden=true, re-registers with hidden=false

## 7. Server — Session Listing Flow

- [x] 7.1 Handle `sessions_list` from bridge in `server.ts` `onEvent`: create SQLite records for unknown sessions
- [x] 7.2 Handle `list_sessions` from browser in `browser-gateway.ts`: forward to a bridge for matching cwd
- [x] 7.3 Add helper to find a connected bridge by cwd prefix in `pi-gateway.ts`
- [x] 7.4 Forward `sessions_list` response to requesting browser
- [x] 7.5 Fallback: if no bridge connected, return sessions from SQLite filtered by cwd
- [x] 7.6 Write tests for session creation from listing (new sessions created, existing not overwritten)

## 8. Server — Resume/Fork

- [x] 8.1 Extend `spawnPiSession()` in `process-manager.ts` to accept `sessionFile` and `mode` parameters
- [x] 8.2 Update `buildTmuxCommand()` to include `--session <path>` or `--fork <path>` based on mode
- [x] 8.3 Handle `resume_session` from browser in `browser-gateway.ts`: look up session file, call spawnPiSession, send result
- [x] 8.4 Validate session exists and has `session_file` before spawning
- [x] 8.5 Validate session is not already active before continue mode
- [x] 8.6 Write tests for process-manager with session file and mode parameters

## 9. Client — Hidden Toggle & Resume UI

- [x] 9.1 Update session filtering to use server-side `hidden` flag instead of client-side localStorage
- [x] 9.2 Remove legacy `hiddenSessions` localStorage key on load
- [x] 9.3 Change "Active only" toggle default to ON
- [x] 9.4 Add "Show hidden" toggle that reveals sessions with `hidden = true`
- [x] 9.5 Show hidden sessions with muted styling (reduced opacity)
- [x] 9.6 Add "Resume" and "Fork" buttons on hidden session cards
- [x] 9.7 Send `resume_session` message on Resume/Fork click
- [x] 9.8 Show hidden count indicator ("N hidden") when toggle is off
- [x] 9.9 Handle `resume_result` message (show success/error toast)
- [x] 9.10 Add `list_sessions` request on workspace selection to discover pi-only sessions
- [x] 9.11 Update `getSessionDisplayName()` fallback chain: name → firstMessage (truncated to 50 chars) → cwd last segment → session ID
- [x] 9.12 Write tests for updated display name logic with firstMessage fallback
