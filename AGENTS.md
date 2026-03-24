
# PI Dashboard

## Project Overview

Web-based dashboard for monitoring and interacting with pi agent sessions remotely. Three-component architecture: bridge extension + Node.js server + React web client.

## Architecture

See [docs/architecture.md](docs/architecture.md) for full details.

- **Bridge Extension** (`src/extension/`) — Runs in every pi session, forwards events via WebSocket
- **Dashboard Server** (`src/server/`) — Aggregates events, SQLite persistence, dual WebSocket servers
- **Web Client** (`src/client/`) — React + Tailwind responsive UI
- **Shared Types** (`src/shared/`) — Protocol definitions shared across components

## Commands

```bash
npm install          # Install dependencies
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npm run build        # Build web client (Vite)
npm run dev          # Start Vite dev server
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
| `src/server/server.ts` | HTTP + WebSocket server |
| `src/server/memory-event-store.ts` | In-memory event buffer with LRU eviction |
| `src/server/memory-session-manager.ts` | Pure in-memory session registry |
| `src/server/workspace-store.ts` | JSON-backed workspace CRUD |
| `src/server/state-store.ts` | JSON-backed user preferences (hidden sessions) |
| `src/server/pending-load-manager.ts` | On-demand session load request tracking |
| `src/server/json-store.ts` | Atomic JSON file read/write helpers |
| `src/client/App.tsx` | React app with WebSocket integration |
| `src/client/lib/event-reducer.ts` | Event-sourced state reducer |

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

When an implementation is ready, update AGENTS.md and README.md. AGENTS.md contains instructions, architecture, commands needed to build and operate. README.md contains end-user and developer documentations with CI badges and detailed information about the project.
