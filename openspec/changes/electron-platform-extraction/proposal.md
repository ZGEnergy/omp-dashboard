## Why

Step 6 of `consolidate-platform-handlers` was deferred with explicit rationale: the Electron-API-bound platform branches (tray icon, app menu, bundled Node path, app-lifecycle hooks) deserved their own review cycle plus a manual Electron-build smoke test before landing. The shared `packages/shared/src/platform/` consolidation is now complete and stable, so finishing the Electron half closes the original drift vector and gives Electron-bound platform code a single home — mirroring the shared pattern.

Four narrow `process.platform` branches remain scattered across `packages/electron/src/`:
- `lib/tray.ts:77-80` — darwin/win32/linux icon selection
- `lib/app-menu.ts:29` — darwin app-menu template prefix
- `lib/bundled-node.ts:38` — `node.exe` vs `node`
- `main.ts:20-21, 360, 682-683` — linux ozone-hint, darwin dock-hide on close, darwin window-all-closed gate

Each is 1–3 lines; the value is single-source-of-truth, not LOC reduction.

## What Changes

- Introduce `packages/electron/src/platform/` for Electron-API-bound primitives (cannot live in shared because they import from `electron`):
  - `tray-icon.ts` — `getTrayIcon()` returning the correct asset path per platform
  - `menu.ts` — `buildAppMenu()` with darwin-specific template prefix
  - `node.ts` — `getBundledNodePath()` returning `node.exe` vs `node`
  - `app-lifecycle.ts` — `configureAppLifecycle(app)` registering linux ozone-hint + darwin dock-hide + darwin window-all-closed gate
  - `index.ts` — re-export public API
- Migrate 4 call sites: `lib/tray.ts`, `lib/app-menu.ts`, `lib/bundled-node.ts`, `main.ts`. The three `lib/` files become thin shims (or are deleted if no other logic remains).
- Manual Electron build smoke test on ≥1 OS — the gating reason for the original deferral. Verify tray icon renders, app menu shows on macOS, server still boots (uses `getBundledNodePath`), dock-hide works on macOS close.
- Documentation: extend the existing "Cross-OS Platform Primitives" section in `docs/architecture.md` with the Electron-companion module; AGENTS.md gets a one-line pointer to `packages/electron/src/platform/`.
- **NOT a breaking change** — internal refactor only. No REST/WebSocket/CLI surface affected.

## Capabilities

### New Capabilities
- `electron-platform-primitives`: Electron-API-bound cross-OS helpers (tray icon selection, app-menu template, bundled Node binary path, app-lifecycle hooks). Companion to `packages/shared/src/platform/` for code that must import from the `electron` module.

### Modified Capabilities
_(none — this is a refactor. External behavior preserved.)_

## Impact

- **Files added**: `packages/electron/src/platform/{tray-icon,menu,node,app-lifecycle,index}.ts`
- **Files touched (production)**: 4 — `packages/electron/src/lib/tray.ts`, `lib/app-menu.ts`, `lib/bundled-node.ts`, `main.ts`
- **Files touched (tests)**: 0–2 — add focused unit tests for `getTrayIcon`, `getBundledNodePath` with injectable platform; `buildAppMenu` and `configureAppLifecycle` are integration-tested via the manual Electron smoke build.
- **Dependencies**: None added or removed.
- **Bundle size**: Neutral (same code, new home).
- **API surface**: Internal only. No changes to REST, WebSocket, or CLI.
- **Risk**: Low. Each branch is 1–3 lines and mechanical. The only real gate is the manual Electron build verification.
- **Migration window**: Single PR. Smoke-test on the developer's primary OS (macOS) covers darwin + verifies linux/win32 branches via code review (they're trivially symmetric to darwin).
- **Out of scope**: ARM64 audit (Step 9.1), WSL extraction (Step 9.2), `process-manager.ts` decomposition (Step 9.3) — all remain deferred.
