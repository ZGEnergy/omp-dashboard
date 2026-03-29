## Why

The dashboard provides full visibility into pi agent sessions but lacks direct shell access. Users frequently need to run quick commands — checking logs, restarting services, running tests — and must switch to a separate terminal application. Embedding a real terminal emulator in the dashboard eliminates this context switch, keeping all development activity in one place.

## What Changes

- Add a browser-based terminal emulator using **xterm.js** (client) and **node-pty** (server) connected via binary WebSocket
- Terminal sessions appear as **cards in the sidebar** alongside agent sessions, visually distinguished by a cyan left border accent and `>_` icon
- Terminals are **mixed with agent cards** in the same workspace groups, sharing the same drag-and-drop reordering
- New terminals spawn via a **[>_ Term] button** in each folder group header (next to the existing "New" button)
- Each terminal gets a **dedicated binary WebSocket** at `/ws/terminal/:id` — no interference with the existing JSON dashboard protocol
- Server maintains a **256KB ring buffer** per terminal for output replay on reconnect or tab switch
- xterm.js instances stay **mounted in DOM** (CSS hidden/shown) for instant switching without losing scrollback
- Terminal names auto-update from **PTY title escape sequences** and support manual rename
- Typing `exit` or shell termination sends **SIGTERM**, cleans up the PTY, and removes the card
- Shell auto-detected from `$SHELL` environment variable
- xterm.js theme **matches the dashboard theme** via CSS variable mapping
- Client-side scrollback of **10,000 lines** with mouse wheel and keyboard scroll support

## Capabilities

### New Capabilities
- `terminal-emulator`: Full browser-based terminal emulator with PTY backend, binary WebSocket transport, output buffering, and sidebar integration as draggable cards

### Modified Capabilities
<!-- No existing spec-level requirements change. The session ordering system is ID-agnostic
     and handles terminal IDs without modification. The sidebar renders an additional card type
     but existing card behavior is unchanged. -->

## Impact

- **New dependencies**: `node-pty` (native C++ addon — requires build toolchain), `@xterm/xterm`, `@xterm/addon-fit`, optionally `@xterm/addon-webgl`
- **New server files**: `terminal-manager.ts` (PTY lifecycle + ring buffer), `terminal-gateway.ts` (WebSocket upgrade handler)
- **New client files**: `TerminalView.tsx` (xterm.js wrapper), `TerminalCard.tsx` (sidebar card)
- **New shared types**: `terminal-types.ts` (TerminalSession, control messages)
- **Modified**: `browser-protocol.ts` (terminal_added/removed/create messages), `server.ts` (wire terminal gateway), `SessionList.tsx` (merge terminal cards into groups, add button), `App.tsx` (new route `/terminal/:id`, terminal state, keep-alive rendering)
- **Build**: `node-pty` native compilation adds platform-specific build requirements
