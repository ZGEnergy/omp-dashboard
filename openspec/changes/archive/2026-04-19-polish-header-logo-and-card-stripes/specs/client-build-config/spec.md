## ADDED Requirements

### Requirement: Vite publicDir resolves to the project-root public/ directory
The Vite build configuration in `packages/client/vite.config.ts` SHALL set `publicDir` to a value that resolves (relative to the configured `root`) to the project-root `public/` directory containing `icon-192.png`, `icon-512.png`, `manifest.json`, and `sw.js`. With `root: "src"`, the correct relative value is `"../../../public"` (three `../` hops). The previous value `"../../public"` resolved to a non-existent `packages/public/` directory, causing Vite to silently skip copying static assets and producing a `dist/` without favicons, the PWA manifest, or the service worker.

#### Scenario: Static public assets are bundled into dist
- **WHEN** the production build runs (`npm run build`)
- **THEN** `packages/client/dist/icon-192.png` exists
- **AND** `packages/client/dist/icon-512.png` exists
- **AND** `packages/client/dist/manifest.json` exists
- **AND** `packages/client/dist/sw.js` exists

#### Scenario: Server serves the bundled icon
- **WHEN** the dashboard server runs in production mode and the client build is present
- **AND** a client requests `GET /icon-192.png`
- **THEN** the response status is 200
- **AND** the response `Content-Type` is `image/png`
- **AND** the response body is the actual PNG (NOT the SPA `index.html` fallback)
