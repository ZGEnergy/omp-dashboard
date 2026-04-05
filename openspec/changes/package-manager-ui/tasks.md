## 1. Shared Types

- [ ] 1.1 Add package operation types to `src/shared/rest-api.ts` (NpmPackageResult, PackageOperationRequest, PackageOperationResponse, InstalledPackage)
- [ ] 1.2 Add `package_progress` and `package_operation_complete` message types to `src/shared/browser-protocol.ts`

## 2. Server: PackageManager Wrapper

- [ ] 2.1 Create `src/server/package-manager-wrapper.ts` — thin adapter around pi's `DefaultPackageManager` with operation serialization (mutex), progress callback forwarding, and session reload trigger
- [ ] 2.2 Write tests for the wrapper: serialization (409 on concurrent), progress event forwarding, reload-after-success, no-reload-on-failure

## 3. Server: npm Search Proxy

- [ ] 3.1 Create `src/server/npm-search-proxy.ts` — cached proxy for npm registry search (`keywords:pi-package`) and README fetch
- [ ] 3.2 Write tests for search proxy: cache hit/miss, type filtering, README fetch, 404 handling

## 4. Server: REST Routes

- [ ] 4.1 Create `src/server/routes/package-routes.ts` with endpoints: `GET /api/packages/search`, `GET /api/packages/readme`, `GET /api/packages/installed`, `POST /api/packages/install`, `POST /api/packages/remove`, `POST /api/packages/update`
- [ ] 4.2 Register package routes in `src/server/server.ts`
- [ ] 4.3 Write tests for package routes: search, install, remove, update, installed list, 409 on concurrent ops

## 5. Server: WebSocket Progress + Session Reload

- [ ] 5.1 Wire `package_progress` events from wrapper to browser gateway broadcast in `src/server/event-wiring.ts`
- [ ] 5.2 Implement session reload in wrapper: after successful operation, send `/reload` to all active sessions via pi-gateway
- [ ] 5.3 Broadcast `package_operation_complete` to browser clients after operation finishes

## 6. Client: PackageBrowser Component

- [ ] 6.1 Create `src/client/hooks/usePackageSearch.ts` — fetch hook for `/api/packages/search` with debounced query and type filter
- [ ] 6.2 Create `src/client/hooks/useInstalledPackages.ts` — fetch hook for `/api/packages/installed`
- [ ] 6.3 Create `src/client/hooks/usePackageOperations.ts` — action callbacks for install/remove/update with WebSocket progress listening
- [ ] 6.4 Create `src/client/components/PackageCard.tsx` — card with name, description, type badges, downloads, install/uninstall button, progress indicator
- [ ] 6.5 Create `src/client/components/PackageBrowser.tsx` — search bar, type filter pills, package grid, README preview panel. Props: `scope`, `cwd?`, `onClose`
- [ ] 6.6 Create `src/client/components/PackageReadmePanel.tsx` — markdown-rendered README with back button

## 7. Client: Settings Panel Integration (Global)

- [ ] 7.1 Add "Packages" section to `src/client/components/SettingsPanel.tsx` showing installed global packages with uninstall/update buttons and "Browse Packages" button
- [ ] 7.2 Wire "Browse Packages" to open PackageBrowser in global scope (dialog or inline expand)

## 8. Client: PiResourcesView Integration (Local)

- [ ] 8.1 Add tab bar ("Installed" / "Packages") to `src/client/components/PiResourcesView.tsx`
- [ ] 8.2 Wire "Packages" tab to render PackageBrowser in local scope with workspace cwd

## 9. Client: WebSocket Message Handling

- [ ] 9.1 Handle `package_progress` messages in `src/client/hooks/useMessageHandler.ts` — update progress state
- [ ] 9.2 Handle `package_operation_complete` messages — refresh installed packages list, show toast/notification

## 10. Documentation

- [ ] 10.1 Update `AGENTS.md` key files table with new modules
- [ ] 10.2 Update `docs/architecture.md` with package management data flow
- [ ] 10.3 Update `README.md` with package management feature description
