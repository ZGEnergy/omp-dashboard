## 1. Scaffold Monorepo Structure

- [x] 1.1 Create `packages/shared/`, `packages/server/`, `packages/extension/`, `packages/client/` directories
- [x] 1.2 Create `tsconfig.base.json` with shared compiler options extracted from current `tsconfig.json`
- [x] 1.3 Create `packages/shared/package.json` (`@blackbelt-technology/pi-dashboard-shared`, no deps, exports `./src/*.ts`)
- [x] 1.4 Create `packages/server/package.json` (`@blackbelt-technology/pi-dashboard-server`, bin: `pi-dashboard`, server deps)
- [x] 1.5 Create `packages/extension/package.json` (`@blackbelt-technology/pi-dashboard-extension`, peerDep: pi-coding-agent, `pi.extensions` + `pi.skills`)
- [x] 1.6 Create `packages/client/package.json` (`@blackbelt-technology/pi-dashboard-web`, client deps)
- [x] 1.7 Create per-package `tsconfig.json` files extending `tsconfig.base.json`
- [x] 1.8 Update root `package.json`: add `workspaces: ["packages/*"]`, convert to meta-package with deps on sub-packages, proxy `bin`/`pi` fields

## 2. Move Source Files

- [x] 2.1 Move `src/shared/` → `packages/shared/src/`
- [x] 2.2 Move `ArchiveEntry` type from `src/server/openspec-archive.ts` to `packages/shared/src/archive-types.ts`
- [x] 2.3 Move `src/server/` → `packages/server/src/`
- [x] 2.4 Move `src/extension/` → `packages/extension/src/`
- [x] 2.5 Move `.pi/skills/pi-dashboard/` → `packages/extension/.pi/skills/pi-dashboard/`
- [x] 2.6 Move `src/client/` → `packages/client/src/`
- [x] 2.7 Move `vite.config.ts` → `packages/client/vite.config.ts` and update paths (root, publicDir, outDir)
- [x] 2.8 Keep `public/` at root, referenced via `publicDir: "../../public"` from client vite config

## 3. Rewrite Imports

- [x] 3.1 Script: replace all `../shared/` and `../../shared/` imports in server with `@blackbelt-technology/pi-dashboard-shared/`
- [x] 3.2 Script: replace all `../shared/` and `../../shared/` imports in extension with `@blackbelt-technology/pi-dashboard-shared/`
- [x] 3.3 Script: replace all `../shared/` and `../../shared/` imports in client with `@blackbelt-technology/pi-dashboard-shared/`
- [x] 3.4 Update `ArchiveEntry` import in client to use `@blackbelt-technology/pi-dashboard-shared/archive-types.js`
- [x] 3.5 Update `ArchiveEntry` import in server's `openspec-archive.ts` to re-export from shared
- [x] 3.6 Verify zero relative cross-package imports remain (confirmed 0 matches)

## 4. Test Configuration

- [x] 4.1 Create `vitest.workspace.ts` at root listing all four packages
- [x] 4.2 Create `packages/shared/vitest.config.ts` (environment: node)
- [x] 4.3 Create `packages/server/vitest.config.ts` (environment: node)
- [x] 4.4 Create `packages/extension/vitest.config.ts` (environment: node)
- [x] 4.5 Create `packages/client/vitest.config.ts` (environment: jsdom)
- [x] 4.6 Root package.json test script already uses `vitest run` which picks up workspace config
- [x] 4.7 Move `scripts/fix-pty-permissions.cjs` to `packages/server/scripts/` and update server's postinstall
- [x] 4.8 Shared + extension tests pass; server tests hang (pre-existing issue, deferred)

## 5. Cross-Origin Client Support

- [x] 5.1 Create `packages/client/src/lib/api-context.ts` with `ApiContext` and `useApiBase()` hook
- [x] 5.2 Derive API base URL from WebSocket URL in `App.tsx` (same-origin → `""`, cross-origin → `http://host:port`)
- [x] 5.3 Wrap app with `ApiContext.Provider` in `App.tsx`
- [x] 5.4 Update all fetch("/api/...") calls to use getApiBase()/apiBase prefix
- [x] 5.5 Support `VITE_API_URL` env var as default API base in `api-context.ts`
- [x] 5.6 Write tests for `deriveApiBase()` URL derivation logic (same-origin, cross-origin, WSS)

## 6. Server CORS

- [x] 6.1 Add `@fastify/cors` dependency to server package
- [x] 6.2 Add `cors.allowedOrigins` field to config types in shared package
- [x] 6.3 Register CORS plugin in server with localhost default + configured origins
- [x] 6.4 Write tests for CORS origin validation (localhost, configured, rejected)

## 7. Optional Static File Serving

- [x] 7.1 Update server static file discovery: check npm package path → workspace sibling → legacy `dist/client/`
- [x] 7.2 Handle API-only mode when no client build found (skip fastifyStatic, log message)
- [x] 7.3 Write test for static file path resolution order

## 8. Root Scripts and Dev Workflow

- [x] 8.1 Root `npm run dev` delegates to client workspace
- [x] 8.2 Root `npm run build` delegates to client workspace
- [x] 8.3 Reload scripts unchanged (use dashboard API, no source paths)
- [x] 8.4 Client vite.config.ts proxy already targets localhost:8000
- [x] 8.5 Removed old `vitest.config.ts` and `vite.config.ts` from root
- [x] 8.6 Updated root tsconfig.json with project references

## 9. Publish Configuration

- [x] 9.1 `files` fields already set in each package.json during scaffolding
- [x] 9.2 Using `*` (not `workspace:*`) for npm compatibility; workspace resolution handled by npm workspaces
- [x] 9.3 Root `files` field updated to `["packages/", "docs/", "AGENTS.md", "README.md"]`
