# OMP Dashboard Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean, minimal fork of BlackBeltTechnology/pi-agent-dashboard that supports Oh My Pi (OMP) instead of pi, maintaining upstream parity via a rebasable patch series.

**Architecture:** 6-commit patch series on upstream `develop`. Each commit is one concern. No new abstraction layers — use the upstream's existing path centralization modules and change values there. Tests updated only where they assert path values.

**Tech Stack:** TypeScript, React, Electron, Vitest, bun (for plugin management), node:sqlite (for auth storage)

## Global Constraints

- Node.js >= 22.18 (upstream requires >=22.22, we're on 22.21 — tests run with `--force` install)
- Tests MUST run with `HOME=$(mktemp -d)` prefix (upstream test-isolation guard)
- No cosmetic rebranding — keep "pi" in comments, variable names, internal strings
- Only change: user-visible paths, package names, import scopes, auth backend, package manager, manifest resolution
- Each commit must pass its own tests before proceeding to the next

---

## Patch Series

### Commit 1: `feat: centralize OMP path constants`

**Files:**
- Modify: `packages/shared/src/managed-paths.ts` — `.pi-dashboard` → `.omp-dashboard`, `getPiSettingsPath` → `getOmpSettingsPath` (keep deprecated alias), `PI_SETTINGS_PATH` → `OMP_SETTINGS_PATH`
- Modify: `packages/shared/src/config.ts` — `.pi/dashboard` → `.omp/dashboard` (3 sites)
- Modify: `packages/shared/src/dashboard-paths.ts` — all `.pi/dashboard` → `.omp/dashboard`, `.pi-dashboard` → `.omp-dashboard`
- Modify: test files that assert path values:
  - `packages/shared/src/__tests__/managed-paths.test.ts`
  - `packages/shared/src/__tests__/config.test.ts`
  - `packages/shared/src/__tests__/config-editor.test.ts`
  - `packages/shared/src/__tests__/config-keeper-log.test.ts`
  - `packages/shared/src/__tests__/config-openspec.test.ts`
  - `packages/shared/src/__tests__/config-plugins.test.ts`
  - `packages/shared/src/__tests__/dashboard-paths.test.ts`
  - `packages/shared/src/__tests__/credential-detect.test.ts`
  - `packages/shared/src/__tests__/managed-node-path.test.ts`
  - `packages/shared/src/__tests__/managed-runtime-strategy.test.ts`
  - `packages/shared/src/__tests__/legacy-managed-dir.test.ts`
  - `packages/shared/src/__tests__/doctor-core-legacy-advisory.test.ts`
  - `packages/server/src/__tests__/doctor-route.test.ts` (if path assertions)
  - `packages/server/src/__tests__/editor-detection.test.ts` (if path assertions)
  - `packages/electron/src/__tests__/managed-paths.test.ts` (if exists)

- [ ] Change path values in 3 source modules
- [ ] Update test assertions to match new paths
- [ ] Run `HOME=$(mktemp -d) npx vitest run packages/shared/src/__tests__/ --reporter=dot`
- [ ] Commit

### Commit 2: `feat: update npm scope to @oh-my-pi/*`

**Files:**
- Modify: `package.json` — `@earendil-works/pi-ai` → `@oh-my-pi/pi-ai`, peer deps, `pi` → `omp` manifest key, extension skill paths
- Modify: `tsconfig.base.json` — module resolution paths from `@earendil-works/*` to `@oh-my-pi/*`
- Modify: `packages/extension/src/pi-env.d.ts` — type declarations for `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-ai`; remove `@mariozechner/*` legacy declarations
- Modify: `packages/server/src/pi-core-checker.ts` — `CORE_PACKAGE_NAMES` to `@oh-my-pi/*`, display names, add `~/.omp/plugins/node_modules` scanning
- Modify: `packages/server/bin/pi-dashboard.mjs` — jiti fallback message package name

- [ ] Update package.json scope and deps
- [ ] Update tsconfig.base.json paths
- [ ] Update pi-env.d.ts declarations
- [ ] Update pi-core-checker.ts package names
- [ ] Update bin wrapper fallback message
- [ ] Run `HOME=$(mktemp -d) npx vitest run packages/shared/src/__tests__/binary-lookup packages/shared/src/__tests__/tool-registry --reporter=dot`
- [ ] Commit

### Commit 3: `feat: add SQLite auth storage adapter`

**Files:**
- Modify: `packages/server/src/provider-auth-storage.ts` — add `node:sqlite` `DatabaseSync` to read `~/.omp/agent/agent.db` `auth_credentials` table; keep `auth.json` as legacy fallback; add `AuthSnapshot` type with source tracking
- Modify: `packages/shared/src/credential-detect.ts` — add SQLite detection alongside JSON; change paths to `~/.omp/agent/`
- Modify: `packages/server/src/__tests__/provider-auth-storage.test.ts` — add SQLite test cases
- Modify: `packages/shared/src/__tests__/credential-detect.test.ts` — add SQLite detection tests

- [ ] Add SQLite reading to provider-auth-storage.ts
- [ ] Add SQLite detection to credential-detect.ts
- [ ] Update tests for both
- [ ] Run `HOME=$(mktemp -d) npx vitest run packages/server/src/__tests__/provider-auth-storage packages/shared/src/__tests__/credential-detect --reporter=dot`
- [ ] Commit

### Commit 4: `feat: replace package manager with bun-based plugin management`

**Files:**
- Modify: `packages/server/src/package-manager-wrapper.ts` — replace pi's `DefaultPackageManager` dynamic import with custom `~/.omp/plugins/` directory managed by `bun install`/`bun uninstall`/`bun update`. Preserve public API surface (`listInstalled`, `run`, `move`, `checkUpdates`).
- Modify: `packages/server/src/__tests__/package-manager-wrapper.test.ts` — update for bun-based flow
- Modify: `packages/server/src/__tests__/package-manager-wrapper-move.test.ts` — update for bun-based flow
- Modify: `packages/server/src/__tests__/package-manager-wrapper-resolve.test.ts` — update for bun-based flow

- [ ] Rewrite package-manager-wrapper.ts for bun
- [ ] Update test files
- [ ] Run `HOME=$(mktemp -d) npx vitest run packages/server/src/__tests__/package-manager --reporter=dot`
- [ ] Commit

### Commit 5: `feat: add OMP extension manifest resolution`

**Files:**
- Modify: `packages/shared/src/bridge-register.ts` — add `findPackageDir()`, `resolveRegisteredExtensionPath()`, `extractRootExport()` for resolving extension entry from `omp.extensions[]` with `pi.extensions[]` fallback
- Modify: `packages/shared/src/tool-registry/definitions.ts` — add `readManifestEntry()` for omp package manifests
- Modify: `packages/shared/src/__tests__/bridge-register.test.ts` — add omp manifest resolution tests
- Modify: `packages/shared/src/__tests__/tool-registry-definitions.test.ts` — add omp manifest tests

- [ ] Add omp.extensions[] resolution to bridge-register.ts
- [ ] Add readManifestEntry() to tool-registry/definitions.ts
- [ ] Update tests
- [ ] Run `HOME=$(mktemp -d) npx vitest run packages/shared/src/__tests__/bridge-register packages/shared/src/__tests__/tool-registry --reporter=dot`
- [ ] Commit

### Commit 6: `feat: wire extension bridge for OMP`

**Files:**
- Modify: `packages/extension/src/bridge.ts` — update imports from `@earendil-works/pi-coding-agent` to `@oh-my-pi/pi-coding-agent`, bridge key `__pi_dashboard_bridge__` → `__omp_dashboard_bridge__`, env var `OMP_DASHBOARD_URL` with `PI_DASHBOARD_URL` fallback
- Modify: `packages/extension/src/provider-register.ts` — update imports, path to `~/.omp/agent/providers.json`
- Rename: `packages/extension/.pi/skills/` → `packages/extension/.omp/skills/`
- Modify: `packages/extension/package.json` — update extension skill path references
- Modify: `packages/extension/src/__tests__/bridge-context.test.ts` — update for omp imports
- Modify: `packages/extension/src/__tests__/prompt-expander.test.ts` — update for omp imports

- [ ] Update bridge.ts imports, key, env var
- [ ] Update provider-register.ts imports and paths
- [ ] Rename .pi/skills to .omp/skills
- [ ] Update extension package.json
- [ ] Run `HOME=$(mktemp -d) npx vitest run packages/extension --reporter=dot`
- [ ] Commit

---

## Verification

After all 6 commits:
- [ ] Run full test suite: `HOME=$(mktemp -d) npx vitest run --reporter=dot`
- [ ] Verify `git log --oneline` shows 6 clean commits
- [ ] Verify `git diff upstream/develop..omp --stat` shows ~46 files, not 256
- [ ] Verify rebasability: `git rebase --dry-run upstream/develop` (or simulate)
