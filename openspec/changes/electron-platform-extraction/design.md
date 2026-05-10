## Context

`consolidate-platform-handlers` (archived/active) extracted shared cross-OS primitives into `packages/shared/src/platform/`. Step 6 — the Electron-API-bound branches — was deferred because:

1. Those branches must `import { Tray, Menu, app } from "electron"`, which forbids them from living in `packages/shared/`.
2. The deferral was gated on a manual Electron build smoke test (tray icon rendering, menu visibility on macOS, dock-hide behavior, server boot via bundled-Node) — code review alone is insufficient for native-binding code paths.

Current scattered branches:
- `packages/electron/src/lib/tray.ts:77-80` — 3-way icon path selection
- `packages/electron/src/lib/app-menu.ts:29` — darwin-only menu prefix
- `packages/electron/src/lib/bundled-node.ts:38` — `node.exe` vs `node`
- `packages/electron/src/main.ts:20-21` — linux ozone-platform-hint switch
- `packages/electron/src/main.ts:360` — darwin `app.dock.hide()` on close
- `packages/electron/src/main.ts:682-683` — darwin window-all-closed gate

Six branches across four files; each is 1–3 lines.

## Goals / Non-Goals

**Goals:**
- Single home (`packages/electron/src/platform/`) for every Electron-API-bound platform branch.
- Mirror the shared `platform/` injection pattern: each helper accepts an optional `platform?: NodeJS.Platform` for unit-testable both-branch coverage.
- Close Step 6 of `consolidate-platform-handlers`; no further deferred items remain in the parent change.
- Pass a manual Electron `make` smoke test on at least one OS before merge.

**Non-Goals:**
- Decomposing `process-manager.ts` strategy logic (Step 9.3) — out of scope.
- ARM64 / WSL primitives (Steps 9.1, 9.2).
- Refactoring unrelated Electron internals (BrowserWindow setup, IPC channels, wizard flow).
- Changing user-visible behavior. Tray icon, menu items, dock behavior, bundled-Node selection all stay byte-identical.
- Renaming or restructuring `lib/`. The `lib/tray.ts`, `lib/app-menu.ts`, `lib/bundled-node.ts` files keep their current public exports; they delegate to `platform/` internally.

## Decisions

### D1 — Companion module, not unified `platform/`
**Choice**: New `packages/electron/src/platform/` rather than expanding `packages/shared/src/platform/`.

**Rationale**: The four extractions all `import { … } from "electron"`. Shared cannot depend on electron without breaking server-only builds (`packages/server/` consumes shared and must run under bare Node). A companion module preserves the layering rule.

**Alternatives considered**:
- *Put helpers in `packages/electron/src/lib/`* — keeps the status quo, no architectural improvement. Rejected: defeats the purpose of consolidation.
- *Conditional electron import inside shared* — runtime gymnastics, breaks tree-shaking, defeats type safety. Rejected.

### D2 — Injection pattern matches shared/platform
**Choice**: Each helper accepts optional `{ platform?: NodeJS.Platform }`. Default is `process.platform`.

**Rationale**: Same pattern as `packages/shared/src/platform/process.ts:killProcess`. Enables single-OS dev box to unit-test all three platform branches without `Object.defineProperty(process, "platform", …)` mutation. Lint rule `no-direct-process-kill.test.ts` already prevents bypass; this change extends the pattern.

**Alternatives considered**:
- *Read `process.platform` directly inside each helper* — untestable on a single OS without test pollution. Rejected.

### D3 — `app-lifecycle.ts` registers handlers, doesn't return data
**Choice**: `configureAppLifecycle(app, opts?)` mutates the `app` object (registers `commandLine.appendSwitch`, `window-all-closed`, dock-hide on `before-quit`). Other helpers (`getTrayIcon`, `getBundledNodePath`, `buildAppMenu`) are pure and return values.

**Rationale**: Two of the three lifecycle branches in `main.ts` are `app.on(event, …)` registrations — they're side-effecting by nature. Wrapping them in a "configure" function keeps `main.ts` linear and matches Electron idioms. Pure helpers stay pure.

**Alternatives considered**:
- *Return a config object that `main.ts` applies* — adds a layer of indirection for no testability gain (the side effects are still in `main.ts`). Rejected.

### D4 — `lib/tray.ts`, `lib/app-menu.ts`, `lib/bundled-node.ts` survive as thin wrappers
**Choice**: Don't delete these files. Migrate their internals to call the new `platform/` helpers; keep the existing public exports.

**Rationale**: They're imported by `main.ts` and (potentially) test fixtures. Renaming forces churn outside the scope of this change. Deletion is a follow-up if no caller remains after the migration. Keeping the shims also documents the migration boundary.

**Alternatives considered**:
- *Delete and rewrite imports* — wider blast radius, more review surface. Rejected for this PR.
- *Move logic 100% into platform/, lib/ files become re-exports* — same outcome as "thin wrapper". Adopted; the wrappers are 1–3 lines each.

### D5 — Smoke test scope
**Choice**: Manual `cd packages/electron && npm run make` on macOS. Verify: app launches, tray icon visible, About menu present, server boots (uses `getBundledNodePath`), close-window hides dock instead of quitting.

**Rationale**: macOS exercises the most platform-specific code (darwin tray icon, darwin menu prefix, darwin dock-hide, darwin window-all-closed gate). Linux ozone-hint and Win32 `node.exe` / `.ico` are 1-line symmetric branches reviewable by inspection. Full cross-OS QA via `qa/` Makefile is overkill for a refactor with no behavior change.

**Alternatives considered**:
- *Full `qa/` cross-OS test* — 30+ min runtime, overkill for refactor. Rejected.
- *No smoke test, code review only* — original deferral explicitly rejected this. Rejected.

### D6 — Tests for pure helpers only
**Choice**: Unit-test `getTrayIcon` and `getBundledNodePath` with injected platform. Skip unit tests for `buildAppMenu` and `configureAppLifecycle` — they're integration-tested by the Electron smoke build.

**Rationale**: `buildAppMenu` returns a Menu object built from `Menu.buildFromTemplate(…)` which requires the live electron runtime. Mocking the Menu module produces tests that verify the mock, not behavior. `configureAppLifecycle` is similarly side-effecting on the live `app` object. The smoke build is the cheapest reliable verification.

**Alternatives considered**:
- *Heavy electron-mock fixtures* — high maintenance, low signal. Rejected.

## Risks / Trade-offs

- **Risk**: Smoke test only covers one OS (macOS). → **Mitigation**: Linux + Win32 branches are 1-line symmetric to darwin's pattern; reviewable by inspection. Rollback is trivial (revert one PR). If a regression surfaces post-merge on Linux/Win32, `consolidate-platform-handlers` archive contains the original branch logic for reference.
- **Risk**: `configureAppLifecycle` couples three unrelated lifecycle hooks (ozone-hint, dock-hide, window-all-closed) under one function. → **Mitigation**: They're already coupled by being in `main.ts` top-level; extracting them together keeps `main.ts` clean. If a future change needs to split them, it's a 5-line refactor.
- **Risk**: Electron `make` may fail for reasons unrelated to this change (signing certs, native rebuild, Node version skew). → **Mitigation**: Run smoke test before extracting (baseline), then after (delta). Failure with no diff between runs indicates a pre-existing issue.
- **Trade-off**: Keeping `lib/` files as thin wrappers adds one indirection layer. → **Acceptance**: 1–3 lines each; review-friendly; lets the deletion happen as a separate cleanup PR if desired.

## Migration Plan

1. **Baseline**: run `cd packages/electron && npm run make` on macOS; confirm green build + working app.
2. **Extract** in any order (mechanical, all independent):
   - `platform/tray-icon.ts` ← `lib/tray.ts:77-80` branch
   - `platform/menu.ts` ← `lib/app-menu.ts:29` branch
   - `platform/node.ts` ← `lib/bundled-node.ts:38` branch
   - `platform/app-lifecycle.ts` ← `main.ts:20-21, 360, 682-683` three branches
3. **Migrate callers**: `lib/tray.ts`, `lib/app-menu.ts`, `lib/bundled-node.ts`, `main.ts` each call into `platform/`.
4. **Add unit tests**: `getTrayIcon` and `getBundledNodePath` with `platform: "darwin" | "win32" | "linux"` injection.
5. **Update docs**: extend `docs/architecture.md` "Cross-OS Platform Primitives" section with companion-module note; AGENTS.md gets a one-line entry under Key Files for `packages/electron/src/platform/`.
6. **Smoke test**: `npm run make` again; launch app; verify tray icon, menu, server boot, dock-hide.
7. **Mark Step 6 complete** in `consolidate-platform-handlers/tasks.md` (cross-reference, not re-archive).

**Rollback**: single `git revert` on the merge commit. No data migration, no DB schema, no API contract.

## Open Questions

- Should the `lib/` thin wrappers be deleted in a follow-up cleanup PR, or kept indefinitely? — defer to post-merge review; not blocking.
- Should we also extract `process.arch` references in `main.ts:38` (currently just a log statement)? — out of scope; covered by Step 9.1 if/when ARM64 work begins.
