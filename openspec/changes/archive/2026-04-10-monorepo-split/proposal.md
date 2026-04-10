# Monorepo Split

## Why

The dashboard is a single npm package that bundles server, client, extension, and shared types together. Users who want to run the web UI separately from the backend (e.g., host the SPA on a CDN while agents and server run on a remote machine) cannot do so without installing everything. Splitting into separate packages enables independent deployment, lighter installs, and clearer ownership boundaries.

## What Changes

Restructure the project into an npm workspaces monorepo with four publishable packages plus a backwards-compatible meta-package.

### Package Structure

```
pi-agent-dashboard/
├── package.json                          (workspaces root)
├── tsconfig.base.json                    (shared compiler options)
├── packages/
│   ├── shared/                           @blackbelt-technology/pi-dashboard-shared
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/                          ← current src/shared/
│   ├── server/                           @blackbelt-technology/pi-dashboard-server
│   │   ├── package.json                  (bin: pi-dashboard)
│   │   ├── tsconfig.json
│   │   └── src/                          ← current src/server/
│   ├── extension/                        @blackbelt-technology/pi-dashboard-extension
│   │   ├── package.json                  (pi.extensions, pi.skills)
│   │   ├── tsconfig.json
│   │   └── src/                          ← current src/extension/
│   └── client/                           @blackbelt-technology/pi-dashboard-web
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── src/                          ← current src/client/
├── public/                               (PWA assets, referenced by client vite config)
├── scripts/
└── docs/
```

### Dependency Graph

- **shared** — zero internal deps; exports types, protocol, config, utilities
- **server** — depends on shared; Fastify, ws, node-pty, bonjour-service
- **extension** — depends on shared; peerDep on @mariozechner/pi-coding-agent
- **client** — depends on shared; React, xterm, tailwind, vite
- **meta-package** (root) — depends on server + extension + client for backwards compat

### Cross-Origin Client Support

- Add `useApiBase()` hook that derives HTTP base URL from the active WebSocket URL
- Replace all relative `/api/...` fetch calls with `${apiBase}/api/...`
- Same-origin deployments use empty string prefix (no behavioral change)
- Build-time `VITE_API_URL` env var for static hosting with a fixed server

### Server CORS

- Add `@fastify/cors` to the server
- Localhost origins allowed by default
- Configurable `cors.allowedOrigins` in dashboard config

### Server Static File Serving

- Server optionally serves client static files if `@blackbelt-technology/pi-dashboard-web` is installed (or `dist/client/` exists)
- When not present, server is API-only — no 404 for missing UI files

### Type Migration

- Move `ArchiveEntry` from `src/server/openspec-archive.ts` to shared package (only cross-package type violation)

### Skills and Pi Fields

- `pi.extensions` and `pi.skills` (`.pi/skills/pi-dashboard/`) move to the extension package
- Extension package is the pi-installable unit

### Meta-Package

- Root `package.json` becomes `@blackbelt-technology/pi-dashboard`
- Dependencies: server + extension + client
- `npm install @blackbelt-technology/pi-dashboard` gives the same all-in-one experience as today
- `bin`, `pi.extensions`, `pi.skills` fields proxy to extension package

## What Doesn't Change

- All existing functionality — no features added or removed
- The WebSocket protocols (extension↔server, server↔browser)
- The REST API surface
- Session persistence format
- Config file location (`~/.pi/dashboard/config.json`)
- Dev workflow: `npm run dev`, `npm run build`, `npm run reload` still work from root

## Risks

- **Import path changes** — Every `../shared/` import becomes a package import (`@blackbelt-technology/pi-dashboard-shared`). Large mechanical diff.
- **Test configuration** — Vitest config needs workspace-aware setup or per-package configs.
- **Publish coordination** — All packages must version-bump together; the shared package is a breaking-change bottleneck.
- **node-pty native addon** — Must stay in server package only; postinstall script needs to scope correctly.
