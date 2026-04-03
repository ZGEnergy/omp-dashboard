## 1. Shared Types & Config

- [ ] 1.1 Add `EditorConfig` to `DashboardConfig` in `src/shared/config.ts` (`editor?: { binary?: string; idleTimeoutMinutes?: number; maxInstances?: number }`) with defaults
- [ ] 1.2 Create `src/shared/editor-types.ts` with `EditorInstance` type (`id, cwd, port, status: "starting" | "ready" | "stopped", proxyPath`) and `EditorDetectionResult` type
- [ ] 1.3 Add `editor_status` message to `src/shared/browser-protocol.ts` (server→browser: `{ type: "editor_status", cwd, id, status }`)
- [ ] 1.4 Add base64url encode/decode helpers to `src/client/lib/` for cwd encoding in routes

## 2. Server: Editor Detection

- [ ] 2.1 Create `src/server/editor-detection.ts` — detect code-server/openvscode-server binary (config override → `which code-server` → `which openvscode-server`), cache result
- [ ] 2.2 Add `GET /api/editor/detect` endpoint to `src/server/server.ts` (localhost-only)
- [ ] 2.3 Write tests for editor detection (binary found, not found, config override, openvscode fallback)

## 3. Server: EditorManager

- [ ] 3.1 Create `src/server/editor-manager.ts` — `start(cwd)`, `stop(id)`, `heartbeat(id)`, `get(id)`, `getByFolder(cwd)`, `list()`, `stopAll()`
- [ ] 3.2 Implement dynamic port allocation using `net.createServer` with port 0
- [ ] 3.3 Implement ready probe (TCP connect retry loop to code-server port)
- [ ] 3.4 Implement idle timeout timer (reset on heartbeat, kill on expiry)
- [ ] 3.5 Implement max instances cap with oldest-idle eviction
- [ ] 3.6 Add `onStatusChange` callback for broadcasting status to browser gateway
- [ ] 3.7 Write tests for EditorManager (start, stop, idle timeout, max instances, duplicate start)

## 4. Server: Reverse Proxy & API

- [ ] 4.1 Add `@fastify/http-proxy` dependency
- [ ] 4.2 Create `src/server/editor-proxy.ts` — dynamic reverse proxy for `/editor/:id/*` with WebSocket upgrade support
- [ ] 4.3 Add REST endpoints to `src/server/server.ts`: `POST /api/editor/start`, `POST /api/editor/:id/heartbeat`, `POST /api/editor/:id/stop`, `GET /api/editor/status`
- [ ] 4.4 Wire EditorManager into server lifecycle (create on startup, stopAll on shutdown)
- [ ] 4.5 Broadcast `editor_status` messages through browser gateway on status changes

## 5. Client: Route Restructuring

- [ ] 5.1 Add `/folder/:encodedCwd/terminals` and `/folder/:encodedCwd/editor` routes to `App.tsx`
- [ ] 5.2 Remove `/terminal/:id` route from `App.tsx`
- [ ] 5.3 Remove terminal keep-alive rendering from App.tsx top level (moves into TerminalsView)
- [ ] 5.4 Update mobile routing in `MobileShell` for new folder routes
- [ ] 5.5 Update `getMobileDepth` in `src/client/lib/mobile-depth.ts` for folder routes

## 6. Client: FolderActionBar

- [ ] 6.1 Create `src/client/components/FolderActionBar.tsx` with +Session, +Terminal, Terminals(N), Editor, Zed, Pi Resources buttons
- [ ] 6.2 Integrate editor status indicator on Editor button (green dot running, pulsing starting, warning not found)
- [ ] 6.3 Wire Zed button to existing `POST /api/open-editor` (no navigation)
- [ ] 6.4 Replace existing scattered buttons in `SessionList.tsx` folder group with FolderActionBar
- [ ] 6.5 Update Pi Resources icon from `mdiPuzzleOutline` to `mdiToyBrickOutline`

## 7. Client: TerminalsView

- [ ] 7.1 Create `src/client/components/TerminalsView.tsx` with tab bar, folder path header, and empty state
- [ ] 7.2 Implement tab switching with keep-alive pattern (CSS visibility toggle for all folder terminals)
- [ ] 7.3 Implement tab close (kills terminal via existing WS message, selects adjacent tab)
- [ ] 7.4 Implement tab rename via double-click (reuse InlineRenameInput)
- [ ] 7.5 Implement [+ New] button in tab bar (creates terminal, activates new tab)
- [ ] 7.6 Wire +Terminal sidebar button to create terminal AND navigate to TerminalsView

## 8. Client: EditorView & Install Guide

- [ ] 8.1 Create `src/client/components/EditorView.tsx` with iframe embedding, loading spinner, folder path header
- [ ] 8.2 Implement lazy start: call `POST /api/editor/start` on mount, show iframe when ready
- [ ] 8.3 Implement heartbeat interval (30s POST to `/api/editor/:id/heartbeat`) while mounted
- [ ] 8.4 Handle error states: binary not found → install guide, crash → retry button
- [ ] 8.5 Create `src/client/components/EditorInstallGuide.tsx` with platform-specific install instructions (macOS brew, Linux curl, npm global)
- [ ] 8.6 Listen for `editor_status` WS messages to update editor button indicators and handle instance crashes

## 9. Sidebar Cleanup

- [ ] 9.1 Remove TerminalCard rendering from SessionList folder groups
- [ ] 9.2 Remove terminal cards from unified sort order (`getUnifiedOrder`)
- [ ] 9.3 Remove TerminalCard import and related props from SessionList
- [ ] 9.4 Exclude `vscode`/`code` from native editor buttons in action bar (served via EditorView instead)

## 10. Settings & Documentation

- [ ] 10.1 Add editor config section to `SettingsPanel.tsx` (binary path, idle timeout, max instances)
- [ ] 10.2 Update `AGENTS.md` key files table with new components
- [ ] 10.3 Update `docs/architecture.md` with editor manager architecture and proxy flow
- [ ] 10.4 Update `README.md` with code-server setup instructions and editor config reference
