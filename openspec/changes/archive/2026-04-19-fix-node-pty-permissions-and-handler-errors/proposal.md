## Why

The "+ New Terminal" button silently fails in some installs because the bundled `node-pty` prebuild ships its `spawn-helper` binary without the execute bit. The existing `fix-pty-permissions.cjs` postinstall script was written for a non-hoisted layout (it looks in `packages/server/node_modules/node-pty`), but npm workspaces hoist `node-pty` to the repo-root `node_modules/`, so the script silently `chmod`s nothing. The failure is then hidden a second time by a catch-all `try { switch(msg.type) } catch {}` in `browser-gateway.ts` that swallows every handler exception with no log, making user-visible features look "dead" with zero diagnostics on the server.

This bug cost real debugging time today to find, and the same swallow pattern will keep hiding the next similar failure. Fix the immediate permission bug, fix the diagnostic blindspot, and make the postinstall robust to workspace hoisting.

## What Changes

- **Make `fix-pty-permissions.cjs` hoist-aware.** Locate `node-pty` via `require.resolve("node-pty/package.json")` (works regardless of whether it's hoisted or not) instead of a hardcoded `__dirname/../node_modules/...` path. Apply `chmod 0o755` to every `prebuilds/*/spawn-helper` found.
- **Run the script from the workspace root's `postinstall`**, not only from `packages/server/package.json`, so a fresh root `npm install` fixes permissions even before any workspace-specific install runs.
- **Stop silently swallowing handler exceptions in `browser-gateway.ts`.** Narrow the existing catch-all so it only catches `JSON.parse` errors (malformed frames). Thrown errors from message handlers SHALL be logged as `[browser-gw] handler error type=<msg.type>: <error>` and, where practical, surfaced to the originating WebSocket as an error response so the UI can react (e.g., toast).
- **Add a regression test** that asserts `spawn-helper` is executable for the current platform's prebuild directory after `npm install`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `terminal-emulator`: Add a requirement that terminal creation MUST succeed on a fresh `npm install` on supported platforms — i.e., the bundled `node-pty` prebuild binaries MUST be executable after install.
- `browser-gateway-decomposition`: Add a requirement that the browser WebSocket message dispatcher MUST log (and not silently swallow) exceptions thrown by individual message handlers. The catch-all SHALL be limited to frame-parse errors.

## Impact

- **Code**:
  - `packages/server/scripts/fix-pty-permissions.cjs` (rewritten to use `require.resolve`)
  - Root `package.json` (`postinstall` added)
  - `packages/server/src/browser-gateway.ts` (scope the try/catch, add handler error logging)
- **Tests**:
  - New test ensuring `spawn-helper` is executable after install
  - New test ensuring a throwing handler is logged (not swallowed)
- **Dependencies**: None. No new packages.
- **Operational**: Existing broken installs need a one-time `npm install` (or manual `chmod +x`) after the fix lands. No data migration, no API breakage.
- **Risk**: Low. The diagnostic change could surface pre-existing thrown errors in logs that were previously invisible — which is the point, but may look alarming on first restart.
