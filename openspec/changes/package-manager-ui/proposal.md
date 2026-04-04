## Why

The dashboard can display installed pi resources (extensions, skills, prompts) via `PiResourcesView`, but it's read-only. To discover, install, update, or remove packages, users must drop to a terminal and run `pi install`/`pi remove`/`pi update`. Bringing package management into the dashboard closes this gap — browse the npm registry, manage installed packages, and auto-reload all active sessions after changes, all without leaving the browser.

## What Changes

### 1. Server: npm registry search proxy

A new REST endpoint proxies search requests to `registry.npmjs.org/-/v1/search` filtered by `keywords:pi-package`. This avoids CORS issues and allows server-side caching/rate-limiting.

### 2. Server: PackageManager wrapper

A new server module imports pi's `DefaultPackageManager` and `SettingsManager` to perform install, remove, update, and list operations. Progress events from pi's `ProgressCallback` are forwarded to connected browsers via WebSocket so the UI can show real-time feedback (cloning, npm install, etc).

### 3. Server: REST + WebSocket endpoints for package operations

- `GET /api/packages/search?q=&type=` — proxied npm search
- `GET /api/packages/readme?pkg=` — fetch package README from npm
- `GET /api/packages/installed?cwd=&scope=global|local` — list installed packages
- `POST /api/packages/install` — install a package (body: `{ source, scope, cwd? }`)
- `POST /api/packages/remove` — remove a package (body: `{ source, scope, cwd? }`)
- `POST /api/packages/update` — update packages (body: `{ source?, scope, cwd? }`)
- WebSocket: `package_progress` events streamed during install/remove/update

### 4. Auto-reload sessions after package changes

After any install/remove/update completes, the server broadcasts a reload command to all connected pi sessions via the existing pi-gateway WebSocket — same mechanism as `npm run reload`.

### 5. Client: Global package management in Settings

A new "Packages" section in `SettingsPanel.tsx` showing:
- Installed global packages with uninstall/update buttons
- A "Browse Packages" button opening a searchable npm package browser
- One-click install with progress indicator

### 6. Client: Local package management in PiResourcesView

A new "Packages" tab alongside the existing installed resources view:
- Browse & search npm packages (same browser component, scoped to local install)
- List locally installed packages with uninstall/update buttons
- Install triggers `pi install --local` equivalent for the workspace

### 7. Shared browse/install UI component

A reusable `PackageBrowser` component used by both Settings (global) and Resources (local):
- Search bar with type filter pills (extension, skill, theme, prompt)
- Package cards showing name, description, download count, type badges
- README preview panel
- Install button with progress feedback
- "Installed" badge for already-installed packages

## Capabilities

### New Capabilities

- `package-search`: Search the npm registry for pi packages, filtered by type, with server-side proxy and caching.
- `package-install`: Install pi packages (npm or git source) from the dashboard UI with real-time progress feedback.
- `package-remove`: Uninstall pi packages from the dashboard UI.
- `package-update`: Update installed pi packages from the dashboard UI.
- `package-browse`: Reusable package browser component with search, filter, README preview, and install actions.
- `session-reload-on-package-change`: Auto-reload all active pi sessions after any package install/remove/update.

### Modified Capabilities

- `settings-panel`: Add a "Packages" section for global package management.
- `pi-resources-view`: Add a "Packages" tab for local (per-workspace) package management.

## Impact

- **Server code**: New modules — `package-manager-wrapper.ts`, `routes/package-routes.ts`, npm search proxy logic. Modify `event-wiring.ts` or `pi-gateway.ts` for session reload broadcast.
- **Client code**: New components — `PackageBrowser.tsx`, `PackageCard.tsx`. Modify `SettingsPanel.tsx` and `PiResourcesView.tsx` to host the new UI.
- **Shared code**: New types in `rest-api.ts` and `browser-protocol.ts` for package operations and progress events.
- **Dependencies**: pi's `DefaultPackageManager` and `SettingsManager` imported on the server. These are already available since the dashboard depends on `@mariozechner/pi-coding-agent`.
- **Tests**: New tests for search proxy, package operations, progress forwarding, and session reload trigger.
- **Risk**: Coupling to pi's internal `PackageManager` API — if the API changes across pi versions, the wrapper needs updating. Mitigated by keeping the wrapper thin and version-checking at startup.
