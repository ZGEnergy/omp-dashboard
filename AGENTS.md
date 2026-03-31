
# PI Dashboard

## Project Overview

Web-based dashboard for monitoring and interacting with pi agent sessions remotely. Three-component architecture: bridge extension + Node.js server + React web client.

## Architecture

See [docs/architecture.md](docs/architecture.md) for full details.

- **Bridge Extension** (`src/extension/`) — Runs in every pi session, forwards events via WebSocket
- **Dashboard Server** (`src/server/`) — Aggregates events, in-memory + JSON persistence, dual WebSocket servers
- **Web Client** (`src/client/`) — React + Tailwind responsive UI
- **Shared Types** (`src/shared/`) — Protocol definitions shared across components

## Commands

```bash
npm install          # Install dependencies
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npm run build        # Build web client (Vite)
npm run dev          # Start Vite dev server
npm run reload       # Reload all connected pi sessions
npm run reload:check # Type-check + reload all pi sessions
pi-dashboard         # Start dashboard server
pi-dashboard --dev   # Start with Vite proxy
```

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/protocol.ts` | Extension↔Server WebSocket messages |
| `src/shared/browser-protocol.ts` | Server↔Browser WebSocket messages |
| `src/shared/types.ts` | Data models (Session, Workspace, Event) |
| `src/shared/config.ts` | Shared config loader (`~/.pi/dashboard/config.json`) |
| `src/extension/bridge.ts` | Main extension entry point |
| `src/extension/connection.ts` | WebSocket with exponential backoff |
| `src/extension/server-probe.ts` | TCP probe to detect running server |
| `src/extension/server-launcher.ts` | Auto-start server as detached process |
| `src/extension/command-handler.ts` | Command routing: `!`/`!!` bash, `/compact`, slash commands |
| `src/extension/dev-build.ts` | Dev build-on-reload helper (client build + server shutdown) |
| `src/extension/server-auto-start.ts` | Extracted auto-start logic with retry-probe for concurrent launches |
| `src/extension/git-info.ts` | Git branch/remote/PR detection (polled every 30s) |
| `src/extension/git-link-builder.ts` | Git remote URL parsing and platform-specific links |
| `src/extension/ui-proxy.ts` | Proxies ctx.ui dialogs to dashboard (confirm/select/input/editor/notify) |
| `src/extension/ask-user-tool.ts` | `ask_user` tool registration (bundled in bridge, registered at session_start to avoid static tool-name conflicts with other extensions) |
| `src/extension/openspec-activity-detector.ts` | Detects OpenSpec activity from tool events |
| `src/shared/openspec-poller.ts` | OpenSpec CLI polling (shared, used by server DirectoryService) |
| `src/shared/state-replay.ts` | Synthesizes events from pi entries (shared, used by server + bridge) |
| `src/extension/stats-extractor.ts` | Extracts token/cost stats from turn_end events |
| `src/server/server.ts` | HTTP + WebSocket server |
| `src/server/pi-gateway.ts` | Extension WebSocket gateway (port 9999) |
| `src/server/browser-gateway.ts` | Browser WebSocket gateway (port 8000) |
| `src/server/memory-event-store.ts` | In-memory event buffer with LRU eviction |
| `src/server/memory-session-manager.ts` | Pure in-memory session registry |
| `src/client/components/FolderOpenSpecSection.tsx` | Folder-level OpenSpec UI: collapsible change list, refresh, bulk archive |
| `src/client/components/SessionOpenSpecActions.tsx` | Session-level OpenSpec: attach combo box, action buttons, detach |
| `src/client/components/DialogPortal.tsx` | Portal wrapper rendering dialogs at document.body with scroll lock |
| `src/client/components/PinDirectoryDialog.tsx` | Dialog to pin a directory (wraps PathPicker) |
| `src/client/components/PathPicker.tsx` | Reusable keyboard-first path picker with typeahead directory list |
| `src/client/lib/browse-api.ts` | Client-side browse API helper for PathPicker |
| `src/server/browse.ts` | Directory listing logic for browse API endpoint |
| `src/server/pi-resource-scanner.ts` | Discovers pi extensions, skills, prompts from local, global, and package sources |
| `src/client/components/SortablePinnedGroup.tsx` | Drag-to-reorder wrapper for pinned directory groups |
| `src/server/state-store.ts` | JSON-backed user preferences (hidden sessions) |
| `src/server/session-persistence.ts` | Persists session metadata to JSON for server restarts |
| `src/server/session-order-manager.ts` | Per-cwd session ordering with persistence |
| `src/server/directory-service.ts` | Server-side session discovery, event loading, and OpenSpec polling |
| `src/server/pending-fork-registry.ts` | Tracks pending fork operations for session placement |
| `src/server/pending-resume-registry.ts` | Queues prompts for auto-resume of ended sessions |
| `src/server/json-store.ts` | Atomic JSON file read/write helpers |
| `src/server/process-manager.ts` | Session spawning via tmux or headless mode |
| `src/server/editor-registry.ts` | Detects available editors (running processes + CLI) |
| `src/server/event-status-extraction.ts` | Extracts session status/tool updates from events |
| `src/server/headless-pid-registry.ts` | Maps headless child PIDs to session IDs |
| `src/server/auth.ts` | OAuth2 authentication: provider registry, JWT helpers, user allowlist |
| `src/server/auth-plugin.ts` | Fastify plugin: auth routes, onRequest hook, WS upgrade validation |
| `src/server/config-api.ts` | Config REST API: read (redacted), write (partial merge), secret preservation |
| `src/client/components/SettingsPanel.tsx` | Settings UI: all dashboard config fields, grouped form, save to server |
| `src/client/hooks/useAuthStatus.ts` | Client auth status hook and login redirect helper |
| `src/server/localhost-guard.ts` | Localhost-only access guard for routes |
| `src/server/server-pid.ts` | PID file management for daemon mode |
| `src/server/terminal-manager.ts` | PTY lifecycle, ring buffer, spawn/attach/kill terminals |
| `src/server/terminal-gateway.ts` | Binary WebSocket upgrade handler for `/ws/terminal/:id` |
| `scripts/fix-pty-permissions.cjs` | Postinstall: fix node-pty spawn-helper execute permissions |
| `src/server/tunnel.ts` | Zrok tunnel with reserved shares for persistent URLs, binary detection, PID tracking, stale cleanup |
| `src/client/components/TunnelButton.tsx` | Unified tunnel/QR button — tunnel icon when not set up, QR icon when inactive, green QR icon when connected; opens QR dialog with disconnect/setup |
| `src/client/components/QrCodeDialog.tsx` | QR code dialog showing tunnel URL as scannable QR code with copy, disconnect, and setup buttons |
| `public/manifest.json` | PWA web app manifest for installability |
| `public/sw.js` | Minimal service worker for PWA installability |
| `src/client/components/ZrokInstallGuide.tsx` | OS-aware zrok installation guide view (macOS/Linux/Windows) |
| `src/server/cli.ts` | CLI entry point with subcommands (start/stop/restart/status) |
| `src/shared/rest-api.ts` | REST API type definitions |
| `scripts/reload-all.sh` | Build bridge + reload all pi sessions |
| `src/client/components/PiResourcesView.tsx` | Content area view for browsing pi extensions, skills, and prompts |
| `src/client/hooks/usePiResources.ts` | Fetch + 30s polling hook for pi resources API |
| `src/client/components/MarkdownPreviewView.tsx` | Generic reusable markdown preview with back button, tabs, loading/error states |
| `src/client/hooks/useOpenSpecReader.ts` | Maps OpenSpec artifacts to file paths, fetches content, concatenates specs |
| `src/client/components/interactive-renderers/` | Registry + renderers for interactive UI dialogs (confirm, select, multiselect, input, editor, notify) |
| `src/shared/terminal-types.ts` | TerminalSession type and control messages |
| `src/client/components/TerminalView.tsx` | xterm.js terminal emulator wrapper with keep-alive |
| `src/client/components/TerminalCard.tsx` | Sidebar card for terminal sessions (cyan accent) |
| `src/client/App.tsx` | React app with WebSocket integration |
| `src/client/components/MobileShell.tsx` | Two-panel mobile shell with slide transitions and swipe-back |
| `src/client/components/MobileActionMenu.tsx` | Kebab menu for session actions on mobile (includes OpenSpec commands) |
| `src/client/components/MobileOverlay.tsx` | Hamburger button and sidebar overlay for mobile |
| `src/client/components/SessionHeader.tsx` | Session header with MobileAttachButton and MobileHeader for mobile |
| `src/client/hooks/useSwipeBack.ts` | iOS-style left-edge swipe-back gesture (40px edge zone, document-level listeners) |
| `src/client/components/ChatView.tsx` | Chat message view with scroll-lock: pauses auto-scroll when user scrolls up, floating scroll-to-bottom button |
| `src/client/lib/mobile-depth.ts` | Pure function computing MobileShell depth from route state |
| `src/client/hooks/useZoomPan.ts` | Reusable zoom/pan hook (wheel, drag, pinch, buttons) |
| `src/client/lib/event-reducer.ts` | Event-sourced state reducer |
| `src/client/lib/truncate-path.ts` | Middle-truncation utility for filesystem paths |
| `src/server/resolve-path.ts` | Safe realpath resolution (symlink handling) |
| `.pi/skills/spec-coherence-check/SKILL.md` | Skill: sweep proposals for staleness, conflicts, obsolescence against codebase |
| `.pi/skills/spec-coherence-check/references/proposal-queue-schema.md` | JSON schema for `.pi/proposal-queue.json` |
| `.pi/skills/code-review/SKILL.md` | Skill: comprehensive code review with severity labels, four-phase process, language-specific guides |
| `.pi/skills/code-review/references/` | On-demand language guides (React, TypeScript, Vue, Rust, Go, Java, Python, C/C++, CSS, Qt) + architecture/performance/security reviews |

## Build & Restart Workflow

The dashboard has three components that need rebuilding depending on what changed:

### After bridge extension changes (`src/extension/`)
Reload all connected pi sessions to pick up the new bridge code:
```bash
npm run reload          # Reload all pi sessions
npm run reload:check    # Type-check first, then reload
```

### After server changes (`src/server/`, `src/shared/`)
Restart the dashboard server. The server runs TypeScript directly via tsx, so no separate build step is needed — just restart:
```bash
# Production mode
pi-dashboard stop && pi-dashboard start

# Dev mode (with Vite proxy)
pi-dashboard stop && pi-dashboard start --dev
```

### After client changes (`src/client/`)
- **Dev mode**: Vite hot-reloads automatically, no action needed. Start with `npm run dev`.
- **Production mode**: Rebuild the client and restart the server:
  ```bash
  npm run build
  pi-dashboard stop && pi-dashboard start
  ```

### After OpenSpec apply finishes (full rebuild)
When an openspec-apply-change skill completes implementation, do a full rebuild and restart:
```bash
# Production mode
npm run build
pi-dashboard stop && pi-dashboard start
npm run reload

# Dev mode
pi-dashboard stop && pi-dashboard start --dev
npm run reload
```
Check which mode is running: if the Vite dev server is active on port 3000/5173 (`lsof -i :3000 -i :5173`), use dev mode. Otherwise use production mode.

## Code Instructions

1. First think through the problem, read the codebase for relevant files.
2. Before you make any major changes, check in with me and I will verify the plan.
3. Please every step of the way just give me a high level explanation of what changes you made.
4. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
5. Maintain a documentation file that describes how the architecture of the app works inside and out.
6. Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.
7. For implementation use TDD (Test-Driven Development): write or update tests first to define the expected behaviour, verify they fail, then write the minimal implementation to make them pass.
8. Use DRY (Don't Repeat Yourself): extract reusable logic into separate classes, utilities, or components. If the same pattern appears in multiple places, refactor it into a shared helper.

## Document changes

When an implementation is ready, update AGENTS.md, README.md, and docs/architecture.md. AGENTS.md contains instructions for AI agents, key files, and commands needed to build and operate. README.md contains end-user and developer documentation with CI badges, prerequisites, configuration, and project structure. docs/architecture.md contains detailed data flows, persistence model, reconnection logic, and configuration reference.
