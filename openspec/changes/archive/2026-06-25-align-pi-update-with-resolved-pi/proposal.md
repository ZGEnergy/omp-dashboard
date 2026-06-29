## Why

The dashboard's core-package updater runs raw `npm install -g <pkg>@latest`, computed from a `global|managed` guess that is **independent** of the pi the dashboard actually resolves and spawns (`ToolRegistry.resolveExecutor("pi")`). When the resolved pi lives anywhere else (repo-local dev checkout, project dependency), pressing **Update** updates a *different* tree, reports success, and leaves the spawned pi stale — which silently broke session spawning after a `pi update` bumped global pi + the `pi-web-access` extension while the dashboard kept resolving an older repo-local pi (extension load crashed on the new `@earendil-works/pi-ai/compat` import).

pi 0.80.x already ships an install-location-aware updater (`pi update --self|--all|--extensions|--extension <source>`) with its own `detectInstallMethod()` and a built-in refusal (`getSelfUpdateUnavailableInstruction()`). The dashboard should delegate to the resolved pi's own updater instead of re-implementing a divergent npm path.

## What Changes

- **BREAKING (server-internal):** pi-core updates for the pi package STOP shelling out to `npm install -g`. The dashboard invokes the **resolved** pi's own updater: `<resolvedPiArgv> update --self`. pi decides install method, pins the exact version, handles the scope migration, and refuses unsupported installs.
- **Extension updates** run via the resolved pi's `pi update --extension <source>` (per-extension) and `pi update --extensions` (all), replacing the prior dashboard-driven extension update path for pi-loaded packages.
- **New top-level "Update all" control** in the Pi Ecosystem panel header:
  - Renders **only when at least one update is available** (no disabled/greyed state).
  - Default action runs `pi update --all` (pi + extensions).
  - A dropdown offers "Update pi only" (`pi update --self`) and "Update extensions only" (`pi update --extensions`).
- **Version/stats** for the pi row are read from the **resolved** pi's `package.json` (the same path used to spawn), so the displayed version always matches the spawned binary.
- **Honest refusal:** when the resolved pi reports it cannot self-update (source checkout, Electron bundle, brew/pnpm), the dashboard surfaces pi's own instruction text instead of running a doomed npm command or reporting false success.
- The dashboard package itself (`@blackbelt-technology/pi-agent-dashboard`) keeps an npm/refuse path driven by the existing `detectInstallLayout()` (no `pi update` equivalent exists for it).

## Capabilities

### New Capabilities
- `resolved-pi-update`: The dashboard resolves pi once (the spawn source of truth), reads its version from that install, and delegates pi/extension updates to that pi's own `pi update` subcommands; non-updatable installs surface pi's refusal instruction.

### Modified Capabilities
- `pi-core-version-check`: pi-core update execution delegates to the resolved pi's `pi update --self` (and reads the pi version from the resolved install) instead of `npm install -g <pkg>@latest`; refusal handling added.
- `pi-core-version-ui`: replace the per-group "Update All (N)" core button with a panel-header **Update all** split control that renders only when updates exist, defaults to `--all`, and exposes `--self` / `--extensions`; per-row Update delegates (pi → `--self`, extension → `--extension <source>`).
- `package-update`: extension update for pi-loaded packages runs via the resolved pi's `pi update --extension <source>` rather than the prior npm-driven path.

## Impact

- **Server**: `packages/server/src/pi-core-updater.ts` (delegate to resolved pi), `pi-core-checker.ts` (read version from resolved install; `updatable`/`manualAction` fields), `recovery-server.ts` (`detectInstallLayout` reused for dashboard-package path), routes under `/api/pi-core/*` and `/api/packages/update`.
- **Shared**: `ToolResolver.resolvePi()` reused as the single resolution authority.
- **Client**: `packages/client/src/components/UnifiedPackagesSection.tsx` (header Update-all split control, conditional render, per-row delegation, refusal banner).
- **No data migration.** Behavior change only; rollback = revert the commit.
