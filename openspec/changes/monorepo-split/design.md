## Context

The dashboard is a single npm package (`@blackbelt-technology/pi-dashboard`) containing four tightly co-located but logically distinct components: shared types, server, extension, and web client. All share one `package.json`, one `tsconfig.json`, and one vitest config. Imports between components use relative paths (`../shared/`).

The codebase is clean — only one cross-package type violation exists (`ArchiveEntry` in server imported by client). The client already supports connecting to remote servers via `ServerSelector`, but REST API calls use relative URLs assuming same-origin.

Current scale: ~151 shared imports across server/client/extension, 49 relative `/api/...` fetch calls in the client, 165 test files, 22 extension source files, 48 server source files, ~134 client source files.

## Goals / Non-Goals

**Goals:**
- Four independently publishable npm packages + one meta-package
- Client hostable separately from server (CDN, nginx, any static host)
- Server runnable without bundled UI (API-only mode)
- Extension installable independently (for remote pi agents)
- Backwards-compatible meta-package preserving current install experience
- Root-level dev scripts (`npm test`, `npm run dev`, `npm run build`) still work

**Non-Goals:**
- Independent versioning per package (all packages share one version for now)
- Separate CI pipelines per package
- Breaking changes to protocols, REST API, or config format
- Client-side offline/PWA improvements
- New features beyond cross-origin support

## Decisions

### 1. npm workspaces (not pnpm/turborepo)

Use npm native workspaces. The project already uses npm, and workspaces provide sufficient isolation without adding tooling. No build orchestration needed — server and extension run TypeScript directly via jiti, only the client needs a build step.

**Alternative considered:** pnpm workspaces — faster installs, stricter isolation, but adds a tool dependency and changes the contributor workflow. Turborepo — overkill for four packages with minimal build graph.

### 2. Package layout under `packages/`

```
packages/
├── shared/      → @blackbelt-technology/pi-dashboard-shared
├── server/      → @blackbelt-technology/pi-dashboard-server
├── extension/   → @blackbelt-technology/pi-dashboard-extension
└── client/      → @blackbelt-technology/pi-dashboard-web
```

Root `package.json` becomes the meta-package (`@blackbelt-technology/pi-dashboard`) with `"workspaces": ["packages/*"]`.

**Alternative considered:** Flat structure with multiple `package.json` entry points — less restructuring but confusing `src/` layout and no clear package boundaries.

### 3. Shared package as source-only (no build step)

The shared package exports TypeScript source directly. Consumers (server, extension, client) import from `@blackbelt-technology/pi-dashboard-shared` and their own build/runtime handles TypeScript:
- Server: jiti (pi's TypeScript loader) resolves TS at runtime
- Extension: jiti resolves TS at runtime
- Client: Vite bundles TS at build time

This avoids a `tsc` build step for shared and keeps the DX simple.

**Package.json approach:**
```json
{
  "name": "@blackbelt-technology/pi-dashboard-shared",
  "exports": {
    "./*": "./src/*.ts"
  }
}
```

**Alternative considered:** Pre-build shared to JS with declarations — adds a build step, watcher needed during dev, more complex publish pipeline. Not worth it when all consumers already handle TS.

### 4. Client `useApiBase()` hook + `ApiContext`

Create a React context providing the API base URL, derived from the active WebSocket connection URL:

```tsx
// ApiContext.tsx
const ApiContext = createContext<string>("");
export const useApiBase = () => useContext(ApiContext);

// In App.tsx — derive from wsUrl
// ws://host:8000/ws → http://host:8000
// Same-origin → "" (empty string, relative URLs work unchanged)
```

All 49 `fetch("/api/...")` calls become `fetch(\`${apiBase}/api/...\`)`.

For static hosting without server selection UI, support `VITE_API_URL` build-time env var as default.

**Alternative considered:** API client class — more structured but heavier; a simple string prefix via context is sufficient given the existing fetch patterns.

### 5. CORS with localhost default

Add `@fastify/cors` to the server:

```ts
fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow: no origin (same-origin), localhost/127.0.0.1 any port, configured origins
    if (!origin || isLocalhostOrigin(origin) || configuredOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed"), false);
    }
  },
  credentials: true  // needed for auth cookies cross-origin
});
```

Config field: `cors.allowedOrigins: string[]` in `~/.pi/dashboard/config.json`.

### 6. Server optional static serving

The server checks for client files in order:
1. `node_modules/@blackbelt-technology/pi-dashboard-web/dist/` (installed as dependency)
2. Sibling `../client/dist/` (monorepo workspace)
3. Legacy `dist/client/` (backwards compat)

If none found, server runs in API-only mode — no 404 handler for HTML, just API routes.

### 7. tsconfig project references

Root `tsconfig.base.json` with shared compiler options. Each package has its own `tsconfig.json` extending base:

```json
// packages/server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [
    { "path": "../shared" }
  ]
}
```

This gives IDE navigation across packages and type-checking per package.

### 8. Vitest workspace config

Root `vitest.workspace.ts` defining all packages:

```ts
export default [
  "packages/shared",
  "packages/server",
  "packages/extension",
  "packages/client"
];
```

Each package has its own `vitest.config.ts` with environment set appropriately (`jsdom` for client, `node` for server/extension/shared). Root `npm test` runs all.

### 9. Meta-package structure

Root `package.json`:
```json
{
  "name": "@blackbelt-technology/pi-dashboard",
  "dependencies": {
    "@blackbelt-technology/pi-dashboard-server": "workspace:*",
    "@blackbelt-technology/pi-dashboard-extension": "workspace:*",
    "@blackbelt-technology/pi-dashboard-web": "workspace:*"
  },
  "bin": {
    "pi-dashboard": "./node_modules/@blackbelt-technology/pi-dashboard-server/src/server/cli.ts"
  },
  "pi": {
    "extensions": ["./node_modules/@blackbelt-technology/pi-dashboard-extension/src/extension/bridge.ts"],
    "skills": ["./node_modules/@blackbelt-technology/pi-dashboard-extension/.pi/skills/pi-dashboard"]
  }
}
```

When published, `workspace:*` resolves to actual version numbers.

### 10. Import rewriting strategy

Mechanical find-and-replace:
- `../shared/foo.js` → `@blackbelt-technology/pi-dashboard-shared/foo.js`
- `../../shared/foo.js` → `@blackbelt-technology/pi-dashboard-shared/foo.js`

Within each package, relative imports stay relative (e.g., `./memory-event-store.js` within server).

The one cross-violation (`ArchiveEntry`) moves from `src/server/openspec-archive.ts` to `packages/shared/src/archive-types.ts`.

## Risks / Trade-offs

**[Large mechanical diff]** → 151+ import rewrites. Mitigate with scripted rewrite (`sed`/codemod) and verify with `tsc --noEmit` per package.

**[Publish coordination]** → All packages must publish together with matching versions. Mitigate with a root-level publish script that bumps all `package.json` versions atomically. Consider `changesets` later if independent versioning needed.

**[node-pty postinstall]** → The `fix-pty-permissions.cjs` script must run only in the server package. Move it to `packages/server/scripts/` and update server's `postinstall`.

**[Workspace resolution at publish time]** → `workspace:*` must resolve to real versions when publishing. npm workspaces handle this natively with `npm publish --workspaces`. Verify in CI before first publish.

**[Dev mode Vite proxy]** → Vite config moves to `packages/client/`. The `proxy` config for `/api` and `/ws` still points to `localhost:8000`. No change needed since Vite runs independently.

**[Test imports]** → Test files that import from `../../shared/` need the same rewrite. 45 test file imports affected.
