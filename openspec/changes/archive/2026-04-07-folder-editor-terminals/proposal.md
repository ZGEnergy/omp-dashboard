## Why

The sidebar currently mixes terminal cards with pi session cards, cluttering folder groups. Terminals lack a cohesive container — each is a standalone card that navigates to a full-screen view. There's no way to see or switch between multiple terminals for the same folder without sidebar card-hopping. Meanwhile, there's no browser-based code editing — users must context-switch to a separate native editor. Consolidating terminals into a tabbed content view and adding an embedded code-server editor per folder turns the dashboard into a complete development cockpit.

## What Changes

- **Remove terminal cards from the sidebar**. Terminals no longer appear as individual cards alongside pi session cards in folder groups.
- **Add a folder action bar** with buttons: `+Session` | `+Terminal` | `Terminals(N)` | `Editor` | `Zed` | `🧩 Pi Resources`. Replaces the current scattered buttons. `+Terminal` creates a terminal AND navigates to the terminals view. `Terminals(N)` shows a badge with the count of open terminals.
- **New `TerminalsView` content view** with a tab bar for all terminals in a folder. Tabs show terminal name, active indicator, close/rename actions. `[+ New]` button creates additional terminals. Reuses existing `TerminalView` (xterm.js) inside tabs with keep-alive pattern.
- **New `EditorView` content view** embedding code-server (VS Code in the browser) via iframe. Lazy-started on first open per folder. Shows loading state during startup (~2-5s cold start). Header shows folder path and a stop button (mdiStop icon) to kill the instance. EditorInstallGuide shown when binary not found, with a "Retry Detection" button.
- **New `EditorManager` server component** managing code-server child processes per folder. Handles spawn, stop, idle timeout, heartbeat tracking, max instance cap, and port allocation. Reverse-proxies code-server through the dashboard server for same-origin iframe embedding.
- **Editor indicator on sidebar button**: green border + green circle icon when running, blue border + pulsing blue circle icon when starting, yellow alert icon when binary not found, neutral state when stopped. Button title text also updates contextually (e.g., "Editor running — click to open").
- **Theme synchronization**: On editor start, write VS Code `settings.json` into the instance's user-data-dir with `autoDetectColorScheme: false` and `workbench.colorTheme` set to match the dashboard's resolved dark/light mode ("Default Dark Modern" / "Default Light Modern"). `autoDetectColorScheme` is disabled because it reads the OS preference (not the dashboard's theme) and overrides the explicit setting. When the dashboard theme changes while the editor is open, the client calls `POST /api/editor/:id/theme` to rewrite `settings.json` and reloads the iframe so VS Code picks up the new theme. VS Code preserves open files and cursor positions from the user-data-dir across reloads.
- **Auto-detect code-server binary** (or config override). Show install guide when not found (like `ZrokInstallGuide`).
- **`Zed` button** launches Zed natively via existing `open-editor` API (no navigation).
- **Better Pi Resources icon** — replace `mdiPuzzleOutline` with a more representative icon.
- **New routes**: `/folder/:encodedCwd/terminals` and `/folder/:encodedCwd/editor` for folder-scoped views. `/terminal/:id` route kept for backward compatibility.
- **REST API for editor lifecycle**: `POST /api/editor/start` (accepts `{ cwd, theme }`), `POST /api/editor/:id/stop`, `POST /api/editor/:id/heartbeat`, `POST /api/editor/:id/theme` (updates VS Code theme + triggers iframe reload), `GET /api/editor/status`, `GET /api/editor/detect`. All localhost-only.
- Terminal cards removed from sidebar (non-breaking — terminals accessible via folder action bar).

## Capabilities

### New Capabilities
- `folder-action-bar`: Unified button row per folder group replacing scattered action buttons and editor buttons. Contains: +Session, +Terminal, Terminals(N), Editor, Zed, Pi Resources.
- `terminals-view`: Tabbed content view for all terminals within a folder. Tab bar with terminal name, active indicator, close/rename. Keep-alive mounting pattern. [+ New] button for creating terminals within the view.
- `editor-view`: Content view embedding code-server via reverse-proxied iframe. Lazy start, heartbeat, loading/error/install-guide states. Stop button to kill instance. Theme synchronization with dashboard dark/light mode via settings.json rewrite + iframe reload. EditorInstallGuide fallback with retry button when binary not found.
- `editor-manager`: Server-side lifecycle manager for code-server child processes. Per-folder instances with dynamic port allocation, idle timeout, heartbeat tracking, max concurrent instance cap, runtime re-detection of binary. Writes VS Code settings.json with theme preferences on start and on theme change (existing instances update settings too). Reverse proxy via Fastify.
- `editor-detection`: Auto-detection of code-server/openvscode-server binary on PATH or via config override (`editor.binary`).

### Modified Capabilities
- `terminal-emulator`: Terminal cards removed from sidebar. Terminals no longer have individual routes (`/terminal/:id`). Spawn and display moves to `terminals-view`. Terminal creation via `+Terminal` auto-navigates to terminals view.
- `open-in-editor`: Native editor buttons (Zed, etc.) move from per-session-card placement to the folder action bar. Editor detection API unchanged. `code`/`vscode` native launch replaced by browser-based editor-view for VS Code.
- `session-sidebar`: Folder group header restructured to use `folder-action-bar`. Terminal cards removed from the unified sort order.
- `url-routing`: New `/folder/:encodedCwd/terminals` and `/folder/:encodedCwd/editor` routes added. `/terminal/:id` route removed.
- `pi-resources-view`: Icon changed from `mdiPuzzleOutline` to a better-fitting icon. Functionality unchanged.

## Impact

- **Server**: New `editor-manager.ts`, `editor-proxy.ts`, `editor-detection.ts` modules. New `routes/editor-routes.ts` with 6 REST endpoints (including theme). New dependency: `@fastify/http-proxy` for reverse proxying. Optional peer dependency: `code-server` binary. Server broadcasts `editor_status` WebSocket messages on instance lifecycle changes. Runtime re-detection of binary when start is called with no detected binary (handles post-install scenarios).
- **Client**: New `FolderActionBar`, `TerminalsView`, `EditorView`, `EditorInstallGuide` components. New `folder-encoding.ts` utility for base64url route encoding. Modified `SessionList` (remove terminal cards, add action bar). Modified `App.tsx` (new folder routes added alongside existing routes). Modified `useMessageHandler` to handle `editor_status` messages. Modified `SettingsPanel` with editor config section.
- **Shared**: New `editor-types.ts` for editor instance types. New `editor_status` message in browser-protocol. `EditorConfig` added to `DashboardConfig`.
- **Config**: New `editor.binary`, `editor.idleTimeoutMinutes`, `editor.maxInstances` fields in dashboard config under optional `editor` section.
- **Non-breaking**: `/terminal/:id` route kept for backward compatibility. Terminal cards removed from sidebar but terminals remain accessible via folder action bar.
