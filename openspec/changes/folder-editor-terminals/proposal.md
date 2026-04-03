## Why

The sidebar currently mixes terminal cards with pi session cards, cluttering folder groups. Terminals lack a cohesive container — each is a standalone card that navigates to a full-screen view. There's no way to see or switch between multiple terminals for the same folder without sidebar card-hopping. Meanwhile, there's no browser-based code editing — users must context-switch to a separate native editor. Consolidating terminals into a tabbed content view and adding an embedded code-server editor per folder turns the dashboard into a complete development cockpit.

## What Changes

- **Remove terminal cards from the sidebar**. Terminals no longer appear as individual cards alongside pi session cards in folder groups.
- **Add a folder action bar** with buttons: `+Session` | `+Terminal` | `Terminals(N)` | `Editor` | `Zed` | `🧩 Pi Resources`. Replaces the current scattered buttons. `+Terminal` creates a terminal AND navigates to the terminals view. `Terminals(N)` shows a badge with the count of open terminals.
- **New `TerminalsView` content view** with a tab bar for all terminals in a folder. Tabs show terminal name, active indicator, close/rename actions. `[+ New]` button creates additional terminals. Reuses existing `TerminalView` (xterm.js) inside tabs with keep-alive pattern.
- **New `EditorView` content view** embedding code-server (VS Code in the browser) via iframe. Lazy-started on first open per folder. Shows loading state during startup (~2-5s cold start).
- **New `EditorManager` server component** managing code-server child processes per folder. Handles spawn, stop, idle timeout, heartbeat tracking, max instance cap, and port allocation. Reverse-proxies code-server through the dashboard server for same-origin iframe embedding.
- **Editor indicator on sidebar button**: green dot when running, pulsing dot when starting, no dot when stopped.
- **Auto-detect code-server binary** (or config override). Show install guide when not found (like `ZrokInstallGuide`).
- **`Zed` button** launches Zed natively via existing `open-editor` API (no navigation).
- **Better Pi Resources icon** — replace `mdiPuzzleOutline` with a more representative icon.
- **New routes**: `/folder/:encodedCwd/terminals` and `/folder/:encodedCwd/editor` replace `/terminal/:id`.
- **BREAKING**: `/terminal/:id` route removed. Terminal cards removed from sidebar.

## Capabilities

### New Capabilities
- `folder-action-bar`: Unified button row per folder group replacing scattered action buttons and editor buttons. Contains: +Session, +Terminal, Terminals(N), Editor, Zed, Pi Resources.
- `terminals-view`: Tabbed content view for all terminals within a folder. Tab bar with terminal name, active indicator, close/rename. Keep-alive mounting pattern. [+ New] button for creating terminals within the view.
- `editor-view`: Content view embedding code-server via reverse-proxied iframe. Lazy start, heartbeat, loading/error states. EditorInstallGuide fallback when binary not found.
- `editor-manager`: Server-side lifecycle manager for code-server child processes. Per-folder instances with dynamic port allocation, idle timeout, heartbeat tracking, max concurrent instance cap. Reverse proxy via Fastify.
- `editor-detection`: Auto-detection of code-server/openvscode-server binary on PATH or via config override (`editor.binary`).

### Modified Capabilities
- `terminal-emulator`: Terminal cards removed from sidebar. Terminals no longer have individual routes (`/terminal/:id`). Spawn and display moves to `terminals-view`. Terminal creation via `+Terminal` auto-navigates to terminals view.
- `open-in-editor`: Native editor buttons (Zed, etc.) move from per-session-card placement to the folder action bar. Editor detection API unchanged. `code`/`vscode` native launch replaced by browser-based editor-view for VS Code.
- `session-sidebar`: Folder group header restructured to use `folder-action-bar`. Terminal cards removed from the unified sort order.
- `url-routing`: New `/folder/:encodedCwd/terminals` and `/folder/:encodedCwd/editor` routes added. `/terminal/:id` route removed.
- `pi-resources-view`: Icon changed from `mdiPuzzleOutline` to a better-fitting icon. Functionality unchanged.

## Impact

- **Server**: New `editor-manager.ts` and `editor-proxy.ts` modules. New REST endpoints for editor lifecycle. New dependency: `@fastify/http-proxy` for reverse proxying. Optional peer dependency: `code-server` binary.
- **Client**: New `FolderActionBar`, `TerminalsView`, `EditorView`, `EditorInstallGuide` components. Modified `SessionList` (remove terminal cards, add action bar). Modified `App.tsx` (new routes, remove `/terminal/:id`).
- **Shared**: New `editor-types.ts` for editor instance types. New browser-protocol messages for editor status.
- **Config**: New `editor.binary`, `editor.idleTimeoutMinutes`, `editor.maxInstances` fields in dashboard config.
- **Breaking**: Users who bookmarked `/terminal/:id` URLs will need to use `/folder/:cwd/terminals` instead.
