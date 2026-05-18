## Why

When PI-Dashboard.app launches on macOS for the first time, the wizard surfaces
`Failed to run npm root -g: spawnSync npm ENOENT` from
`packages/server/src/package-manager-wrapper.ts:110`. Root cause: pi's
`DefaultPackageManager` is instantiated by the dashboard server *before* the
shared `ToolRegistry` has a working resolution for `npm`. On Electron-launched
GUI processes on macOS, `process.env.PATH` does not include
`/usr/local/bin` or `/opt/homebrew/bin`, so the registry's `whereStrategy("npm")`
fails. The npm executor definition (`packages/shared/src/tool-registry/definitions.ts`)
provides a `npmCliBesideNodeStrategy` only on Windows, and `process.execPath`
on macOS Electron points at the Electron binary (no npm sibling). Pi's
package manager then calls `npm root -g` synchronously and crashes with
ENOENT before the wizard's own `resolveNpm()` cascade (managed → bundled →
system) has a chance to populate `~/.pi-dashboard/node/`.

The error is currently swallowed past the wizard (the install proceeds via
the offline cacache path), but it scares users, pollutes Doctor reports, and
turns into a real failure on any later pi-driven npm call where the registry
is consulted directly without an Electron-side fallback.

## What Changes

- Add a new strategy `electronBundledNpmStrategy` to the `npm` executor
  definition in `packages/shared/src/tool-registry/definitions.ts`.
  Probes `process.resourcesPath/node/lib/node_modules/npm/bin/npm-cli.js`
  (Unix) and `process.resourcesPath/node/node_modules/npm/bin/npm-cli.js`
  (Windows) — same layout as `getBundledNpmPath()` in
  `packages/electron/src/lib/bundled-node.ts`. Inserts after
  `managedRuntimeStrategy` and before `whereStrategy` in BOTH unix and
  win32 strategy chains.
- The strategy returns `{ ok: false }` cleanly when `process.resourcesPath`
  is unset (CLI / extension / dev contexts), so non-Electron runs are
  unaffected.
- Add identical `electronBundledNodeStrategy` for the `node` executor for
  parity (currently masked because pi rarely spawns bare `node`, but
  resolves a latent footgun).
- Server bootstrap (`packages/server/src/server.ts` startup path) calls
  `getDefaultRegistry().rescan()` after the Electron-bundled strategies
  are wired in so any earlier resolution failures don't poison caches.
- Repo-lint test added: `packages/shared/src/__tests__/electron-bundled-npm-strategy.test.ts`
  feeds the strategy a mocked `process.resourcesPath` + memfs layout
  matching `packages/electron/scripts/bundle-server.mjs` output and asserts
  resolution returns the expected `npm-cli.js` path on both platforms.
- Repo-lint test added: assert `npmExecutorDef` chains include the new
  strategy on both platforms in the correct position.

## Capabilities

### New Capabilities
(None — extending existing `tool-registry` spec.)

### Modified Capabilities

- `tool-registry`: `npm` executor strategy chain MUST include an
  Electron-bundled strategy that probes `process.resourcesPath/node/.../npm-cli.js`.
  Strategy ordering: `override → managed-runtime → electron-bundled →
  npm-cli-beside-node (win32 only) → where`. Same for `node` executor
  (without the npm-cli-beside-node entry).

## Impact

- Code:
  - `packages/shared/src/tool-registry/definitions.ts` — add strategy +
    wire into both chains.
  - `packages/shared/src/tool-registry/strategies.ts` — export the new
    `electronBundledRuntimeStrategy(toolName, deps)` factory beside
    the existing `managedRuntimeStrategy`.
  - `packages/shared/src/__tests__/electron-bundled-npm-strategy.test.ts` (new)
  - `packages/shared/src/__tests__/tool-registry-definitions.test.ts` (extend)
- No changes required to:
  - `packages/electron/src/lib/dependency-installer.ts` (`resolveNpm()` keeps
    its own cascade as a fallback while the registry pre-warm rolls out)
  - `packages/server/src/package-manager-wrapper.ts` (`resolveViaRegistry`
    behavior unchanged — the registry now returns a resolved path so the
    `[command, ...args]` passthrough no longer fires)
- Risk: low. The new strategy only fires when `process.resourcesPath` is
  populated (Electron) AND the bundled tree exists at the expected layout
  (always true for builds produced by `bundle-server.mjs`). Non-Electron
  consumers (CLI, extension, dev server) skip it.
- Observable behaviour: clean Electron startup logs lose the "Failed to
  run npm root -g" warning. Doctor's `npm.path` row reports the bundled
  path on first run instead of "not found".
