## Why

The dashboard server uses `tsx` as its TypeScript loader (`--import tsx`), adding a standalone dependency. Pi already ships `@mariozechner/jiti` — the same kind of TypeScript loader — as a core dependency. Using pi's jiti eliminates the tsx dependency entirely, reducing install size and aligning the dashboard with pi's own runtime tooling.

## What Changes

- ~~Replace `--import tsx` with `--import <absolute-path-to-jiti-register.mjs>` in all server spawn sites~~ *(Already done — `packages/extension/src/server-launcher.ts` uses `resolveJitiImport()` from `@blackbelt-technology/pi-dashboard-shared/resolve-jiti.js`, and `packages/electron/src/lib/server-lifecycle.ts` has jiti fallback via `resolveJitiFromPi()`)*
- Replace the shebang in `packages/server/src/cli.ts` with a plain `#!/usr/bin/env node` shebang, using a small JS bootstrap wrapper for the `pi-dashboard` bin entry that resolves jiti at runtime
- Remove `tsx` from `package.json` dependencies
- ~~Add a shared helper to resolve pi's jiti register path (from pi's `node_modules`)~~ *(Already done — `packages/shared/src/resolve-jiti.ts` exports `resolveJitiImport()`)*

## Capabilities

### New Capabilities
- `jiti-loader`: Resolving and using pi's bundled jiti as the TypeScript loader for server spawning

### Modified Capabilities
- `dashboard-server`: Server startup changes from tsx to jiti loader (shebang and spawn args)
- `bridge-extension`: Extension server-launcher spawn args change from tsx to jiti
- `packaging`: tsx removed from dependencies

## Impact

- **Files**: `packages/server/src/cli.ts`, `packages/extension/src/server-launcher.ts` *(already migrated)*, `package.json`, new bin bootstrap
- **Dependencies**: `tsx` removed
- **Runtime**: Requires pi to be installed globally (already a prerequisite for the dashboard)
- **Risk**: Low — jiti verified to load the full `cli.ts status` command successfully; both tsx and jiti use esbuild-based transforms under the hood
