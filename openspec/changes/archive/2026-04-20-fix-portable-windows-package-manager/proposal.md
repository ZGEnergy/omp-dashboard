## Why

On portable Windows (Electron standalone mode), the package manager UI shows "pi-coding-agent is not installed" because `loadPiPackageManager()` doesn't check the managed install directory (`~/.pi-dashboard/node_modules/`) where the Electron wizard installs pi. This blocks all package operations (install, remove, update) on portable Windows.

## What Changes

- Add a managed-install resolution path to `loadPiPackageManager()` in `packages/server/src/package-manager-wrapper.ts` that checks `~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent/dist/index.js` (and the `@oh-my-pi` variant) before falling back to `npm root -g`.
- Resolution order becomes: direct import → managed install → global npm.

## Capabilities

### New Capabilities

- `package-management`: Pi module resolution chain (direct import → managed install → global npm) used by all package operations (install, remove, update, list, check-updates). Previously undocumented; this change adds the managed-install path and formalizes the resolution order in the spec.

### Modified Capabilities

_(none — no existing `package-management` spec to modify)_

## Impact

- **Code**: `packages/server/src/package-manager-wrapper.ts` — `loadPiPackageManager()` function only.
- **Platforms**: Fixes portable Windows; no change to behavior on macOS/Linux where pi is typically installed globally.
- **Risk**: Minimal — adds a new fallback path between two existing ones; existing paths are unchanged.
