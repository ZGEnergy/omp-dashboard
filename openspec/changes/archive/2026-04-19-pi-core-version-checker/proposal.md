# Pi Core Version Checker & Updater

## Problem

Pi's `DefaultPackageManager` manages extensions, skills, prompts, and themes listed in `settings.json packages[]`. However, **core pi ecosystem CLI packages** — `@mariozechner/pi-coding-agent` (pi itself), `@blackbelt-technology/pi-agent-dashboard`, `@blackbelt-technology/pi-model-proxy`, and similar globally-installed tools — have no version checking or update mechanism in the dashboard.

Users must manually run `npm outdated -g` and `npm update -g` to keep core tooling current. There is no visibility into whether updates are available.

## Solution

Add a **pi core version checker** that discovers globally-installed (or managed-install) pi ecosystem packages, compares their versions against npm/GitHub, and provides one-click updates from the dashboard Settings panel. A subtle **header badge** notifies users when updates are available.

## Scope

### In scope

- Server-side core package discovery (`npm list -g --json` + `~/.pi-dashboard/node_modules/` scan)
- Version comparison against npm registry (reuse existing `fetchPackageMeta`)
- Two new REST endpoints: `GET /api/pi-core/versions`, `POST /api/pi-core/update`
- Update execution via `npm update -g <pkg>` (global) or `npm update` in managed dir (Electron)
- Progress delivery via WebSocket (reuse `package_operation_*` pattern)
- Auto-reload all connected sessions after successful update
- `PiCoreVersionsSection` component in SettingsPanel
- Header/sidebar update badge with count
- 5-minute server-side cache for version data
- Handles both global npm and managed `~/.pi-dashboard/` install scenarios

### Out of scope

- Extension/skill/prompt package updates (already handled by `PackageManagerWrapper` + `GlobalPackagesSection` + `RecommendedExtensions`)
- Auto-update (always user-initiated)
- Major version upgrade warnings (future enhancement)
- Rollback mechanism

## Key reuse

| Existing component | Reuse |
|--------------------|-------|
| `fetchPackageMeta()` in `npm-search-proxy.ts` | Latest version from npm registry |
| `fetchGithubPackageJson()` in `npm-search-proxy.ts` | Latest version from GitHub |
| `PackageManagerWrapper` serialization pattern | One-operation-at-a-time, progress, session reload |
| `package_operation_complete` WS message type | Progress/completion delivery |
| `usePackageOperations` hook pattern | Client-side progress tracking |
| `dependency-detector.ts` (Electron) | Install source detection logic |

## Success criteria

- User sees a badge when pi core updates are available
- User can view all core pi packages with current/latest versions in Settings
- User can update individual packages or all at once
- Sessions auto-reload after update
- Works for both global npm installs and Electron managed installs
