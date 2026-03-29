## 1. Dependencies and Shared Types

- [x] 1.1 Add `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-attach` to package.json
- [x] 1.2 Create `src/shared/terminal-types.ts` with `TerminalSession` interface (id, cwd, shell, status, title, createdAt) and `TerminalControlMessage` union type (resize, title)

## 2. Server — Terminal Manager

- [x] 2.1 Create `src/server/terminal-manager.ts` with `RingBuffer` class (256KB circular buffer with `write()` and `contents()`)
- [x] 2.2 Add `spawn(cwd)` method: detect shell from `$SHELL` (fallback `/bin/bash`), spawn PTY via node-pty, assign `term-<nanoid>` ID, create ring buffer, wire `onData` to buffer + client fan-out, wire `onExit` to cleanup
- [x] 2.3 Add `attach(id, ws)` method: replay buffer contents, add WS to client set, route binary frames to `pty.write()`, route text frames to control handler (resize)
- [x] 2.4 Add `kill(id)` method: send SIGTERM to PTY, let onExit handler do cleanup
- [x] 2.5 Add `list()`, `get(id)`, `updateTitle(id, title)` methods
- [x] 2.6 Write tests for RingBuffer (write, overflow, contents)
- [x] 2.7 Write tests for TerminalManager (spawn, attach, kill, shell detection)

## 3. Server — Terminal Gateway

- [x] 3.1 Create `src/server/terminal-gateway.ts` with WebSocket upgrade handler for `/ws/terminal/:id` path
- [x] 3.2 On upgrade: validate terminal ID exists, call `terminalManager.attach(id, ws)`, handle WS close → remove from client set
- [x] 3.3 Write tests for terminal gateway (upgrade handling, invalid ID rejection)

## 4. Server — Integration with Browser Protocol

- [x] 4.1 Add `terminal_added`, `terminal_removed`, `terminal_updated` to `ServerToBrowserMessage` in `browser-protocol.ts`
- [x] 4.2 Add `create_terminal`, `kill_terminal`, `rename_terminal` to `BrowserToServerMessage` in `browser-protocol.ts`
- [x] 4.3 Wire `create_terminal` handler in `server.ts` or `browser-gateway.ts`: call `terminalManager.spawn(cwd)`, insert ID into `SessionOrderManager`, broadcast `terminal_added`
- [x] 4.4 Wire `kill_terminal` handler: call `terminalManager.kill(id)`
- [x] 4.5 Wire `rename_terminal` handler: call `terminalManager.updateTitle(id, title)`, broadcast `terminal_updated`
- [x] 4.6 Wire PTY exit callback: remove from `SessionOrderManager`, broadcast `terminal_removed`
- [x] 4.7 On browser WS connect (initial sync): send list of active terminals alongside sessions

## 5. Client — Terminal View Component

- [x] 5.1 Create `src/client/components/TerminalView.tsx`: mount xterm.js Terminal instance with 10,000-line scrollback, load FitAddon
- [x] 5.2 Open binary WebSocket to `/ws/terminal/:id` on mount, attach via AttachAddon
- [x] 5.3 Implement resize handling: FitAddon `fit()` on container resize (ResizeObserver), send resize control message as text frame
- [x] 5.4 Implement theme mapping: derive xterm.js `ITheme` from dashboard CSS variables, update on theme change
- [x] 5.5 Add minimal terminal header with name display and close button (sends `kill_terminal`)
- [x] 5.6 Listen for xterm.js `title` event, send title update to server via dashboard WS

## 6. Client — Terminal Card

- [x] 6.1 Create `src/client/components/TerminalCard.tsx`: card with cyan left border (`border-l-2 border-cyan-500`), console icon (`mdiConsoleLine`), terminal name, cwd display
- [x] 6.2 Add close button on terminal card (sends `kill_terminal`)
- [x] 6.3 Support inline rename (reuse `InlineRenameInput` pattern from SessionCard)

## 7. Client — Sidebar Integration

- [x] 7.1 Add terminal state management in `App.tsx`: `terminals` Map, handle `terminal_added`/`terminal_removed`/`terminal_updated` messages
- [x] 7.2 Add [>_ Term] button in folder group header in `SessionList.tsx` (next to existing "New" button), wired to `create_terminal` message
- [x] 7.3 Merge terminal cards into folder groups in `SessionList.tsx`: combine agent sessions and terminals, sort by unified order array
- [x] 7.4 Wrap terminal cards in `SortableSessionCard` for drag-and-drop reordering
- [x] 7.5 Handle terminal card click: navigate to `/terminal/:id`

## 8. Client — Routing and Keep-Alive

- [x] 8.1 Add `/terminal/:id` route in `App.tsx` using wouter
- [x] 8.2 Render all terminal TerminalView instances simultaneously (CSS hidden/shown via `display: none/flex`), show selected one
- [x] 8.3 On `terminal_removed`: if the removed terminal is selected, navigate to landing page; destroy the kept-alive xterm instance
- [x] 8.4 Handle invalid terminal URL (redirect to landing page)

## 9. Documentation

- [x] 9.1 Update `AGENTS.md` key files table with new terminal files
- [x] 9.2 Update `docs/architecture.md` with terminal data flow, WebSocket protocol, and PTY lifecycle
- [x] 9.3 Update `README.md` with node-pty build requirements and terminal feature description
