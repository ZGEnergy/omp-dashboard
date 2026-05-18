## MODIFIED Requirements

### Requirement: Server discovers client static files
The server SHALL search for pre-built client files using a strategy chain ordered by path durability: paths that survive `npm install` reconciliation SHALL be probed before paths that live inside `node_modules/` and are therefore subject to wipe.

The chain in effect:

1. **Managed-install root** — when `resolveManagedDirRoot(serverDir)` returns non-null (i.e. a `.version` marker is found by walking up from the server's source directory), probe `<managedDir>/packages/dist/client/`. This path is populated by `bundle-server.mjs` at build time and `bundle-extract.ts` at install time. It is durable across `npm install` invocations targeting the same managed directory.
2. **Node module resolver** — `createRequire(...).resolve("@blackbelt-technology/pi-dashboard-web/package.json")`; the resolved package's `dist/`.
3. **Scoped sibling of server** — `<serverDir>/../../pi-dashboard-web/dist`.
4. **Parent-hoisted scope** — `<serverDir>/../../../@blackbelt-technology/pi-dashboard-web/dist`.
5. **Monorepo workspace sibling (dev)** — `<serverDir>/../../client/dist`.
6. **Legacy** — `<serverDir>/../../dist/client`.

Strategies 2–4 resolve into a `node_modules/@blackbelt-technology/` scope directory. That subtree is reconciled (and possibly wiped) by every `npm install` the bootstrap loop runs against the managed install root, which is why they are deprioritised below strategy 1 whenever strategy 1 is reachable.

The server SHALL pick the FIRST candidate whose `index.html` exists.

#### Scenario: Managed-install layout with durable client target
- **WHEN** the server's source directory has an ancestor containing a `.version` marker (the managed-install signal)
- **AND** `<managedDir>/packages/dist/client/index.html` exists
- **THEN** the server SHALL serve static files from `<managedDir>/packages/dist/client/`
- **AND** this SHALL be the chosen path regardless of whether strategies 2–4 also resolve

#### Scenario: Managed-install where scope-dir was wiped after server boot
- **WHEN** the server boots in a managed install layout
- **AND** at boot time `<managedDir>/node_modules/@blackbelt-technology/pi-dashboard-web/dist/index.html` exists
- **AND** during boot a subsequent `npm install` removes the scope directory
- **THEN** `resolveClientDir` MUST have chosen `<managedDir>/packages/dist/client/` (strategy 1 — durable) at boot, NOT the scope-dir candidate
- **AND** subsequent `GET /` requests SHALL return `index.html` with HTTP 200

#### Scenario: Plain npm install (no managed-install marker)
- **WHEN** the server runs from a layout without a `.version` ancestor (e.g. `npm install -g`)
- **AND** the resolved `@blackbelt-technology/pi-dashboard-web/dist/index.html` exists
- **THEN** the server SHALL serve static files from that path (strategy 2)

#### Scenario: Monorepo dev layout
- **WHEN** running in the monorepo without a `.version` ancestor
- **AND** `packages/client/dist/index.html` exists
- **THEN** the server SHALL serve static files from the sibling client package (strategy 5)

#### Scenario: Legacy dist path
- **WHEN** neither managed-install nor scope nor workspace paths exist
- **AND** `dist/client/index.html` exists
- **THEN** the server SHALL serve static files from `dist/client/` (strategy 6)

### Requirement: API-only mode when no client found
The server SHALL operate without static file serving when no client build is found.

#### Scenario: No client build present
- **WHEN** none of the client file search paths contain an `index.html`
- **THEN** the server SHALL start successfully, serving only API routes and WebSocket endpoints
- **AND** the server SHALL log that it is running in API-only mode

#### Scenario: API routes work without client
- **WHEN** the server is in API-only mode
- **AND** a request is made to `/api/health`
- **THEN** the server SHALL respond normally
