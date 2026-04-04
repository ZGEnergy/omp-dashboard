## Context

The dashboard already displays installed pi resources (extensions, skills, prompts) via `PiResourcesView` and `pi-resource-scanner.ts`, but this is read-only filesystem scanning. Pi's CLI provides `pi install`, `pi remove`, `pi update` for package management, backed by `DefaultPackageManager` and `SettingsManager` — both publicly exported from `@mariozechner/pi-coding-agent`.

The pi.dev/packages page searches npm for `keywords:pi-package` via `registry.npmjs.org/-/v1/search` and renders cards client-side. We want to bring equivalent browsing + management into the dashboard.

Reload after install works by sending `/reload` to each connected session via the existing `send_prompt` WebSocket message — same mechanism as `scripts/reload-all.sh`.

## Goals / Non-Goals

**Goals:**
- Browse npm registry for pi packages from the dashboard UI
- Install/remove/update packages (global and per-workspace local)
- Show real-time progress during install operations
- Auto-reload all active pi sessions after any package change
- Reuse a single `PackageBrowser` component for both Settings (global) and Resources (local) contexts

**Non-Goals:**
- Custom package registry (we use npm's public search API only)
- Git source browsing UI (install by git URL supported, but no git search/browse)
- Package version pinning UI (users can type `npm:pkg@version` manually)
- Replacing the existing `PiResourcesView` installed resources display

## Decisions

### 1. Use pi's `DefaultPackageManager` directly on the server

**Decision:** Import `DefaultPackageManager` and `SettingsManager` from `@mariozechner/pi-coding-agent` and instantiate per-operation on the server.

**Why:** Pi already handles all the complexity — npm install, git clone, settings persistence, path resolution, deduplication. Reimplementing would be fragile and drift from pi's behavior.

**Alternative considered:** Shell out to `pi install` CLI. Rejected because: no structured progress events, harder error handling, requires pi binary in PATH, can't stream progress.

**Construction:**
```typescript
const settingsManager = SettingsManager.create(cwd, agentDir);
const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
packageManager.setProgressCallback((event) => { /* forward to browser */ });
```

Create a fresh instance per operation (install/remove/update) rather than caching, since `SettingsManager` reads files at construction time and we want fresh state.

### 2. Server-side npm search proxy

**Decision:** Add `GET /api/packages/search` that proxies to `registry.npmjs.org/-/v1/search?text=keywords:pi-package`.

**Why:** Avoids CORS issues from the browser. Enables server-side caching (5-minute TTL) to reduce npm API calls. Same approach pi.dev uses but proxied.

**Alternative considered:** Direct browser fetch to npm. Rejected because CORS headers are unreliable and we can't cache.

### 3. README fetched from npm registry

**Decision:** `GET /api/packages/readme?pkg=<name>` fetches the package manifest from `registry.npmjs.org/<name>` and extracts the `readme` field.

**Why:** Works for any npm package without needing it installed locally. The npm registry includes README in the package manifest response.

### 4. Progress via WebSocket broadcast

**Decision:** During install/remove/update, forward pi's `ProgressEvent` objects to all subscribed browser clients via the existing browser gateway WebSocket as `package_progress` messages.

**Why:** Install operations can take 10-30 seconds (npm install, git clone). Users need feedback. WebSocket is already the primary real-time channel.

**Message shape:**
```typescript
{ type: "package_progress", event: ProgressEvent, operationId: string }
```

### 5. Session reload via existing send_prompt mechanism

**Decision:** After any successful install/remove/update, iterate all connected sessions and send `/reload` via the existing `send_prompt` browser message handler — same as `scripts/reload-all.sh`.

**Why:** No new protocol needed. `/reload` is already handled by pi sessions. The dashboard server already has access to all connected sessions via `pi-gateway`.

### 6. UI placement: Settings (global) + Resources tab (local)

**Decision:**
- Global packages: new "Packages" section in `SettingsPanel.tsx`
- Local packages: new "Packages" tab in `PiResourcesView` (alongside existing installed resources)
- Both use a shared `PackageBrowser` component parameterized by scope

**Why:** Matches pi's own scope model (`~/.pi/agent/settings.json` for global, `.pi/settings.json` for local). Settings is naturally the place for global config. Resources is naturally per-workspace.

### 7. Single operation at a time

**Decision:** The server serializes package operations (only one install/remove/update runs at a time). Concurrent requests queue or return 409 Conflict.

**Why:** Pi's `PackageManager` modifies `settings.json` and runs npm/git commands. Concurrent operations could corrupt state. Simplest to serialize.

## Risks / Trade-offs

- **[Coupling to pi internals]** → `DefaultPackageManager` API could change across pi versions. Mitigation: wrap in a thin adapter (`package-manager-wrapper.ts`) so breakage is localized to one file. The dashboard already depends on pi as a dependency.

- **[npm API rate limits]** → npm's search API has rate limits. Mitigation: server-side caching with 5-minute TTL. Users won't search that frequently.

- **[Long-running operations block]** → npm install or git clone can take 30+ seconds. Mitigation: operations run async with progress streaming. The API returns an `operationId` immediately, progress streams via WebSocket, completion notifies via WebSocket.

- **[SettingsManager file locking]** → Multiple dashboard instances or pi CLI running simultaneously could conflict on `settings.json`. Mitigation: single-operation serialization on the server side. Can't prevent external pi CLI conflicts, but that's an existing limitation of pi itself.
