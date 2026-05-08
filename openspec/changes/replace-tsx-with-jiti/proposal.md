## Why

Most of this proposal already shipped: the shared `resolveJitiImport()` helper exists at `packages/shared/src/resolve-jiti.ts`, and both the bridge extension (`packages/extension/src/server-launcher.ts`) and the server's daemon spawn (`packages/server/src/cli.ts:364`) already use jiti as the primary TypeScript loader, with tsx kept as an explicit fallback for non-pi environments (Electron managed install, standalone CLI without a pi session on PATH).

What remains is the **CLI bin entry**: `packages/server/src/cli.ts` still starts with `#!/usr/bin/env node --import tsx`, and `package.json` still wires `bin.pi-dashboard` directly at the `.ts` file. A shebang cannot resolve a dynamic jiti path, so the bin entry is the one site that still hard-requires tsx at parse time. Replacing it with a tiny JS bootstrap closes the migration without removing the tsx fallback.

## What Changes

- ~~Replace `--import tsx` with jiti in spawn sites~~ *(Already done — extension `server-launcher.ts` and server `cli.ts` daemon spawn both call `resolveJitiImport()`; Electron `server-lifecycle.ts` has the same path with tsx fallback)*
- ~~Add a shared helper to resolve pi's jiti register path~~ *(Already done — `packages/shared/src/resolve-jiti.ts` exports `resolveJitiImport()` with upstream `jiti` + legacy `@mariozechner/jiti` lookup)*
- Replace the `#!/usr/bin/env node --import tsx` shebang at `packages/server/src/cli.ts:1` with a plain `#!/usr/bin/env node` shebang
- Add `packages/server/bin/pi-dashboard.mjs` — a small ESM wrapper that calls `resolveJitiImport()` (with tsx fallback, mirroring the daemon spawn logic in `cli.ts:364`) and re-execs `node --import <loader> cli.ts <args>`
- Repoint `bin.pi-dashboard` in `packages/server/package.json` to the new `.mjs` wrapper
- ~~Remove `tsx` from dependencies~~ *(Out of scope — tsx is intentionally retained as a fallback loader for environments without pi on PATH; see `cli.ts:255` managed-install set, `cli.ts:366-377` runtime fallback, `server-lifecycle.ts:235-297` Electron fallback)*

## Capabilities

### Modified Capabilities
- `dashboard-server`: CLI bin entry switches from a tsx shebang to a JS bootstrap that resolves jiti at runtime
- `packaging`: `bin.pi-dashboard` repointed from `cli.ts` to `bin/pi-dashboard.mjs`

## Impact

- **Files**: `packages/server/src/cli.ts` (shebang only), `packages/server/bin/pi-dashboard.mjs` (new), `packages/server/package.json` (`bin` + `files`)
- **Dependencies**: unchanged — tsx stays as fallback
- **Runtime**: No behavior change for users with pi on PATH; tsx fallback path preserved for users without
- **Risk**: Low — wrapper logic mirrors the already-shipped daemon spawn resolver
