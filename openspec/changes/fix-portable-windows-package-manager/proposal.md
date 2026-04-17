## Why

On portable Windows (Electron standalone mode), the package manager UI shows "pi-coding-agent is not installed" because `loadPiPackageManager()` doesn't check the managed install directory (`~/.pi-dashboard/node_modules/`) where the Electron wizard installs pi. This blocks all package operations (install, remove, update) on portable Windows.

## What Changes

- Add a managed-install resolution path to `loadPiPackageManager()` in `packages/server/src/package-manager-wrapper.ts` that checks `~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent/dist/index.js` (and the `@oh-my-pi` variant) before falling back to `npm root -g`.
- Resolution order becomes: direct import → managed install → global npm.

## Capabilities

### New Capabilities

_(none — this is a bug fix to existing capability)_

### Modified Capabilities

- `package-management`: Add managed-install resolution so `loadPiPackageManager()` finds pi in `~/.pi-dashboard/node_modules/` on portable/standalone Electron installs.

## Impact

- **Code**: `packages/server/src/package-manager-wrapper.ts` — `loadPiPackageManager()` function only.
- **Platforms**: Fixes portable Windows; no change to behavior on macOS/Linux where pi is typically installed globally.
- **Risk**: Minimal — adds a new fallback path between two existing ones; existing paths are unchanged.
