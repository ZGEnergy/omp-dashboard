## Context

The dashboard currently has terminals as sidebar cards (TerminalCard) mixed with pi session cards. Each terminal routes to `/terminal/:id` and renders a full-screen TerminalView via xterm.js with a keep-alive pattern (all terminals always mounted, CSS-toggled visibility). The server manages terminal PTY processes via TerminalManager and connects them to browsers via binary WebSocket at `/ws/terminal/:id`.

Native editors (Zed, VS Code, IntelliJ) are detected via `editor-registry.ts` and launched as detached CLI processes through `POST /api/open-editor`. Editor buttons currently appear per folder group in the sidebar.

The content area switches views based on route: `/session/:id` → ChatView, `/terminal/:id` → TerminalView, `/settings` → SettingsPanel, etc.

## Goals / Non-Goals

**Goals:**
- Replace terminal sidebar cards with a tabbed TerminalsView in the content area
- Embed code-server (VS Code) as a per-folder iframe content view with lazy lifecycle
- Provide a clean folder action bar with all folder-scoped actions
- Auto-detect code-server binary availability; guide user when missing
- Keep terminal PTY management unchanged (TerminalManager, binary WS)

**Non-Goals:**
- Monaco editor integration (lighter but less capable — full VS Code is the goal)
- Embedding Zed or other native editors in the browser
- Multi-user concurrent editing
- Extension marketplace management from the dashboard
- Docker/container-based code-server deployment

## Decisions

### 1. code-server over openvscode-server

**Choice**: Use `code-server` (coder/code-server) as the embedded editor engine.

**Why**: 77K GitHub stars, MIT license, npm-installable (`npm i -g code-server`), well-documented CLI flags (`--auth none`, `--bind-addr`, `--disable-telemetry`). It supports `--user-data-dir` for per-folder state isolation. openvscode-server is viable but requires binary download rather than npm install, and has a smaller community.

**Alternative**: openvscode-server — closer to upstream VS Code but less convenient to install. Can be supported later via `editor.binary` config override.

### 2. Per-folder instances with idle lifecycle

**Choice**: One code-server child process per folder, lazily started on first open, killed after idle timeout.

**Why**: Per-folder instances provide isolated extension state, open files, and terminal state within code-server. Lazy start avoids wasting resources for folders the user isn't editing. Idle timeout (default 10 min) reclaims the ~300MB RAM each instance uses.

**Alternative**: Singleton instance with folder switching — lower resource usage but loses per-folder state and doesn't match the dashboard's folder-centric model.

### 3. Reverse proxy through dashboard server

**Choice**: Proxy all code-server HTTP/WS traffic through the dashboard's Fastify server at `/editor/:id/*`, using `@fastify/reply-from` for HTTP proxying and raw `net.connect` TCP piping for WebSocket upgrade.

**Why**: Same-origin eliminates CORS/iframe/cookie issues. Works transparently through the zrok tunnel. The browser only talks to one server. Authentication (if configured) applies automatically. `@fastify/reply-from` (lower-level than `@fastify/http-proxy`) gives per-request control over the upstream URL, needed because each editor instance has a different port.

**Alternative**: `@fastify/http-proxy` — higher-level but designed for static upstream URLs, not dynamic per-request routing. Direct browser-to-code-server connection — requires separate port exposure, breaks through tunnels, needs CORS configuration.

### 4. Dynamic port allocation

**Choice**: Use Node.js `net.createServer` with port 0 to find a free port, then pass it to code-server via `--bind-addr 127.0.0.1:<port>`.

**Why**: Zero dependencies, reliable. Avoids port conflicts between instances. The port is ephemeral — only the proxy needs it.

**Alternative**: `get-port` npm package — unnecessary dependency for a 5-line utility.

### 5. Heartbeat-based idle detection

**Choice**: The EditorView iframe sends a heartbeat POST to `/api/editor/:id/heartbeat` every 30 seconds. When no heartbeat arrives for `editor.idleTimeoutMinutes` (default 10), the instance is killed.

**Why**: Iframe visibility events are unreliable (e.g., tab hidden vs. navigated away). A periodic heartbeat from the iframe's parent page is straightforward and robust.

**Alternative**: Track WebSocket connections through the proxy — complex because code-server opens multiple WS connections with varying lifecycles.

### 6. TerminalsView as a folder-scoped tab container

**Choice**: New `TerminalsView` component with a horizontal tab bar. Each tab corresponds to a terminal for that folder. Clicking a tab shows that terminal's xterm.js view. Keep-alive: all terminals for the folder stay mounted, CSS-toggled.

**Why**: Mirrors the existing TerminalView keep-alive pattern but scopes it to a folder. Tab bar provides fast switching without sidebar navigation.

**Alternative**: Accordion/split pane — more complex, less familiar UX.

### 7. Route encoding for folder paths

**Choice**: Encode cwd as base64url for route parameters: `/folder/:encodedCwd/terminals` and `/folder/:encodedCwd/editor`.

**Why**: Folder paths contain `/` which conflict with URL path segments. Base64url encoding is reversible and URL-safe. The encoded string is opaque but functional.

**Alternative**: Double-encoding (`%2F`) — fragile across routers and proxies.

### 8. Editor status via browser protocol

**Choice**: Add `editor_status` message to browser WebSocket protocol. Server broadcasts status changes (starting/running/stopped) so all connected browsers update the sidebar indicator.

**Why**: Consistent with existing patterns (session_added, terminal_added). Reactive — no polling needed.

### 10. Theme synchronization via settings.json rewrite

**Choice**: Disable `window.autoDetectColorScheme` in VS Code settings and directly set `workbench.colorTheme` to match the dashboard's dark/light mode. On theme change, rewrite `settings.json` and reload the iframe.

**Why**: `autoDetectColorScheme` reads the OS color scheme preference (e.g., macOS light mode), not the dashboard's theme — causing VS Code to show light theme even when the dashboard is dark. The iframe's `color-scheme` CSS property does not propagate `prefers-color-scheme` to iframe content. Directly writing the theme to settings.json and reloading is the only reliable approach. VS Code preserves open files and cursor positions from the user-data-dir, so reloads are non-destructive.

**Alternative**: `color-scheme` CSS property on iframe — tested and confirmed not to work (iframe `prefers-color-scheme` follows the OS, not the parent's CSS). `postMessage` API — code-server does not expose a command API for theme changes.

### 9. Config fields for editor

**Choice**: Add to `DashboardConfig`:
```typescript
editor?: {
  binary?: string;            // Override path to code-server binary
  idleTimeoutMinutes?: number; // Default: 10
  maxInstances?: number;       // Default: 3
}
```

**Why**: Optional section — editor feature is opt-in (only works if binary found). All fields have sensible defaults.

## Risks / Trade-offs

**[RAM usage ~300MB per instance]** → Mitigated by idle timeout (default 10 min) and max instance cap (default 3). Oldest idle instance killed first when cap reached.

**[Cold start latency 2-5s]** → Show loading spinner in EditorView during startup. Consider pre-warming when a folder is pinned (future enhancement, not in scope).

**[code-server not installed]** → Auto-detect via `which code-server`. If not found, Editor button shows warning icon; clicking it shows EditorInstallGuide with platform-specific install instructions (like ZrokInstallGuide).

**[code-server version compatibility]** → Test against latest stable. CLI flags used (`--auth none`, `--bind-addr`, `--disable-telemetry`, `--user-data-dir`) have been stable since v4.x.

**[Reverse proxy complexity for WebSocket]** → `@fastify/http-proxy` handles WS upgrade natively. Has been battle-tested in production. Prefix rewriting for code-server's asset paths needs careful configuration.

**[Breaking change: /terminal/:id removed]** → Low risk — terminal URLs are transient (not bookmarked). Existing terminal functionality fully preserved in TerminalsView.

**[iframe focus/keyboard conflicts]** → code-server captures keyboard events. Dashboard keyboard shortcuts won't work while editor iframe is focused. This is expected and acceptable — clicking outside the iframe restores dashboard shortcuts.
