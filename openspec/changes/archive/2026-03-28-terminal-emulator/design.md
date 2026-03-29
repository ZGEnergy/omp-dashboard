## Context

The dashboard currently provides a read/interact layer for pi agent sessions via a three-component architecture: bridge extension → Node.js server → React web client. Communication uses a single JSON WebSocket (`/ws`) defined in `browser-protocol.ts`. Sessions are grouped by `cwd` in the sidebar, ordered by `SessionOrderManager` (ID-agnostic string arrays), and rendered as draggable cards via `@dnd-kit/sortable`.

Adding terminal emulation introduces a new entity type (terminal sessions) that must coexist with agent sessions in the sidebar, share ordering/drag-and-drop, and render a fundamentally different main view (xterm.js canvas vs ChatView).

## Goals / Non-Goals

**Goals:**
- Embed a fully functional terminal emulator with ANSI color support, scrollback, and resize
- Terminal cards visually distinct from agent cards but sharing the same sidebar, grouping, and drag-and-drop
- Server-side output buffering for seamless reconnection and tab switching
- Clean lifecycle: spawn from folder header, auto-remove on shell exit
- Theme-matched terminal appearance

**Non-Goals:**
- Terminal-specific authentication (site-wide OAuth will be added separately)
- Terminal session persistence across server restarts (PTY processes can't survive)
- Collaborative terminal features (multi-user cursor, permissions)
- SSH/remote terminal support

## Decisions

### 1. Dedicated binary WebSocket per terminal (`/ws/terminal/:id`)

**Choice:** Each terminal gets its own WebSocket endpoint carrying raw binary frames.

**Alternatives considered:**
- *Multiplex on existing `/ws` JSON protocol:* Would require base64-encoding all PTY output (33% overhead), JSON parsing on every keystroke, pollutes the dashboard protocol with high-frequency binary data.
- *Separate port:* Unnecessary complexity, CORS/proxy configuration burden.

**Rationale:** Terminal I/O is high-frequency binary data. Dedicated binary WebSocket is the cleanest separation — zero overhead, works directly with xterm.js AttachAddon, no interference with dashboard protocol. Binary frames carry terminal data; text frames on the same socket carry control messages (resize, title).

### 2. xterm.js + node-pty

**Choice:** xterm.js for client-side terminal emulation, node-pty for server-side PTY.

**Alternatives considered:**
- *Custom terminal parser:* Massive effort, guaranteed bugs. xterm.js has years of VT100/ANSI compatibility work.
- *script + piped stdin/stdout:* Loses PTY features (SIGWINCH, job control, TIOCGWINSZ).

**Rationale:** This is the industry standard stack (VS Code, Hyper, Gitpod, Theia). Full ANSI support, battle-tested, actively maintained.

### 3. Server-side ring buffer (256KB) for output replay

**Choice:** Each terminal maintains a circular buffer of raw PTY output bytes on the server.

**Alternatives considered:**
- *Client-only scrollback (no server buffer):* Loses history on reconnect or new browser tab.
- *Unlimited server buffer:* Memory growth risk with long-running terminals.

**Rationale:** 256KB covers ~100K characters of output — ample for replay. Raw byte replay correctly reconstructs ANSI state (colors, cursor position, alternate screen) because xterm.js reprocesses the same byte stream. Combined with client-side 10,000-line scrollback, provides comprehensive history.

### 4. Keep xterm.js instances mounted (CSS hidden/shown)

**Choice:** All terminal views remain in the DOM, toggled via `display: none/flex`.

**Alternatives considered:**
- *Mount/unmount + server replay:* Works but causes visible replay flicker on every switch.
- *LRU cache of mounted instances:* Over-engineering for typical 2-5 terminal use case.

**Rationale:** For a typical user with a handful of terminals, keeping instances alive is negligible memory. Switching is instant with no replay. Server buffer exists as fallback for new browser tabs or reconnection scenarios.

### 5. Separate TerminalSession type (not extending DashboardSession)

**Choice:** New `TerminalSession` interface in `terminal-types.ts`, separate from `DashboardSession`.

**Alternatives considered:**
- *Add type discriminator to DashboardSession:* Makes agent-specific fields optional, adds complexity throughout existing code.

**Rationale:** Clean separation. Agent and terminal sessions have very different fields. The sidebar merges both for display, but state management stays independent. ID namespacing (`term-<uuid>`) prevents collisions.

### 6. Mixed ordering with agent sessions

**Choice:** Terminal IDs join the same per-cwd order arrays in `SessionOrderManager`.

**Rationale:** The order manager is already ID-agnostic — it stores and sorts string arrays. No changes needed. New terminals are prepended (appear at top). Drag-and-drop reordering works identically via `SortableSessionCard` wrapper.

### 7. Terminal WebSocket protocol (binary + text frames)

**Choice:** On the terminal WebSocket:
- **Binary frames:** Raw terminal I/O (keystrokes client→server, PTY output server→client)
- **Text frames:** JSON control messages (`resize`, `title`)

**Rationale:** Clean separation without a custom binary framing protocol. WebSocket frame types distinguish data from control naturally.

## Risks / Trade-offs

- **[Native dependency]** node-pty requires C++ compilation → Users need build toolchain (Xcode CLI tools on macOS, build-essential on Linux). **Mitigation:** Prebuilt binaries available for common platforms; document requirement in README.
- **[Memory per terminal]** Each terminal uses ~256KB server buffer + xterm.js DOM/canvas in browser. **Mitigation:** Acceptable for typical usage (2-5 terminals). Can add LRU eviction later.
- **[Server restart kills terminals]** PTY processes are children of the server process. **Mitigation:** Expected behavior — terminals are ephemeral by nature. Agent sessions survive via event replay; terminals don't need to.
- **[WebGL context limits]** Browsers limit WebGL contexts (~8-16). xterm.js WebGL renderer could hit this with many terminals. **Mitigation:** Use canvas renderer by default, WebGL as opt-in.
