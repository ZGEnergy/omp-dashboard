## 1. Shared Types

- [x] 1.1 Add package operation types to `src/shared/rest-api.ts` (NpmPackageResult, PackageOperationRequest, PackageOperationResponse, InstalledPackage)
- [x] 1.2 Add `package_progress` and `package_operation_complete` message types to `src/shared/browser-protocol.ts`

## 2. Server: PackageManager Wrapper

- [x] 2.1 Create `src/server/package-manager-wrapper.ts` — thin adapter around pi's `DefaultPackageManager` with operation serialization (mutex), progress callback forwarding, and session reload trigger
- [x] 2.2 Write tests for the wrapper: serialization (409 on concurrent), progress event forwarding, reload-after-success, no-reload-on-failure

## 3. Server: npm Search Proxy

- [x] 3.1 Create `src/server/npm-search-proxy.ts` — cached proxy for npm registry search (`keywords:pi-package`) and README fetch
- [x] 3.2 Write tests for search proxy: cache hit/miss, type filtering, README fetch, 404 handling

## 4. Server: REST Routes

- [x] 4.1 Create `src/server/routes/package-routes.ts` with endpoints: `GET /api/packages/search`, `GET /api/packages/readme`, `GET /api/packages/installed`, `POST /api/packages/install`, `POST /api/packages/remove`, `POST /api/packages/update`
- [x] 4.2 Register package routes in `src/server/server.ts`
- [x] 4.3 Write tests for package routes: search, install, remove, update, installed list, 409 on concurrent ops

## 5. Server: WebSocket Progress + Session Reload

- [x] 5.1 Wire `package_progress` events from wrapper to browser gateway broadcast in `src/server/event-wiring.ts`
- [x] 5.2 Implement session reload in wrapper: after successful operation, send `/reload` to all active sessions via pi-gateway
- [x] 5.3 Broadcast `package_operation_complete` to browser clients after operation finishes

## 6. Client: PackageBrowser Component

- [x] 6.1 Create `src/client/hooks/usePackageSearch.ts` — fetch hook for `/api/packages/search` with debounced query and type filter
- [x] 6.2 Create `src/client/hooks/useInstalledPackages.ts` — fetch hook for `/api/packages/installed`
- [x] 6.3 Create `src/client/hooks/usePackageOperations.ts` — action callbacks for install/remove/update with WebSocket progress listening
- [x] 6.4 Create `src/client/components/PackageCard.tsx` — card with name, description, type badges, downloads, install/uninstall button, progress indicator
- [x] 6.5 Create `src/client/components/PackageBrowser.tsx` — inline panel with search bar, type filter pills, package card grid, and manual URL input field. Props: `scope`, `cwd?`
- [x] 6.6 Create `src/client/components/PackageReadmeDialog.tsx` — dialog overlay with markdown-rendered README, package name/version, and Install/Uninstall action button
- [x] 6.7 Create `src/client/components/PackageInstallConfirmDialog.tsx` — confirmation dialog showing package name, source, and scope before install proceeds

## 7. Client: Settings Panel Integration (Global)

- [x] 7.1 Add "Packages" section to `src/client/components/SettingsPanel.tsx` with inline PackageBrowser in global scope, installed packages list with uninstall/update buttons, and "Check for Updates" button

## 8. Client: PiResourcesView Integration (Local)

- [x] 8.1 Add tab bar ("Installed" / "Packages") to `src/client/components/PiResourcesView.tsx`
- [x] 8.2 Wire "Packages" tab to render inline PackageBrowser in local scope with workspace cwd

## 9. Client: WebSocket Message Handling

- [x] 9.1 Handle `package_progress` messages in `src/client/hooks/useMessageHandler.ts` — update progress state
- [x] 9.2 Handle `package_operation_complete` messages — refresh installed packages list, show toast/notification

## 10. Documentation

- [x] 10.1 Update `AGENTS.md` key files table with new modules
- [x] 10.2 Update `docs/architecture.md` with package management data flow
- [x] 10.3 Update `README.md` with package management feature description

## 11. Server: Check for Updates Endpoint

- [x] 11.1 Add `POST /api/packages/check-updates` endpoint that calls `packageManager.checkForAvailableUpdates()` and returns packages with available updates
- [x] 11.2 Wire "Check for Updates" button in client to call endpoint and display update indicators on package cards

## 12. Post-Implementation Refinements

- [x] 12.1 Fix dynamic import of pi-coding-agent — resolve from global npm root via `pathToFileURL()` instead of static import
- [x] 12.2 Replace naive `readmeToHtml()` with existing `MarkdownContent` component for proper markdown/HTML rendering
- [x] 12.3 Add Escape key handler to `PackageReadmeDialog` and `PackageInstallConfirmDialog`
- [x] 12.4 Make all PiResourcesView sections collapsible (ScopeSection, PackageSection, ResourceGroup) with chevron toggles, default collapsed
- [x] 12.5 Add progressive indentation (16px per depth level) to resource hierarchy
- [x] 12.6 Merge Global scope + global packages into one "Global" section; add `scope` field to `PiPackageInfo`
- [x] 12.7 Add "installed" filter pill to PackageBrowser with synthetic entries for installed packages not in search results
- [x] 12.8 Add cross-scope installation badges ("Global", "Local", "Global + Local") to PackageCard
- [x] 12.9 Add per-card "Check for Update" button with loading state
- [x] 12.10 Make Install button full-width on non-installed cards for better visibility
