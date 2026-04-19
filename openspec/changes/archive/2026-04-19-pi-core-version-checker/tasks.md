# Pi Core Version Checker — Tasks

## 1. Server: PiCoreChecker class

- [x] Create `packages/server/src/pi-core-checker.ts`
- [x] Implement `discoverGlobalPackages()` — run `npm list -g --depth=0 --json`, parse output, filter pi-ecosystem packages
- [x] Implement `discoverManagedPackages()` — scan `~/.pi-dashboard/node_modules/` for pi packages, read their `package.json` versions
- [x] Implement `getVersionStatus()` — merge global + managed, fetch latest via `fetchPackageMeta`/`fetchGithubPackageJson`, return `PiCoreStatus`
- [x] Add 5-minute cache with force-refresh option
- [x] Add display name mapping for known packages
- [x] Write unit tests (`pi-core-checker.test.ts`) — mock execSync, mock fetch, test discovery, test caching, test version comparison

## 2. Server: REST routes

- [x] Create `packages/server/src/routes/pi-core-routes.ts`
- [x] Implement `GET /api/pi-core/versions` — returns cached `PiCoreStatus`
- [x] Implement `POST /api/pi-core/update` — accepts `{ packages?: string[] }`, runs npm update, broadcasts progress via WS
- [x] Handle update for global install (`npm update -g <pkg>`) vs managed install (`npm update` in `~/.pi-dashboard/`)
- [x] Reuse `PackageManagerWrapper` busy-lock or add parallel lock for core updates
- [x] Auto-reload sessions on successful update
- [x] Register routes in `server.ts`
- [x] Write route tests (`pi-core-routes.test.ts`)

## 3. Shared: Types

- [x] Add `PiCorePackage` and `PiCoreStatus` types to shared types or rest-api types
- [x] Add `pi_core_update_progress` / `pi_core_update_complete` to browser-protocol if not reusing `package_operation_*`

## 4. Client: PiCoreVersionsSection

- [x] Create `packages/client/src/components/PiCoreVersionsSection.tsx`
- [x] Show list of core packages with current/latest versions
- [x] "Update" button per package (visible when update available)
- [x] "Update All (N)" button
- [x] "Check Now" button with loading state
- [x] "Last checked" timestamp
- [x] Progress indicator during update
- [x] Error display
- [x] Create `packages/client/src/hooks/usePiCoreVersions.ts` — fetch + polling hook
- [x] Add section to SettingsPanel
- [x] Write component tests

## 5. Client: Update badge

- [x] Create `packages/client/src/components/PiUpdateBadge.tsx`
- [x] Fetch version status on mount, poll every 30 minutes
- [x] Show count badge when updates available
- [x] Click navigates to Settings
- [x] Add badge to app header/sidebar
- [x] Write component test

## 6. Integration & docs

- [x] Update AGENTS.md with new key files
- [x] Update docs/architecture.md with version checker flow
- [x] Manual end-to-end test: version check → update → session reload
