# Extend What's-New changelog icon to all updatable packages

## Why

The What's-New icon + `WhatsNewDialog` only surfaces for the single pi core
package. Every other installed package that has an update available shows no
changelog affordance, even when the package ships a `CHANGELOG.md`. Users want
the same "what changed in the new version" surface for any updatable package.

The server endpoint `GET /api/pi-core/changelog` hard-rejects any `pkg` not in
`CORE_PACKAGE_NAMES` with `400`. That whitelist was a path-traversal guard, not
a product decision. It now blocks the obvious generalization.

## What Changes

- Relax the endpoint's `pkg` gate from a fixed whitelist to a **strict npm
  package-name format check** (scoped + unscoped), rejecting any value
  containing path separators or `..`. Same anti-traversal guarantee, no
  hardcoded package list.
- **Resolve globally-installed packages.** The prior `findChangelogPath`
  strategies (managed dir, dashboard bare-import, walk-up) only saw
  dashboard dependencies; global extensions (`pi-web-access` etc.) were
  invisible, so the endpoint returned empty even when a CHANGELOG existed.
  Add a 4th strategy: search global node_modules roots derived from
  `process.execPath` (`<prefix>/lib/node_modules` Unix/nvm,
  `<prefix>/node_modules` Windows). Once the dir resolves, its
  `package.json#repository` drives the same remote-first GitHub fetch.
- Package without a locatable CHANGELOG -> existing empty-response path
  (`releases: []`). No new error surface.
- Remote-fetch (`raw.githubusercontent.com`) stays best-effort: derived from
  the package's own `repository` field; non-GitHub or missing → local-only.
- Client: wire the What's-New icon for every package row that has an update
  available, not just pi core. A package whose changelog query returns empty
  renders no icon — silent skip, no warning, no error toast.

## Impact

- Affected specs: `pi-changelog-display`
- Affected code:
  - `packages/server/src/routes/pi-changelog-routes.ts` (gate relaxation via `isValidNpmPackageName`)
  - `packages/server/src/changelog-fs.ts` (new `isValidNpmPackageName` export + Strategy 4 global node_modules search)
  - `packages/client/src/components/WhatsNewPackageRow.tsx` (new per-row wrapper owning hook + dialog)
  - `packages/client/src/components/UnifiedPackagesSection.tsx` (per-row wiring + `npmNameFromSource`)
  - `packages/server/src/__tests__/pi-changelog-routes.test.ts` (gate-semantics tests)
- Security: path-traversal still blocked by name-format validation; no
  filesystem path is built from unvalidated input.
- No new REST route, no new WS message, no config change.
