## Why

The RPC keeper sidecar (`packages/server/src/rpc-keeper/keeper.cjs`) spawns `pi` via bare PATH lookup (`child_process.spawn("pi", …)`). When the dashboard server is launched by the Electron app, the `PATH` passed through `buildSpawnEnv` does not include the bundle's `Resources/server/node_modules/.bin/` — where the bundled `pi` lives. The keeper therefore fails with `spawn pi ENOENT`, exits code 1, and session resume fails with:

> Resume failed: RPC keeper exited within crash window (code 1).

The symmetric non-keeper headless path (`spawnHeadless` at `process-manager.ts:459`) already resolves `pi` via `resolvePiCommand()` (the `ToolRegistry`) and works correctly. The keeper path was deliberately written to skip that resolution on the false premise that PATH alone would suffice (see comment at `process-manager.ts:451-454`).

## What Changes

- `spawnHeadlessViaKeeper` (`packages/server/src/process-manager.ts`): resolve `pi` via the existing `resolvePiCommand()` call and forward the resolved argv to the keeper. Fail fast with `PI_NOT_FOUND` if unresolved, matching the non-keeper branch.
- `KeeperManager.spawnKeeperFor` (`packages/server/src/rpc-keeper/keeper-manager.ts`): accept the resolved pi argv and forward it to the keeper subprocess via a new env var `PI_KEEPER_PI_CMD` (JSON-encoded `string[]`), mirroring the existing `PI_KEEPER_PI_ARGS` pattern.
- `keeper.cjs` (`packages/server/src/rpc-keeper/keeper.cjs`): when `PI_KEEPER_PI_CMD` is set, use its first element as `cmd` and the remainder prepended to `piArgs`. Fall back to bare `"pi"` when unset (preserves behavior for ad-hoc / manual keeper invocations and existing tests).
- Remove the stale "the keeper spawns pi internally via its own PATH lookup, so we do NOT need to resolve pi here" comment.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `rpc-keeper-sidecar`: keeper must invoke `pi` via an absolute path resolved by the server (via `ToolRegistry`), not via subprocess PATH lookup. Bare-`"pi"` fallback retained only when the resolved-path env var is unset (manual keeper invocation).

## Impact

- **Code**: `packages/server/src/process-manager.ts`, `packages/server/src/rpc-keeper/keeper-manager.ts`, `packages/server/src/rpc-keeper/keeper.cjs`, plus their tests.
- **Migration**: none. New env var is additive; absence preserves prior behavior.
- **Rollback**: revert the commit; no on-disk state, no protocol change.
- **Risk**: low. The non-keeper headless path has used `resolvePiCommand()` since inception without regressions; this change makes the keeper path symmetric.
- **Affected scenarios**: Electron-launched dashboard sessions resuming via the keeper (currently broken); standalone / bridge launches (unchanged — `pi` is already on PATH for those).
